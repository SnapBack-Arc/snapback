// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SnapBackEscrow} from "../src/SnapBackEscrow.sol";

interface IJudgeRegistrySetEscrow {
    function setEscrow(address escrow_) external;
}

/// @notice Deploys the standalone SnapBackEscrow (no longer an AgenticCommerce
///         hook — every real createJob call reverted with
///         HookNotWhitelisted() because AgenticCommerce's ADMIN_ROLE is held
///         by a third-party address we don't control, verified on-chain; see
///         the contract's own docblock) and repoints the already-deployed
///         JudgeRegistry v2 at it.
///
///         JudgeRegistry itself is deliberately NOT redeployed: it only ever
///         depended on resolveDispute(uint256,bool,bytes32), which this
///         contract still exposes with the exact same signature, so the
///         existing deployment (judge pool, bonds, panel state) carries
///         forward untouched via its existing setEscrow(address).
///
///   forge script script/DeployStandaloneEscrow.s.sol:DeployStandaloneEscrow \
///     --rpc-url arc_testnet --account snapback-deployer \
///     --password-file <file> --broadcast
contract DeployStandaloneEscrow is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant JUDGE_REGISTRY = 0x740724012b7502D708e41c89D00AF7cDd63A20C9;

    uint64 constant ACCEPT_WINDOW = 24 hours;

    function run() external {
        vm.startBroadcast();

        SnapBackEscrow escrow = new SnapBackEscrow(USDC, ACCEPT_WINDOW, JUDGE_REGISTRY);
        console.log("SnapBackEscrow (standalone):", address(escrow));

        IJudgeRegistrySetEscrow(JUDGE_REGISTRY).setEscrow(address(escrow));
        console.log("JudgeRegistry.setEscrow ->", address(escrow));

        vm.stopBroadcast();

        console.log("--- verify on https://testnet.arcscan.app ---");
    }
}
