// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title QuoteEscrow
/// @notice Holds quote-phase nanopayment fees from the Estimator gate.
///
/// @dev Counterpart to the Phase-4 Estimator gating. Fees accrue per session
///      (charged from the 3rd attempt onward) and settle exactly two ways:
///        * creditToTask  — the final submission matched the session's spec, so
///          the held fee counts toward the job payment;
///        * sweepToTreasury — the gate failed (topic change) or the session was
///          abandoned; the fee sweeps to the Treasury immediately.
///      Unlike job escrow (which ERC-8183 custodies), these are off-job fees
///      with no ERC-8183 job to hold them, so this contract custodies USDC.
contract QuoteEscrow {
    error OnlyGate();
    error OnlyOwner();
    error NothingHeld();
    error TransferFailed();

    event QuoteFeeHeld(bytes32 indexed sessionId, address indexed payer, uint256 amount);
    event CreditedToTask(bytes32 indexed sessionId, uint256 indexed jobId, uint256 amount);
    event SweptToTreasury(bytes32 indexed sessionId, uint256 amount, bytes32 reason);

    IERC20 public immutable usdc;
    address public immutable owner;

    /// @notice Backend gate authorized to hold/settle quote fees.
    address public gate;

    /// @notice Treasury Wallet — destination for swept quote-phase escrow.
    address public treasury;

    /// @notice Held fee per estimator session.
    mapping(bytes32 sessionId => uint256) public held;

    modifier onlyGate() {
        if (msg.sender != gate) revert OnlyGate();
        _;
    }

    constructor(address usdc_, address gate_, address treasury_) {
        usdc = IERC20(usdc_);
        gate = gate_;
        treasury = treasury_;
        owner = msg.sender;
    }

    function setGate(address gate_) external {
        if (msg.sender != owner) revert OnlyOwner();
        gate = gate_;
    }

    function setTreasury(address treasury_) external {
        if (msg.sender != owner) revert OnlyOwner();
        treasury = treasury_;
    }

    /// @notice Pull a quote-phase nanopayment into escrow for a session.
    /// @dev Payer must have approved this contract for `amount` first.
    function holdQuoteFee(bytes32 sessionId, address payer, uint256 amount) external onlyGate {
        if (!usdc.transferFrom(payer, address(this), amount)) revert TransferFailed();
        held[sessionId] += amount;
        emit QuoteFeeHeld(sessionId, payer, amount);
    }

    /// @notice Matching final submission — credit held fees toward the job.
    /// @dev Forwards to the job's payee (settlement recipient) chosen by the gate.
    function creditToTask(bytes32 sessionId, uint256 jobId, address to) external onlyGate {
        uint256 amount = held[sessionId];
        if (amount == 0) revert NothingHeld();
        held[sessionId] = 0;
        emit CreditedToTask(sessionId, jobId, amount);
        if (!usdc.transfer(to, amount)) revert TransferFailed();
    }

    /// @notice Topic change or abandonment — sweep held fees to the Treasury.
    /// @dev Same mechanism for both cases, per the gating spec.
    function sweepToTreasury(bytes32 sessionId, bytes32 reason) external onlyGate {
        uint256 amount = held[sessionId];
        if (amount == 0) revert NothingHeld();
        held[sessionId] = 0;
        emit SweptToTreasury(sessionId, amount, reason);
        if (!usdc.transfer(treasury, amount)) revert TransferFailed();
    }
}
