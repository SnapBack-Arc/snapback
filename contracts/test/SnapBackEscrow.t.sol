// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SnapBackEscrow} from "../src/SnapBackEscrow.sol";
import {IAgenticCommerce, Job} from "../src/interfaces/IAgenticCommerce.sol";
import {IACPHook} from "../src/interfaces/IACPHook.sol";

/// @dev Minimal stand-in for the ERC-8183 reference implementation: records
///      settlement calls and drives the hook the way AgenticCommerce would.
contract MockCommerce {
    Job public job;
    bool public completed;
    bool public rejected;
    bytes32 public lastReason;
    IACPHook public hook;

    function setJob(address client, address provider, address hook_) external {
        job.client = client;
        job.provider = provider;
        job.hook = hook_;
        hook = IACPHook(hook_);
    }

    function complete(uint256 jobId, bytes32 reason, bytes calldata) external {
        hook.beforeAction(jobId, IAgenticCommerce.complete.selector, "");
        completed = true;
        lastReason = reason;
        hook.afterAction(jobId, IAgenticCommerce.complete.selector, "");
    }

    function reject(uint256 jobId, bytes32 reason, bytes calldata) external {
        rejected = true;
        lastReason = reason;
        hook.afterAction(jobId, IAgenticCommerce.reject.selector, "");
    }

    function getJob(uint256) external view returns (Job memory) {
        return job;
    }

    /// @dev Simulate the provider submitting, which fires the hook's afterAction.
    function fireSubmit(uint256 jobId) external {
        hook.afterAction(jobId, IAgenticCommerce.submit.selector, "");
    }
}

contract SnapBackEscrowTest is Test {
    MockCommerce commerce;
    SnapBackEscrow escrow;

    address buyer = address(0xB0B);
    address seller = address(0x5E11E5);
    address arbiter = address(0xA9B1);
    address keeper = address(0xCAFE);

    uint64 constant WINDOW = 1 days;
    uint256 constant JOB_ID = 1;

    function setUp() public {
        commerce = new MockCommerce();
        escrow = new SnapBackEscrow(address(commerce), WINDOW, arbiter);
        commerce.setJob(buyer, seller, address(escrow));
    }

    function _submit() internal {
        commerce.fireSubmit(JOB_ID);
    }

    // ── ERC-165 ────────────────────────────────────────────────

    /// @dev AgenticCommerce.createJob gates hooks behind
    ///      ERC165Checker.supportsInterface, which first requires
    ///      supportsInterface(0x01ffc9a7) == true before checking the specific
    ///      interface — without both, createJob reverts InvalidJob() for every
    ///      job that uses this hook.
    function test_supportsInterface_declaresERC165AndIACPHook() public view {
        assertTrue(escrow.supportsInterface(0x01ffc9a7));
        assertTrue(escrow.supportsInterface(type(IACPHook).interfaceId));
    }

    function test_supportsInterface_rejectsInvalidSentinel() public view {
        assertFalse(escrow.supportsInterface(0xffffffff));
    }

    // ── accept window ──────────────────────────────────────────

    function test_submit_startsAcceptWindow() public {
        _submit();
        assertEq(escrow.acceptDeadline(JOB_ID), uint64(block.timestamp) + WINDOW);
    }

    function test_hookCallbacks_onlyFromCommerce() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(SnapBackEscrow.OnlyCommerce.selector);
        escrow.afterAction(JOB_ID, IAgenticCommerce.submit.selector, "");
    }

    // ── auto-release ───────────────────────────────────────────

    function test_autoRelease_revertsBeforeWindowElapses() public {
        _submit();
        vm.expectRevert(SnapBackEscrow.WindowNotElapsed.selector);
        escrow.autoRelease(JOB_ID);
    }

    function test_autoRelease_afterWindow_completesViaCommerce() public {
        _submit();
        vm.warp(block.timestamp + WINDOW);
        vm.prank(keeper); // permissionless: window elapsing is the authorization
        escrow.autoRelease(JOB_ID);
        assertTrue(commerce.completed());
        assertFalse(commerce.rejected());
    }

    function test_autoRelease_revertsWithoutSubmission() public {
        vm.expectRevert(SnapBackEscrow.NotSubmitted.selector);
        escrow.autoRelease(JOB_ID);
    }

    // ── snapback ───────────────────────────────────────────────

    function test_snapback_withinWindow_rejectsViaCommerce() public {
        _submit();
        vm.prank(buyer);
        escrow.snapback(JOB_ID, bytes32("bad work"));
        assertTrue(commerce.rejected());
        assertFalse(commerce.completed());
    }

    function test_snapback_afterWindow_reverts() public {
        _submit();
        vm.warp(block.timestamp + WINDOW);
        vm.prank(buyer);
        vm.expectRevert(SnapBackEscrow.WindowElapsed.selector);
        escrow.snapback(JOB_ID, bytes32("too late"));
    }

    function test_snapback_onlyBuyer() public {
        _submit();
        vm.prank(seller);
        vm.expectRevert(SnapBackEscrow.OnlyBuyer.selector);
        escrow.snapback(JOB_ID, bytes32("nope"));
    }

    // ── dispute ────────────────────────────────────────────────

    function test_dispute_freezesAutoRelease() public {
        _submit();
        vm.prank(buyer);
        escrow.dispute(JOB_ID, bytes32("contested"));
        vm.warp(block.timestamp + WINDOW);
        // Window elapsed, but the dispute must freeze the keeper path.
        vm.expectRevert(SnapBackEscrow.AlreadyDisputed.selector);
        escrow.autoRelease(JOB_ID);
    }

    function test_dispute_blocksDirectComplete() public {
        _submit();
        vm.prank(buyer);
        escrow.dispute(JOB_ID, bytes32("contested"));
        // beforeAction must reject a complete while disputed.
        vm.expectRevert(SnapBackEscrow.AlreadyDisputed.selector);
        commerce.complete(JOB_ID, bytes32("sneaky"), "");
    }

    function test_resolveDispute_favorBuyer_rejects() public {
        _submit();
        vm.prank(buyer);
        escrow.dispute(JOB_ID, bytes32("contested"));
        vm.prank(arbiter);
        escrow.resolveDispute(JOB_ID, true, bytes32("verdict"));
        assertTrue(commerce.rejected());
    }

    function test_resolveDispute_favorSeller_completes() public {
        _submit();
        vm.prank(buyer);
        escrow.dispute(JOB_ID, bytes32("contested"));
        vm.prank(arbiter);
        escrow.resolveDispute(JOB_ID, false, bytes32("verdict"));
        assertTrue(commerce.completed());
    }

    function test_resolveDispute_onlyArbiter() public {
        _submit();
        vm.prank(buyer);
        escrow.dispute(JOB_ID, bytes32("contested"));
        vm.prank(buyer);
        vm.expectRevert(SnapBackEscrow.OnlyArbiter.selector);
        escrow.resolveDispute(JOB_ID, true, bytes32("verdict"));
    }

    function testFuzz_autoRelease_onlyAfterDeadline(uint32 elapsed) public {
        _submit();
        uint64 deadline = escrow.acceptDeadline(JOB_ID);
        vm.warp(block.timestamp + elapsed);
        if (block.timestamp >= deadline) {
            escrow.autoRelease(JOB_ID);
            assertTrue(commerce.completed());
        } else {
            vm.expectRevert(SnapBackEscrow.WindowNotElapsed.selector);
            escrow.autoRelease(JOB_ID);
        }
    }
}
