// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-8183 job lifecycle status.
/// @dev Order is normative — see https://eips.ethereum.org/EIPS/eip-8183
enum JobStatus {
    Open,
    Funded,
    Submitted,
    Completed,
    Rejected,
    Expired
}

struct Job {
    uint256 id;
    address client;
    address provider;
    address evaluator;
    string description;
    uint256 budget;
    uint256 expiredAt;
    uint8 status;
    address hook;
}

/// @notice ERC-8183 AgenticCommerce reference implementation.
/// @dev Arc Testnet: 0x0747EEf0706327138c69792bF28Cd525089e4583.
///      This contract already custodies escrow — SnapBack extends it via the
///      `hook` argument on createJob rather than re-implementing escrow.
interface IAgenticCommerce {
    function createJob(
        address provider,
        address evaluator,
        uint256 expiredAt,
        string calldata description,
        address hook
    ) external returns (uint256 jobId);

    function setProvider(uint256 jobId, address provider) external;

    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external;

    function fund(uint256 jobId, bytes calldata optParams) external;

    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external;

    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external;

    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external;

    /// @dev Deliberately NOT hookable per ERC-8183, so refunds after expiry
    ///      can never be blocked by a misbehaving hook.
    function claimRefund(uint256 jobId) external;

    function getJob(uint256 jobId) external view returns (Job memory);
}
