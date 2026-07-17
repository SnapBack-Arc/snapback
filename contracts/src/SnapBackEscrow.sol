// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IACPHook} from "./interfaces/IACPHook.sol";
import {IAgenticCommerce, JobStatus} from "./interfaces/IAgenticCommerce.sol";

/// @title SnapBackEscrow
/// @notice SnapBack semantics layered on ERC-8183 AgenticCommerce jobs.
///
/// @dev DESIGN: ERC-8183 already custodies escrow (fund → submit → complete /
///      reject / claimRefund). This contract does NOT hold funds and does not
///      re-implement lock/release/refund. It is an ERC-8183 **hook**: jobs are
///      created with `createJob(..., hook = address(this))`, and this contract
///      adds the state that ERC-8183 leaves to the application:
///
///        * an accept window that starts when the provider submits,
///        * keeper-driven auto-release once that window lapses,
///        * a dispute that freezes auto-release pending a verdict.
///
///      Settlement itself is always delegated back to AgenticCommerce
///      (`complete` / `reject`), so funds only ever move through the audited
///      escrow. Note ERC-8183 makes `claimRefund` non-hookable on purpose, so a
///      buyer's post-expiry refund can never be blocked by this contract.
contract SnapBackEscrow is IACPHook {
    // ── errors ─────────────────────────────────────────────────
    error OnlyCommerce();
    error OnlyBuyer();
    error OnlyArbiter();
    error NotSubmitted();
    error WindowNotElapsed();
    error WindowElapsed();
    error AlreadyDisputed();
    error NotDisputed();
    error NotSettled();

    // ── events ─────────────────────────────────────────────────
    event AcceptWindowStarted(uint256 indexed jobId, uint64 acceptDeadline);
    event AutoReleased(uint256 indexed jobId);
    event SnappedBack(uint256 indexed jobId, bytes32 reason);
    event Disputed(uint256 indexed jobId, address indexed by, bytes32 reason);
    event DisputeResolved(uint256 indexed jobId, bool favorBuyer);

    /// @notice Per-job snapback state. Funds live in AgenticCommerce, not here.
    struct Escrow {
        uint64 submittedAt;
        uint64 acceptDeadline;
        bool disputed;
        bool settled;
    }

    IAgenticCommerce public immutable commerce;

    /// @notice Default window a buyer has to snap a payment back after submission.
    uint64 public immutable defaultAcceptWindow;

    /// @notice Resolves disputes (the JudgeRegistry).
    address public arbiter;

    address public immutable owner;

    mapping(uint256 jobId => Escrow) public escrows;

    modifier onlyCommerce() {
        if (msg.sender != address(commerce)) revert OnlyCommerce();
        _;
    }

    constructor(address commerce_, uint64 defaultAcceptWindow_, address arbiter_) {
        commerce = IAgenticCommerce(commerce_);
        defaultAcceptWindow = defaultAcceptWindow_;
        arbiter = arbiter_;
        owner = msg.sender;
    }

    function setArbiter(address arbiter_) external {
        if (msg.sender != owner) revert OnlyArbiter();
        arbiter = arbiter_;
    }

    // ── ERC-165 ────────────────────────────────────────────────

    /// @dev AgenticCommerce.createJob gates non-zero hooks behind
    ///      `ERC165Checker.supportsInterface(hook, type(IACPHook).interfaceId)`,
    ///      which itself requires declaring support for ERC-165 (0x01ffc9a7)
    ///      before it will even check the specific interface. Without this,
    ///      every createJob call using this hook reverts with InvalidJob().
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IACPHook).interfaceId || interfaceId == 0x01ffc9a7;
    }

    // ── ERC-8183 hook callbacks ────────────────────────────────

    /// @inheritdoc IACPHook
    /// @dev Blocks a `complete` while a dispute is open — settlement must go
    ///      through the arbiter's verdict instead of the buyer/evaluator.
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata) external view onlyCommerce {
        if (selector == IAgenticCommerce.complete.selector && escrows[jobId].disputed) {
            revert AlreadyDisputed();
        }
    }

    /// @inheritdoc IACPHook
    /// @dev Starts the accept window when the provider submits, and marks the
    ///      job settled once AgenticCommerce completes or rejects it.
    function afterAction(uint256 jobId, bytes4 selector, bytes calldata) external onlyCommerce {
        if (selector == IAgenticCommerce.submit.selector) {
            uint64 deadline = uint64(block.timestamp) + defaultAcceptWindow;
            escrows[jobId].submittedAt = uint64(block.timestamp);
            escrows[jobId].acceptDeadline = deadline;
            emit AcceptWindowStarted(jobId, deadline);
        } else if (
            selector == IAgenticCommerce.complete.selector || selector == IAgenticCommerce.reject.selector
        ) {
            escrows[jobId].settled = true;
        }
    }

    // ── snapback / auto-release ────────────────────────────────

    /// @notice Buyer snaps the payment back during the accept window.
    /// @dev Delegates to AgenticCommerce.reject — this contract never moves funds.
    function snapback(uint256 jobId, bytes32 reason) external {
        Escrow memory e = escrows[jobId];
        if (e.submittedAt == 0) revert NotSubmitted();
        if (e.disputed) revert AlreadyDisputed();
        if (block.timestamp >= e.acceptDeadline) revert WindowElapsed();
        if (commerce.getJob(jobId).client != msg.sender) revert OnlyBuyer();

        emit SnappedBack(jobId, reason);
        commerce.reject(jobId, reason, "");
    }

    /// @notice Keeper call: auto-release once the accept window lapses.
    /// @dev Permissionless — the window elapsing is the authorization. A job
    ///      under dispute is frozen until the arbiter rules.
    function autoRelease(uint256 jobId) external {
        Escrow memory e = escrows[jobId];
        if (e.submittedAt == 0) revert NotSubmitted();
        if (e.disputed) revert AlreadyDisputed();
        if (block.timestamp < e.acceptDeadline) revert WindowNotElapsed();

        emit AutoReleased(jobId);
        commerce.complete(jobId, bytes32("auto-release"), "");
    }

    /// @notice Buyer opens a dispute, freezing auto-release until a verdict.
    function dispute(uint256 jobId, bytes32 reason) external {
        Escrow storage e = escrows[jobId];
        if (e.submittedAt == 0) revert NotSubmitted();
        if (e.disputed) revert AlreadyDisputed();
        if (block.timestamp >= e.acceptDeadline) revert WindowElapsed();
        if (commerce.getJob(jobId).client != msg.sender) revert OnlyBuyer();

        e.disputed = true;
        emit Disputed(jobId, msg.sender, reason);
    }

    /// @notice Arbiter (JudgeRegistry) settles a disputed job.
    function resolveDispute(uint256 jobId, bool favorBuyer, bytes32 reason) external {
        if (msg.sender != arbiter) revert OnlyArbiter();
        Escrow storage e = escrows[jobId];
        if (!e.disputed) revert NotDisputed();

        e.disputed = false;
        emit DisputeResolved(jobId, favorBuyer);

        if (favorBuyer) {
            commerce.reject(jobId, reason, "");
        } else {
            commerce.complete(jobId, reason, "");
        }
    }

    // ── views ──────────────────────────────────────────────────

    function acceptDeadline(uint256 jobId) external view returns (uint64) {
        return escrows[jobId].acceptDeadline;
    }

    function isAutoReleasable(uint256 jobId) external view returns (bool) {
        Escrow memory e = escrows[jobId];
        return e.submittedAt != 0 && !e.disputed && !e.settled && block.timestamp >= e.acceptDeadline;
    }
}
