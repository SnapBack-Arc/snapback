// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SnapBackEscrow} from "../src/SnapBackEscrow.sol";

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

contract SnapBackEscrowTest is Test {
    MockUSDC usdc;
    SnapBackEscrow escrow;

    address buyer = address(0xB0B);
    address seller = address(0x5E11E5);
    address arbiter = address(0xA9B1);
    address keeper = address(0xCAFE);

    uint64 constant WINDOW = 1 days;
    uint256 constant BUDGET = 100e6;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new SnapBackEscrow(address(usdc), WINDOW, arbiter);
        usdc.mint(buyer, 1_000e6);
    }

    function _createFundedJob() internal returns (uint256 jobId) {
        vm.prank(buyer);
        jobId = escrow.createJob(seller, uint64(block.timestamp) + 7 days, "test job");
        vm.prank(seller);
        escrow.setBudget(jobId, BUDGET);
        vm.prank(buyer);
        escrow.fund(jobId);
    }

    function _createSubmittedJob() internal returns (uint256 jobId) {
        jobId = _createFundedJob();
        vm.prank(seller);
        escrow.submit(jobId, bytes32("deliverable"));
    }

    // ── job creation / budget / funding ────────────────────────

    function test_createJob_setsClientAndProvider() public {
        vm.prank(buyer);
        uint256 jobId = escrow.createJob(seller, uint64(block.timestamp) + 7 days, "job");
        SnapBackEscrow.Job memory j = escrow.getJob(jobId);
        assertEq(j.client, buyer);
        assertEq(j.provider, seller);
        assertEq(uint8(j.status), uint8(SnapBackEscrow.Status.Open));
    }

    function test_setBudget_onlyProvider() public {
        vm.prank(buyer);
        uint256 jobId = escrow.createJob(seller, uint64(block.timestamp) + 7 days, "job");
        vm.prank(buyer);
        vm.expectRevert(SnapBackEscrow.OnlyProvider.selector);
        escrow.setBudget(jobId, BUDGET);
    }

    function test_fund_pullsRealUsdcIntoContract() public {
        uint256 jobId = _createFundedJob();
        assertEq(usdc.balanceOf(address(escrow)), BUDGET);
        assertEq(usdc.balanceOf(buyer), 1_000e6 - BUDGET);
        SnapBackEscrow.Job memory j = escrow.getJob(jobId);
        assertEq(uint8(j.status), uint8(SnapBackEscrow.Status.Funded));
    }

    function test_fund_onlyClient() public {
        vm.prank(buyer);
        uint256 jobId = escrow.createJob(seller, uint64(block.timestamp) + 7 days, "job");
        vm.prank(seller);
        escrow.setBudget(jobId, BUDGET);
        vm.prank(seller);
        vm.expectRevert(SnapBackEscrow.OnlyClient.selector);
        escrow.fund(jobId);
    }

    function test_fund_revertsWithoutBudget() public {
        vm.prank(buyer);
        uint256 jobId = escrow.createJob(seller, uint64(block.timestamp) + 7 days, "job");
        vm.prank(buyer);
        vm.expectRevert(SnapBackEscrow.NoBudget.selector);
        escrow.fund(jobId);
    }

    // ── submit / accept window ─────────────────────────────────

    function test_submit_startsAcceptWindow() public {
        uint256 jobId = _createSubmittedJob();
        assertEq(escrow.acceptDeadline(jobId), uint64(block.timestamp) + WINDOW);
    }

    function test_submit_onlyProvider() public {
        uint256 jobId = _createFundedJob();
        vm.prank(buyer);
        vm.expectRevert(SnapBackEscrow.OnlyProvider.selector);
        escrow.submit(jobId, bytes32("x"));
    }

    // ── release (buyer-agent early approval) ───────────────────

    function test_release_paysProviderImmediately_beforeWindowElapses() public {
        uint256 jobId = _createSubmittedJob();
        // Window hasn't elapsed — release() must still work; this is exactly
        // the path validator-service.ts needs and autoRelease() can't serve.
        vm.prank(buyer);
        escrow.release(jobId, bytes32("approved"));
        assertEq(usdc.balanceOf(seller), BUDGET);
        SnapBackEscrow.Job memory j = escrow.getJob(jobId);
        assertEq(uint8(j.status), uint8(SnapBackEscrow.Status.Completed));
    }

    function test_release_onlyClient() public {
        uint256 jobId = _createSubmittedJob();
        vm.prank(seller);
        vm.expectRevert(SnapBackEscrow.OnlyClient.selector);
        escrow.release(jobId, bytes32("x"));
    }

    function test_release_blockedWhileDisputed() public {
        uint256 jobId = _createSubmittedJob();
        vm.prank(buyer);
        escrow.dispute(jobId, bytes32("contested"));
        vm.prank(buyer);
        vm.expectRevert(SnapBackEscrow.AlreadyDisputed.selector);
        escrow.release(jobId, bytes32("x"));
    }

    // ── autoRelease (keeper timeout) ───────────────────────────

    function test_autoRelease_revertsBeforeWindowElapses() public {
        uint256 jobId = _createSubmittedJob();
        vm.expectRevert(SnapBackEscrow.WindowNotElapsed.selector);
        escrow.autoRelease(jobId);
    }

    function test_autoRelease_afterWindow_paysProvider() public {
        uint256 jobId = _createSubmittedJob();
        vm.warp(block.timestamp + WINDOW);
        vm.prank(keeper); // permissionless: window elapsing is the authorization
        escrow.autoRelease(jobId);
        assertEq(usdc.balanceOf(seller), BUDGET);
    }

    function test_autoRelease_revertsWithoutSubmission() public {
        uint256 jobId = _createFundedJob();
        vm.expectRevert(SnapBackEscrow.NotSubmitted.selector);
        escrow.autoRelease(jobId);
    }

    // ── snapback ───────────────────────────────────────────────

    function test_snapback_withinWindow_refundsBuyer() public {
        uint256 jobId = _createSubmittedJob();
        vm.prank(buyer);
        escrow.snapback(jobId, bytes32("bad work"));
        assertEq(usdc.balanceOf(buyer), 1_000e6);
    }

    function test_snapback_afterWindow_reverts() public {
        uint256 jobId = _createSubmittedJob();
        vm.warp(block.timestamp + WINDOW);
        vm.prank(buyer);
        vm.expectRevert(SnapBackEscrow.WindowElapsed.selector);
        escrow.snapback(jobId, bytes32("too late"));
    }

    function test_snapback_onlyClient() public {
        uint256 jobId = _createSubmittedJob();
        vm.prank(seller);
        vm.expectRevert(SnapBackEscrow.OnlyClient.selector);
        escrow.snapback(jobId, bytes32("nope"));
    }

    // ── dispute ────────────────────────────────────────────────

    function test_dispute_freezesAutoRelease() public {
        uint256 jobId = _createSubmittedJob();
        vm.prank(buyer);
        escrow.dispute(jobId, bytes32("contested"));
        vm.warp(block.timestamp + WINDOW);
        vm.expectRevert(SnapBackEscrow.AlreadyDisputed.selector);
        escrow.autoRelease(jobId);
    }

    function test_resolveDispute_favorBuyer_refunds() public {
        uint256 jobId = _createSubmittedJob();
        vm.prank(buyer);
        escrow.dispute(jobId, bytes32("contested"));
        vm.prank(arbiter);
        escrow.resolveDispute(jobId, true, bytes32("verdict"));
        assertEq(usdc.balanceOf(buyer), 1_000e6);
    }

    function test_resolveDispute_favorSeller_pays() public {
        uint256 jobId = _createSubmittedJob();
        vm.prank(buyer);
        escrow.dispute(jobId, bytes32("contested"));
        vm.prank(arbiter);
        escrow.resolveDispute(jobId, false, bytes32("verdict"));
        assertEq(usdc.balanceOf(seller), BUDGET);
    }

    function test_resolveDispute_onlyArbiter() public {
        uint256 jobId = _createSubmittedJob();
        vm.prank(buyer);
        escrow.dispute(jobId, bytes32("contested"));
        vm.prank(buyer);
        vm.expectRevert(SnapBackEscrow.OnlyArbiter.selector);
        escrow.resolveDispute(jobId, true, bytes32("verdict"));
    }

    function test_resolveDispute_revertsWhenNotDisputed() public {
        uint256 jobId = _createSubmittedJob();
        vm.prank(arbiter);
        vm.expectRevert(SnapBackEscrow.NotDisputed.selector);
        escrow.resolveDispute(jobId, true, bytes32("verdict"));
    }

    // ── claimExpired ────────────────────────────────────────────

    function test_claimExpired_refundsBuyer_ifProviderNeverSubmitted() public {
        vm.prank(buyer);
        uint256 jobId = escrow.createJob(seller, uint64(block.timestamp) + 1 hours, "job");
        vm.prank(seller);
        escrow.setBudget(jobId, BUDGET);
        vm.prank(buyer);
        escrow.fund(jobId);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(buyer);
        escrow.claimExpired(jobId);
        assertEq(usdc.balanceOf(buyer), 1_000e6);
    }

    function test_claimExpired_revertsBeforeExpiry() public {
        uint256 jobId = _createFundedJob();
        vm.prank(buyer);
        vm.expectRevert(SnapBackEscrow.NotExpired.selector);
        escrow.claimExpired(jobId);
    }

    function test_claimExpired_onlyClient() public {
        vm.prank(buyer);
        uint256 jobId = escrow.createJob(seller, uint64(block.timestamp) + 1 hours, "job");
        vm.prank(seller);
        escrow.setBudget(jobId, BUDGET);
        vm.prank(buyer);
        escrow.fund(jobId);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(seller);
        vm.expectRevert(SnapBackEscrow.OnlyClient.selector);
        escrow.claimExpired(jobId);
    }

    function testFuzz_autoRelease_onlyAfterDeadline(uint32 elapsed) public {
        uint256 jobId = _createSubmittedJob();
        uint64 deadline = escrow.acceptDeadline(jobId);
        vm.warp(block.timestamp + elapsed);
        if (block.timestamp >= deadline) {
            escrow.autoRelease(jobId);
            assertEq(usdc.balanceOf(seller), BUDGET);
        } else {
            vm.expectRevert(SnapBackEscrow.WindowNotElapsed.selector);
            escrow.autoRelease(jobId);
        }
    }
}
