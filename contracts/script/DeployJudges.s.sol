// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {JudgeRegistry} from "../src/JudgeRegistry.sol";
import {SnapBackEscrow} from "../src/SnapBackEscrow.sol";

/// @notice Redeploys JudgeRegistry (Phase 6 panel logic) against the already
///         deployed SnapBackEscrow, then re-points the escrow's arbiter at it.
///
///   forge script script/DeployJudges.s.sol:DeployJudges \
///     --rpc-url arc_testnet --account snapback-deployer \
///     --password-file <file> --broadcast
contract DeployJudges is Script {
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant SNAPBACK_ESCROW = 0x1f0c71FEBb5082e61785e17d7Be38Dfd23Eee9Cf;

    uint256 constant MIN_JUDGE_BOND = 10e6; // 10 USDC (6 decimals)

    function run() external {
        vm.startBroadcast();

        JudgeRegistry judges = new JudgeRegistry(
            USDC, IDENTITY_REGISTRY, REPUTATION_REGISTRY, SNAPBACK_ESCROW, MIN_JUDGE_BOND
        );
        console.log("JudgeRegistry (v2):", address(judges));

        // Re-point the live escrow at the new arbiter.
        SnapBackEscrow(SNAPBACK_ESCROW).setArbiter(address(judges));
        console.log("escrow.setArbiter ->", address(judges));

        vm.stopBroadcast();
    }
}
