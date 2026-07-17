// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IIdentityRegistry, IReputationRegistry} from "./interfaces/IERC8004.sol";

interface IERC20Bond {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface ISnapBackEscrow {
    function resolveDispute(uint256 jobId, bool favorBuyer, bytes32 reason) external;
}

/// @title JudgeRegistry
/// @notice Bonded judges are drawn into a panel per dispute, vote in parallel,
///         and settle by majority. Verdicts settle the job through
///         SnapBackEscrow and record ERC-8004 reputation.
///
/// @dev PANEL RULES (Phase 6):
///        * 3 judges selected per dispute; 2-of-3 majority settles.
///        * A split (neither side reaches majority once voting closes — which
///          happens when a drawn judge fails to vote) escalates the panel to 5;
///          3-of-5 then settles.
///        * A still-split 5-panel tie-breaks to REFUND-THE-BUYER.
///
///      ERC-8004 RULE: an agent's owner cannot record reputation for its own
///      agent. `_recordReputation` skips the write rather than reverting, so
///      that edge case can never block settlement.
///
///      RANDOMNESS: panel selection mixes block.prevrandao with the jobId. This
///      is NOT manipulation-proof — a validator could bias a draw. Acceptable
///      for testnet; a production deployment wants a VRF or commit-reveal.
contract JudgeRegistry {
    // ── errors ─────────────────────────────────────────────────
    error OnlyOwner();
    error BondTooSmall();
    error NotAJudge();
    error NotOnPanel();
    error AlreadyVoted();
    error AlreadyResolved();
    error PanelExists();
    error NoPanel();
    error NotEnoughJudges();
    error VotingOpen();
    error VotingClosed();
    error TransferFailed();
    error InsufficientBond();

    // ── events ─────────────────────────────────────────────────
    event JudgeBonded(address indexed judge, uint256 amount);
    event JudgeUnbonded(address indexed judge, uint256 amount);
    event JudgeSlashed(address indexed judge, uint256 amount, bytes32 reason);
    event PanelSelected(uint256 indexed jobId, address[] judges, uint64 deadline);
    event PanelEscalated(uint256 indexed jobId, address[] added, uint64 deadline);
    event VoteCast(uint256 indexed jobId, address indexed judge, bool favorBuyer);
    event VerdictReached(uint256 indexed jobId, bool favorBuyer, uint8 forBuyer, uint8 forSeller, bool tieBreak);
    event ReputationSkipped(uint256 indexed agentId);

    struct Panel {
        uint8 size; // 3, or 5 after escalation
        uint8 forBuyer;
        uint8 forSeller;
        uint64 deadline;
        bool escalated;
        bool resolved;
    }

    uint8 public constant PANEL_SIZE = 3;
    uint8 public constant ESCALATED_SIZE = 5;

    IERC20Bond public immutable bondToken;
    IIdentityRegistry public immutable identity;
    IReputationRegistry public immutable reputation;
    ISnapBackEscrow public escrow;

    address public immutable owner;
    uint256 public immutable minBond;
    uint64 public votingWindow = 12 hours;

    /// @notice Every address currently bonded at/above minBond — the draw pool.
    address[] public judgePool;
    mapping(address => uint256) public bonds;
    mapping(address => bool) public inPool;

    mapping(uint256 jobId => Panel) public panels;
    mapping(uint256 jobId => address[]) internal _panelJudges;
    mapping(uint256 jobId => mapping(address => bool)) public onPanel;
    mapping(uint256 jobId => mapping(address => bool)) public hasVoted;

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(
        address bondToken_,
        address identity_,
        address reputation_,
        address escrow_,
        uint256 minBond_
    ) {
        bondToken = IERC20Bond(bondToken_);
        identity = IIdentityRegistry(identity_);
        reputation = IReputationRegistry(reputation_);
        escrow = ISnapBackEscrow(escrow_);
        minBond = minBond_;
        owner = msg.sender;
    }

    function setEscrow(address escrow_) external onlyOwner {
        escrow = ISnapBackEscrow(escrow_);
    }

    function setVotingWindow(uint64 w) external onlyOwner {
        votingWindow = w;
    }

    // ── bonding ────────────────────────────────────────────────

    function stakeBond(uint256 amount) external {
        uint256 next = bonds[msg.sender] + amount;
        if (next < minBond) revert BondTooSmall();
        if (!bondToken.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        bonds[msg.sender] = next;
        _joinPool(msg.sender);
        emit JudgeBonded(msg.sender, amount);
    }

    function unbond(uint256 amount) external {
        uint256 bal = bonds[msg.sender];
        if (bal < amount) revert InsufficientBond();
        uint256 next = bal - amount;
        bonds[msg.sender] = next;
        if (next < minBond) _leavePool(msg.sender);
        emit JudgeUnbonded(msg.sender, amount);
        if (!bondToken.transfer(msg.sender, amount)) revert TransferFailed();
    }

    function slash(address judge, uint256 amount, bytes32 reason) external onlyOwner {
        uint256 bal = bonds[judge];
        uint256 taken = amount > bal ? bal : amount;
        uint256 next = bal - taken;
        bonds[judge] = next;
        if (next < minBond) _leavePool(judge);
        emit JudgeSlashed(judge, taken, reason);
        if (taken > 0 && !bondToken.transfer(owner, taken)) revert TransferFailed();
    }

    function judgePoolSize() external view returns (uint256) {
        return judgePool.length;
    }

    function panelJudges(uint256 jobId) external view returns (address[] memory) {
        return _panelJudges[jobId];
    }

    // ── panel selection ────────────────────────────────────────

    /// @notice Draw a 3-judge panel for a dispute and open parallel voting.
    function selectPanel(uint256 jobId) external onlyOwner {
        if (panels[jobId].size != 0) revert PanelExists();
        if (judgePool.length < PANEL_SIZE) revert NotEnoughJudges();

        uint64 deadline = uint64(block.timestamp) + votingWindow;
        panels[jobId] = Panel({
            size: PANEL_SIZE,
            forBuyer: 0,
            forSeller: 0,
            deadline: deadline,
            escalated: false,
            resolved: false
        });
        _draw(jobId, PANEL_SIZE);
        emit PanelSelected(jobId, _panelJudges[jobId], deadline);
    }

    /// @dev Draw `count` distinct judges not already on the panel.
    function _draw(uint256 jobId, uint8 count) internal {
        uint256 poolLen = judgePool.length;
        uint256 seed = uint256(keccak256(abi.encodePacked(block.prevrandao, jobId, _panelJudges[jobId].length)));
        uint8 picked;
        // Bounded scan from a random offset — deterministic and gas-bounded.
        for (uint256 i = 0; i < poolLen && picked < count; i++) {
            address cand = judgePool[(seed + i) % poolLen];
            if (onPanel[jobId][cand] || bonds[cand] < minBond) continue;
            onPanel[jobId][cand] = true;
            _panelJudges[jobId].push(cand);
            picked++;
        }
        if (picked < count) revert NotEnoughJudges();
    }

    // ── voting ─────────────────────────────────────────────────

    /// @notice Panel judges vote in parallel until the deadline.
    function vote(uint256 jobId, bool favorBuyer) external {
        Panel storage p = panels[jobId];
        if (p.size == 0) revert NoPanel();
        if (p.resolved) revert AlreadyResolved();
        if (block.timestamp >= p.deadline) revert VotingClosed();
        if (!onPanel[jobId][msg.sender]) revert NotOnPanel();
        if (hasVoted[jobId][msg.sender]) revert AlreadyVoted();
        if (bonds[msg.sender] < minBond) revert NotAJudge();

        hasVoted[jobId][msg.sender] = true;
        if (favorBuyer) p.forBuyer++;
        else p.forSeller++;
        emit VoteCast(jobId, msg.sender, favorBuyer);
    }

    /// @notice Majority needed to settle: 2 of 3, or 3 of 5.
    function threshold(uint256 jobId) public view returns (uint8) {
        return panels[jobId].size / 2 + 1;
    }

    /// @dev A verdict is decided as soon as a side reaches the threshold.
    function _decided(Panel memory p) internal pure returns (bool decided, bool favorBuyer) {
        uint8 t = p.size / 2 + 1;
        if (p.forBuyer >= t) return (true, true);
        if (p.forSeller >= t) return (true, false);
        return (false, false);
    }

    // ── settlement ─────────────────────────────────────────────

    /// @notice Tally the panel and settle, escalate, or tie-break.
    /// @dev Callable once a side has the majority, or once voting closes.
    ///      3-panel split → escalate to 5. 5-panel split → refund the buyer.
    function finalize(uint256 jobId, uint256 ratedAgentId, bytes32 reason) external onlyOwner {
        Panel storage p = panels[jobId];
        if (p.size == 0) revert NoPanel();
        if (p.resolved) revert AlreadyResolved();

        (bool decided, bool favorBuyer) = _decided(p);

        if (!decided) {
            // Not decided yet — only act once voting has closed.
            if (block.timestamp < p.deadline) revert VotingOpen();

            if (!p.escalated) {
                // Split at 3 → escalate to a 5-judge panel and reopen voting.
                if (judgePool.length < ESCALATED_SIZE) revert NotEnoughJudges();
                p.escalated = true;
                p.size = ESCALATED_SIZE;
                p.deadline = uint64(block.timestamp) + votingWindow;
                uint256 before = _panelJudges[jobId].length;
                _draw(jobId, ESCALATED_SIZE - PANEL_SIZE);

                address[] memory added = new address[](_panelJudges[jobId].length - before);
                for (uint256 i = 0; i < added.length; i++) {
                    added[i] = _panelJudges[jobId][before + i];
                }
                emit PanelEscalated(jobId, added, p.deadline);
                return;
            }

            // Still split at 5 → tie-break in the buyer's favour (refund).
            p.resolved = true;
            emit VerdictReached(jobId, true, p.forBuyer, p.forSeller, true);
            escrow.resolveDispute(jobId, true, reason);
            _recordReputation(ratedAgentId, 0, reason);
            return;
        }

        p.resolved = true;
        emit VerdictReached(jobId, favorBuyer, p.forBuyer, p.forSeller, false);
        escrow.resolveDispute(jobId, favorBuyer, reason);
        // Buyer wins ⇒ the seller's agent under-delivered ⇒ score 0.
        _recordReputation(ratedAgentId, favorBuyer ? int128(0) : int128(100), reason);
    }

    /// @dev ERC-8004 forbids an agent's owner rating its own agent. Skip rather
    ///      than revert so settlement is never blockable.
    function _recordReputation(uint256 agentId, int128 score, bytes32 reason) internal {
        if (agentId == 0) return;
        if (identity.ownerOf(agentId) == address(this)) {
            emit ReputationSkipped(agentId);
            return;
        }
        reputation.giveFeedback(agentId, score, 0, "snapback_dispute", "", "", "", reason);
    }

    // ── pool bookkeeping ───────────────────────────────────────

    function _joinPool(address judge) internal {
        if (inPool[judge]) return;
        inPool[judge] = true;
        judgePool.push(judge);
    }

    function _leavePool(address judge) internal {
        if (!inPool[judge]) return;
        inPool[judge] = false;
        uint256 len = judgePool.length;
        for (uint256 i = 0; i < len; i++) {
            if (judgePool[i] == judge) {
                judgePool[i] = judgePool[len - 1];
                judgePool.pop();
                return;
            }
        }
    }
}
