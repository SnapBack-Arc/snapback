// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC-8004 IdentityRegistry (ERC-721: agentId == tokenId).
/// @dev Arc Testnet: 0x8004A818BFB912233c491871b3d84c89A494BD9e
interface IIdentityRegistry {
    function register(string calldata tokenURI) external returns (uint256 agentId);

    function ownerOf(uint256 agentId) external view returns (address);

    function tokenURI(uint256 agentId) external view returns (string memory);
}

/// @notice ERC-8004 ReputationRegistry.
/// @dev Arc Testnet: 0x8004B663056A597Dffe9eCcC1965A193B7388713
///      Per ERC-8004, an agent's owner cannot record reputation for its own
///      agent — callers must enforce this before delegating here.
interface IReputationRegistry {
    function giveFeedback(
        uint256 agentId,
        int128 score,
        uint8 rating,
        string calldata tag,
        string calldata endpoint,
        string calldata uri,
        string calldata note,
        bytes32 feedbackHash
    ) external;
}
