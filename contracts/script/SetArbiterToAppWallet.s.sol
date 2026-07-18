// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SnapBackEscrow} from "../src/SnapBackEscrow.sol";

/// @notice Priority fix: SnapBackEscrow.arbiter pointed at JudgeRegistry,
///         which nothing calls (finalize() is onlyOwner, gated by this same
///         local Foundry keystore, and the real judge pool has zero staked
///         judges) — so the admin "force-resolve dispute" route had no
///         on-chain arbiter it could actually drive, and every force-resolve
///         only ever updated the off-chain `disputes` row while the on-chain
///         job stayed frozen forever.
///
///         Repoints `arbiter` at a Circle-managed EOA (the app's new
///         singleton `arbiter` app_wallet — see
///         scripts/provision-arbiter-wallet.ts) that the admin route now
///         signs resolveDispute(jobId, favorBuyer, reason) with directly,
///         via Circle's developer-controlled-wallets API — never a raw key
///         embedded in the app.
///
///   forge script script/SetArbiterToAppWallet.s.sol:SetArbiterToAppWallet \
///     --rpc-url arc_testnet --account snapback-deployer \
///     --password-file <file> --broadcast
contract SetArbiterToAppWallet is Script {
    address constant SNAPBACK_ESCROW = 0x73D35909D28b79a5F88DC5fDBA82EcBbe7C18Ee8;
    address constant NEW_ARBITER = 0xF29D65965383a91E6aEbFC4cfB1ECA1875D98EEC;

    function run() external {
        vm.startBroadcast();

        SnapBackEscrow escrow = SnapBackEscrow(SNAPBACK_ESCROW);
        console.log("old arbiter:", escrow.arbiter());

        escrow.setArbiter(NEW_ARBITER);
        console.log("new arbiter:", escrow.arbiter());

        vm.stopBroadcast();
    }
}
