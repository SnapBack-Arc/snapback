// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {JudgeRegistry} from "../src/JudgeRegistry.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    function transferFrom(address from, address to, uint256 amt) external returns (bool) {
        require(balanceOf[from] >= amt, "bal");
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
        return true;
    }

    function transfer(address to, uint256 amt) external returns (bool) {
        require(balanceOf[msg.sender] >= amt, "bal");
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return true;
    }
}

contract MockIdentity {
    mapping(uint256 => address) public owners;

    function setOwner(uint256 id, address o) external {
        owners[id] = o;
    }

    function ownerOf(uint256 id) external view returns (address) {
        return owners[id];
    }

    function register(string calldata) external pure returns (uint256) {
        return 0;
    }

    function tokenURI(uint256) external pure returns (string memory) {
        return "";
    }
}

contract MockReputation {
    uint256 public calls;
    int128 public lastScore;

    function giveFeedback(
        uint256,
        int128 score,
        uint8,
        string calldata,
        string calldata,
        string calldata,
        string calldata,
        bytes32
    ) external {
        calls++;
        lastScore = score;
    }
}

contract MockEscrow {
    bool public resolved;
    bool public favorBuyer;

    function resolveDispute(uint256, bool _favorBuyer, bytes32) external {
        resolved = true;
        favorBuyer = _favorBuyer;
    }
}

