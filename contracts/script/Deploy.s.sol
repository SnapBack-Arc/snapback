// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SnapBackEscrow} from "../src/SnapBackEscrow.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {JudgeRegistry} from "../src/JudgeRegistry.sol";

/// @notice Deploys the SnapBack contract set to Arc Testnet.
///
/// Usage (keystore pattern):
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url arc_testnet \
///     --account snapback-deployer \
///     --broadcast
///
/// Wiring: JudgeRegistry is the SnapBackEscrow arbiter, and SnapBackEscrow is
/// the JudgeRegistry escrow — a cycle, so escrow is deployed first with a
/// placeholder arbiter and re-pointed via setArbiter once the registry exists.
contract Deploy is Script {
    // Verified Arc Testnet addresses (see Arc docs / on-chain `cast code`).
    address constant AGENTIC_COMMERCE = 0x0747EEf0706327138c69792bF28Cd525089e4583;
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    /// @dev ERC-20 interface over Arc's native USDC balance (6 decimals).
    address constant USDC = 0x3600000000000000000000000000000000000000;

    uint64 constant ACCEPT_WINDOW = 24 hours;
    uint256 constant MIN_JUDGE_BOND = 10e6; // 10 USDC (6 decimals)

    function run() external {
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address gate = vm.envAddress("GATE_ADDRESS");

        vm.startBroadcast();

        // 1. Escrow hook — arbiter is set to the deployer, re-pointed in step 3.
        SnapBackEscrow escrow = new SnapBackEscrow(AGENTIC_COMMERCE, ACCEPT_WINDOW, msg.sender);
        console.log("SnapBackEscrow:", address(escrow));

        // 2. Quote-phase fee escrow (Phase-4 estimator gate settles against this).
        QuoteEscrow quoteEscrow = new QuoteEscrow(USDC, gate, treasury);
        console.log("QuoteEscrow:   ", address(quoteEscrow));

        // 3. Judges: bond in USDC, write verdicts to the ERC-8004 registry.
        JudgeRegistry judges = new JudgeRegistry(
            USDC, IDENTITY_REGISTRY, REPUTATION_REGISTRY, address(escrow), MIN_JUDGE_BOND
        );
        console.log("JudgeRegistry: ", address(judges));

        // 4. Close the cycle: judges arbitrate disputes on the escrow.
        escrow.setArbiter(address(judges));

        vm.stopBroadcast();

        console.log("--- verify on https://testnet.arcscan.app ---");
    }
}
