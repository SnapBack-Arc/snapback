// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title SnapBackEscrow
/// @notice Standalone task escrow with snapback semantics — buyer and seller
///         wallets call this contract directly; no external job-settlement
///         contract is involved.
///
/// @dev ARCHITECTURE CHANGE (from the ERC-8183/AgenticCommerce-hook design):
///      the original SnapBackEscrow was a *hook* on AgenticCommerce.createJob
///      and never held funds itself — settlement was always delegated back to
///      AgenticCommerce's own complete/reject. That required AgenticCommerce's
///      ADMIN_ROLE holder (a third party we don't control — verified on-chain:
///      platformTreasury() on the deployed AgenticCommerce equals the
///      ADMIN_ROLE holder, and it isn't our deployer) to whitelist this
///      contract's address via setHookWhitelist, which every real createJob
///      call reverts without (HookNotWhitelisted()). No self-service path for
///      that exists anywhere in the Arc docs — every documented example uses
///      hook = address(0). This version holds USDC directly and implements
///      its own job lifecycle, so it works without any third-party approval.
///
///      Preserved from the original: the accept window, keeper-driven
///      permissionless autoRelease, dispute-freeze, and
///      resolveDispute(jobId, favorBuyer, reason) — JudgeRegistry calls this
///      exact signature and needed zero changes to keep working against this
///      contract (see setEscrow in the deploy script).
///
///      NEW here — two gaps the AgenticCommerce integration used to cover
///      for free, now this contract's own responsibility:
///        * release() — a distinct buyer-agent-gated early-release path. The
///          original design conflated "validator approved" with "keeper
///          timeout" under one autoRelease() call that unconditionally
///          required the accept window to have elapsed — which the
///          validator's approve path (lib/validator-service.ts) would have
///          violated every single time it actually ran on-chain. That bug
///          was invisible until now only because on-chain execution never
///          got this far.
///        * claimExpired() — AgenticCommerce's own claimRefund was
///          deliberately non-hookable so a buyer could never be blocked from
///          reclaiming funds if a provider never delivered. A standalone
///          contract has to provide that guarantee itself, or funds could
///          get stuck forever against an unresponsive provider.
contract SnapBackEscrow {
    // ── errors ─────────────────────────────────────────────────
    error OnlyClient();
    error OnlyProvider();
    error OnlyArbiter();
    error OnlyOwner();
    error TransferFailed();
    error NotOpen();
    error NotFunded();
    error NotSubmitted();
    error WindowNotElapsed();
    error WindowElapsed();
    error AlreadyDisputed();
    error NotDisputed();
    error NoBudget();
    error NotExpired();
    error ZeroAddress();

    enum Status {
        Open, // created, no budget yet
        Funded, // budget set + USDC locked
        Submitted, // provider delivered; accept window running
        Completed, // paid to provider
        Rejected // refunded to client

    }

    struct Job {
        address client;
        address provider;
        uint256 budget;
        uint64 expiredAt;
        uint64 submittedAt;
        uint64 acceptDeadline;
        Status status;
        bool disputed;
    }

    // ── events ─────────────────────────────────────────────────
    event JobCreated(
        uint256 indexed jobId, address indexed client, address indexed provider, uint64 expiredAt, string description
    );
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event Funded(uint256 indexed jobId, uint256 amount);
    event Submitted(uint256 indexed jobId, bytes32 deliverableHash, uint64 acceptDeadline);
    event Released(uint256 indexed jobId, bytes32 reason);
    event AutoReleased(uint256 indexed jobId);
    event SnappedBack(uint256 indexed jobId, bytes32 reason);
    event Disputed(uint256 indexed jobId, address indexed by, bytes32 reason);
    event DisputeResolved(uint256 indexed jobId, bool favorBuyer, bytes32 reason);
    event ExpiredClaimed(uint256 indexed jobId);

    IERC20 public immutable usdc;

    /// @notice Default window a buyer has to snap a payment back / dispute
    ///         after the provider submits.
    uint64 public immutable defaultAcceptWindow;

    /// @notice Resolves disputes (the JudgeRegistry).
    address public arbiter;

    address public immutable owner;

    uint256 public jobCounter;
    mapping(uint256 jobId => Job) public jobs;

    modifier onlyClient(uint256 jobId) {
        if (msg.sender != jobs[jobId].client) revert OnlyClient();
        _;
    }

    constructor(address usdc_, uint64 defaultAcceptWindow_, address arbiter_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
        defaultAcceptWindow = defaultAcceptWindow_;
        arbiter = arbiter_;
        owner = msg.sender;
    }

    function setArbiter(address arbiter_) external {
        if (msg.sender != owner) revert OnlyOwner();
        arbiter = arbiter_;
    }

    // ── job lifecycle ──────────────────────────────────────────

    /// @notice Buyer commissions a job. No funds move yet.
    function createJob(address provider, uint64 expiredAt, string calldata description)
        external
        returns (uint256 jobId)
    {
        if (provider == address(0)) revert ZeroAddress();
        jobId = ++jobCounter;
        jobs[jobId] = Job({
            client: msg.sender,
            provider: provider,
            budget: 0,
            expiredAt: expiredAt,
            submittedAt: 0,
            acceptDeadline: 0,
            status: Status.Open,
            disputed: false
        });
        emit JobCreated(jobId, msg.sender, provider, expiredAt, description);
    }

    /// @notice Provider sets the price before funding.
    function setBudget(uint256 jobId, uint256 amount) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.provider) revert OnlyProvider();
        if (j.status != Status.Open) revert NotOpen();
        j.budget = amount;
        emit BudgetSet(jobId, amount);
    }

    /// @notice THE LOCK: buyer funds the job. Caller must have approved this
    ///         contract for `budget` beforehand.
    function fund(uint256 jobId) external onlyClient(jobId) {
        Job storage j = jobs[jobId];
        if (j.status != Status.Open) revert NotOpen();
        if (j.budget == 0) revert NoBudget();
        j.status = Status.Funded;
        emit Funded(jobId, j.budget);
        if (!usdc.transferFrom(msg.sender, address(this), j.budget)) revert TransferFailed();
    }

    /// @notice Provider delivers — starts the accept window.
    function submit(uint256 jobId, bytes32 deliverableHash) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.provider) revert OnlyProvider();
        if (j.status != Status.Funded) revert NotFunded();
        uint64 deadline = uint64(block.timestamp) + defaultAcceptWindow;
        j.submittedAt = uint64(block.timestamp);
        j.acceptDeadline = deadline;
        j.status = Status.Submitted;
        emit Submitted(jobId, deliverableHash, deadline);
    }

    // ── settlement ─────────────────────────────────────────────

    /// @notice Buyer (agent) approves early — pays the provider now, without
    ///         waiting for the accept window to lapse.
    function release(uint256 jobId, bytes32 reason) external onlyClient(jobId) {
        Job storage j = jobs[jobId];
        if (j.status != Status.Submitted) revert NotSubmitted();
        if (j.disputed) revert AlreadyDisputed();
        j.status = Status.Completed;
        emit Released(jobId, reason);
        if (!usdc.transfer(j.provider, j.budget)) revert TransferFailed();
    }

    /// @notice Keeper call: auto-release once the accept window lapses.
    /// @dev Permissionless — the window elapsing is the authorization. A job
    ///      under dispute is frozen until the arbiter rules.
    function autoRelease(uint256 jobId) external {
        Job storage j = jobs[jobId];
        if (j.status != Status.Submitted) revert NotSubmitted();
        if (j.disputed) revert AlreadyDisputed();
        if (block.timestamp < j.acceptDeadline) revert WindowNotElapsed();
        j.status = Status.Completed;
        emit AutoReleased(jobId);
        if (!usdc.transfer(j.provider, j.budget)) revert TransferFailed();
    }

    /// @notice Buyer snaps the payment back during the accept window.
    function snapback(uint256 jobId, bytes32 reason) external onlyClient(jobId) {
        Job storage j = jobs[jobId];
        if (j.status != Status.Submitted) revert NotSubmitted();
        if (j.disputed) revert AlreadyDisputed();
        if (block.timestamp >= j.acceptDeadline) revert WindowElapsed();
        j.status = Status.Rejected;
        emit SnappedBack(jobId, reason);
        if (!usdc.transfer(j.client, j.budget)) revert TransferFailed();
    }

    /// @notice Buyer opens a dispute, freezing auto-release until a verdict.
    function dispute(uint256 jobId, bytes32 reason) external onlyClient(jobId) {
        Job storage j = jobs[jobId];
        if (j.status != Status.Submitted) revert NotSubmitted();
        if (j.disputed) revert AlreadyDisputed();
        if (block.timestamp >= j.acceptDeadline) revert WindowElapsed();
        j.disputed = true;
        emit Disputed(jobId, msg.sender, reason);
    }

    /// @notice Arbiter (JudgeRegistry) settles a disputed job. Same signature
    ///         the original hook design exposed, so JudgeRegistry needed no
    ///         changes to keep calling this.
    function resolveDispute(uint256 jobId, bool favorBuyer, bytes32 reason) external {
        if (msg.sender != arbiter) revert OnlyArbiter();
        Job storage j = jobs[jobId];
        if (!j.disputed) revert NotDisputed();
        j.disputed = false;
        emit DisputeResolved(jobId, favorBuyer, reason);
        if (favorBuyer) {
            j.status = Status.Rejected;
            if (!usdc.transfer(j.client, j.budget)) revert TransferFailed();
        } else {
            j.status = Status.Completed;
            if (!usdc.transfer(j.provider, j.budget)) revert TransferFailed();
        }
    }

    /// @notice Buyer reclaims funds if the provider never submitted before
    ///         expiry. See the contract-level note on why this exists.
    function claimExpired(uint256 jobId) external onlyClient(jobId) {
        Job storage j = jobs[jobId];
        if (j.status != Status.Funded) revert NotFunded();
        if (block.timestamp <= j.expiredAt) revert NotExpired();
        j.status = Status.Rejected;
        emit ExpiredClaimed(jobId);
        if (!usdc.transfer(j.client, j.budget)) revert TransferFailed();
    }

    // ── views ──────────────────────────────────────────────────

    function getJob(uint256 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    function acceptDeadline(uint256 jobId) external view returns (uint64) {
        return jobs[jobId].acceptDeadline;
    }

    function isAutoReleasable(uint256 jobId) external view returns (bool) {
        Job memory j = jobs[jobId];
        return j.status == Status.Submitted && !j.disputed && block.timestamp >= j.acceptDeadline;
    }
}