contract JudgeRegistryTest is Test {
    MockUSDC usdc;
    MockIdentity identity;
    MockReputation reputation;
    MockEscrow escrow;
    JudgeRegistry judges;

    uint256 constant MIN_BOND = 10e6;
    uint256 constant JOB = 42;
    uint256 constant AGENT = 7;

    address[] pool;

    function setUp() public {
        usdc = new MockUSDC();
        identity = new MockIdentity();
        reputation = new MockReputation();
        escrow = new MockEscrow();
        judges = new JudgeRegistry(
            address(usdc), address(identity), address(reputation), address(escrow), MIN_BOND
        );
        identity.setOwner(AGENT, address(0xA9E7)); // not the registry
        // Bond 8 judges so 3- and 5-panels can both be drawn.
        for (uint160 i = 1; i <= 8; i++) {
            address j = address(i + 0x1000);
            pool.push(j);
            usdc.mint(j, MIN_BOND);
            vm.prank(j);
            judges.stakeBond(MIN_BOND);
        }
    }

    function _panel() internal view returns (address[] memory) {
        return judges.panelJudges(JOB);
    }

    // ── bonding / pool ─────────────────────────────────────────

    function test_stakeBond_joinsPool() public view {
        assertEq(judges.judgePoolSize(), 8);
    }

    function test_unbond_belowMin_leavesPool() public {
        vm.prank(pool[0]);
        judges.unbond(MIN_BOND);
        assertEq(judges.judgePoolSize(), 7);
        assertFalse(judges.inPool(pool[0]));
    }

    function test_slash_takesBondAndMayLeavePool() public {
        judges.slash(pool[0], MIN_BOND, bytes32("bad"));
        assertEq(judges.bonds(pool[0]), 0);
        assertEq(judges.judgePoolSize(), 7);
    }

    // ── panel selection ────────────────────────────────────────

    function test_selectPanel_drawsThreeDistinct() public {
        judges.selectPanel(JOB);
        address[] memory p = _panel();
        assertEq(p.length, 3);
        assertTrue(p[0] != p[1] && p[1] != p[2] && p[0] != p[2]);
        for (uint256 i = 0; i < p.length; i++) assertTrue(judges.onPanel(JOB, p[i]));
    }

    function test_selectPanel_twice_reverts() public {
        judges.selectPanel(JOB);
        vm.expectRevert(JudgeRegistry.PanelExists.selector);
        judges.selectPanel(JOB);
    }

    function test_vote_nonPanelMember_reverts() public {
        judges.selectPanel(JOB);
        address outsider;
        for (uint256 i = 0; i < pool.length; i++) {
            if (!judges.onPanel(JOB, pool[i])) {
                outsider = pool[i];
                break;
            }
        }
        vm.prank(outsider);
        vm.expectRevert(JudgeRegistry.NotOnPanel.selector);
        judges.vote(JOB, true);
    }

    function test_vote_twice_reverts() public {
        judges.selectPanel(JOB);
        address j = _panel()[0];
        vm.prank(j);
        judges.vote(JOB, true);
        vm.prank(j);
        vm.expectRevert(JudgeRegistry.AlreadyVoted.selector);
        judges.vote(JOB, false);
    }

    // ── 2-of-3 majority ────────────────────────────────────────

    function test_twoOfThree_favorBuyer_settles() public {
        judges.selectPanel(JOB);
        address[] memory p = _panel();
        vm.prank(p[0]);
        judges.vote(JOB, true);
        vm.prank(p[1]);
        judges.vote(JOB, true);

        judges.finalize(JOB, AGENT, bytes32("v"));
        assertTrue(escrow.resolved());
        assertTrue(escrow.favorBuyer());
        assertEq(reputation.calls(), 1);
        assertEq(reputation.lastScore(), 0); // buyer won ⇒ seller agent scored 0
    }

    function test_twoOfThree_favorSeller_settles() public {
        judges.selectPanel(JOB);
        address[] memory p = _panel();
        vm.prank(p[0]);
        judges.vote(JOB, false);
        vm.prank(p[1]);
        judges.vote(JOB, false);

        judges.finalize(JOB, AGENT, bytes32("v"));
        assertTrue(escrow.resolved());
        assertFalse(escrow.favorBuyer());
        assertEq(reputation.lastScore(), 100);
    }

    function test_majority_settlesBeforeDeadline() public {
        // 2 of 3 is decisive immediately — no need to wait for the 3rd vote.
        judges.selectPanel(JOB);
        address[] memory p = _panel();
        vm.prank(p[0]);
        judges.vote(JOB, true);
        vm.prank(p[1]);
        judges.vote(JOB, true);
        judges.finalize(JOB, AGENT, bytes32("v")); // does not revert with VotingOpen
        assertTrue(escrow.resolved());
    }

    function test_finalize_undecidedBeforeDeadline_reverts() public {
        judges.selectPanel(JOB);
        vm.prank(_panel()[0]);
        judges.vote(JOB, true); // 1-0, no majority yet
        vm.expectRevert(JudgeRegistry.VotingOpen.selector);
        judges.finalize(JOB, AGENT, bytes32("v"));
    }

    // ── escalation 3 → 5 ───────────────────────────────────────

    function test_split_escalatesToFive() public {
        judges.selectPanel(JOB);
        address[] memory p = _panel();
        // 1-1 with one judge silent ⇒ no majority once voting closes.
        vm.prank(p[0]);
        judges.vote(JOB, true);
        vm.prank(p[1]);
        judges.vote(JOB, false);
        vm.warp(block.timestamp + 13 hours);

        judges.finalize(JOB, AGENT, bytes32("v"));
        assertFalse(escrow.resolved(), "must not settle on a split");
        assertEq(_panel().length, 5, "panel escalates to 5");
        (uint8 size,,,, bool escalated,) = judges.panels(JOB);
        assertEq(size, 5);
        assertTrue(escalated);
        assertEq(judges.threshold(JOB), 3, "3-of-5 after escalation");
    }

    function test_escalatedPanel_threeOfFive_settles() public {
        judges.selectPanel(JOB);
        address[] memory p3 = _panel();
        vm.prank(p3[0]);
        judges.vote(JOB, true);
        vm.prank(p3[1]);
        judges.vote(JOB, false);
        vm.warp(block.timestamp + 13 hours);
        judges.finalize(JOB, AGENT, bytes32("v")); // escalate

        address[] memory p5 = _panel();
        // Existing 1-1 plus two more for the seller ⇒ 3 of 5 for the seller.
        vm.prank(p5[3]);
        judges.vote(JOB, false);
        vm.prank(p5[4]);
        judges.vote(JOB, false);

        judges.finalize(JOB, AGENT, bytes32("v"));
        assertTrue(escrow.resolved());
        assertFalse(escrow.favorBuyer(), "3-of-5 for seller");
    }

    // ── tie-break: refund the buyer ────────────────────────────

    function test_fivePanelStillSplit_tieBreaksToBuyer() public {
        judges.selectPanel(JOB);
        address[] memory p3 = _panel();
        vm.prank(p3[0]);
        judges.vote(JOB, true);
        vm.prank(p3[1]);
        judges.vote(JOB, false);
        vm.warp(block.timestamp + 13 hours);
        judges.finalize(JOB, AGENT, bytes32("v")); // escalate to 5

        address[] memory p5 = _panel();
        // 2-2 with one silent ⇒ still no 3-of-5 majority.
        vm.prank(p5[3]);
        judges.vote(JOB, true);
        vm.prank(p5[4]);
        judges.vote(JOB, false);
        vm.warp(block.timestamp + 13 hours);

        judges.finalize(JOB, AGENT, bytes32("v"));
        assertTrue(escrow.resolved());
        assertTrue(escrow.favorBuyer(), "tie-break must refund the buyer");
    }

    function test_finalize_twice_reverts() public {
        judges.selectPanel(JOB);
        address[] memory p = _panel();
        vm.prank(p[0]);
        judges.vote(JOB, true);
        vm.prank(p[1]);
        judges.vote(JOB, true);
        judges.finalize(JOB, AGENT, bytes32("v"));
        vm.expectRevert(JudgeRegistry.AlreadyResolved.selector);
        judges.finalize(JOB, AGENT, bytes32("v"));
    }

    // ── ERC-8004 self-reputation rule ──────────────────────────

    function test_reputationSkipped_whenRegistryOwnsAgent() public {
        identity.setOwner(AGENT, address(judges)); // registry owns the agent
        judges.selectPanel(JOB);
        address[] memory p = _panel();
        vm.prank(p[0]);
        judges.vote(JOB, true);
        vm.prank(p[1]);
        judges.vote(JOB, true);

        judges.finalize(JOB, AGENT, bytes32("v"));
        assertTrue(escrow.resolved(), "settlement must not be blocked");
        assertEq(reputation.calls(), 0, "self-rating must be skipped");
    }
}
