// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-8183 hook interface.
/// @dev A job created with `createJob(..., hook)` invokes these callbacks around
///      each core action. `selector` identifies the action (fund/submit/
///      complete/reject/setProvider); `data` carries its ABI-encoded params.
///      `claimRefund` is intentionally not hookable.
interface IACPHook {
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external;

    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
}
