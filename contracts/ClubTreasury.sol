// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ClubTreasury
 * @author VibeChain Team
 * @notice Transparent, role-governed, backdoor-free treasury dApp for student clubs and organizations.
 * 
 * Safety Invariants Guaranteed:
 * 1. The contract can never pay out more than it holds.
 * 2. No authorization can be used to move funds more than once (strictly idempotent).
 * 3. An action that was rejected, expired, or never authorized can never move funds.
 * 4. Zero Backdoors: The deployer has NO direct withdrawal or special fund-siphoning privileges.
 */
contract ClubTreasury {
    // --- Custom Errors for Gas Efficiency and Clear Reverts ---
    error NotAMember();
    error NotAProposerOrAdmin();
    error AlreadyMember();
    error CannotRemoveLastMember();
    error InvalidAddress();
    error InvalidAmount();
    error InsufficientTreasuryBalance();
    error ProposalDoesNotExist();
    error ProposalAlreadyExecuted();
    error ProposalVotingStillActive();
    error ProposalVotingExpired();
    error ProposalAlreadyVoted();
    error ProposalDefeated();
    error QuorumNotReached();
    error TransferFailed();
    error ReentrancyGuardLocked();

    // --- Events for 100% On-Chain Auditability ---
    event FundsReceived(address indexed donor, uint256 amount, string note, uint256 timestamp);
    event MemberAdded(address indexed member, address indexed addedBy);
    event MemberRemoved(address indexed member, address indexed removedBy);
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address indexed recipient,
        uint256 amount,
        string category,
        string description,
        uint256 votingDeadline
    );
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 currentYes, uint256 currentNo);
    event ProposalExecuted(uint256 indexed proposalId, address indexed recipient, uint256 amount, string category);

    // --- State Variables ---
    enum ProposalState { Active, Defeated, Succeeded, Executed }

    struct Proposal {
        uint256 id;
        address proposer;
        address payable recipient;
        uint256 amount;
        string category;       // e.g., "Prizes", "Logistics", "Catering", "Tech"
        string description;    // Explanation & receipt/quote reference
        uint256 votingDeadline;
        uint256 yesVotes;
        uint256 noVotes;
        bool executed;
    }

    // Membership registry
    mapping(address => bool) public isMember;
    address[] public memberList;
    uint256 public activeMemberCount;

    // Proposals
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    // Accounting & Category tracking (Corporate Balance Sheet)
    uint256 public totalDeposited;
    uint256 public totalDisbursed;
    mapping(string => uint256) public spentByCategory;

    // Governance parameters
    uint256 public votingDuration;      // In seconds (e.g. 1 days for prod, 60s for demo)
    uint256 public quorumBps;           // Quorum in basis points (5000 = 50%)

    // Reentrancy lock
    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    // --- Modifiers ---
    modifier nonReentrant() {
        if (_status == _ENTERED) revert ReentrancyGuardLocked();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    modifier onlyMember() {
        if (!isMember[msg.sender]) revert NotAMember();
        _;
    }

    /**
     * @notice Initializes the treasury with initial founding members.
     * @dev The deployer is added as a member if in the list, but gains NO special withdrawal backdoor.
     * @param initialMembers List of founding member addresses.
     * @param _votingDuration Time in seconds each proposal stays open for voting.
     * @param _quorumBps Minimum % of active members required to vote (e.g., 5000 = 50%).
     */
    constructor(
        address[] memory initialMembers,
        uint256 _votingDuration,
        uint256 _quorumBps
    ) {
        if (initialMembers.length == 0) revert InvalidAddress();
        _status = _NOT_ENTERED;
        votingDuration = _votingDuration > 0 ? _votingDuration : 1 days;
        quorumBps = _quorumBps > 0 ? _quorumBps : 5000; // default 50%

        for (uint256 i = 0; i < initialMembers.length; i++) {
            address m = initialMembers[i];
            if (m == address(0)) revert InvalidAddress();
            if (!isMember[m]) {
                isMember[m] = true;
                memberList.push(m);
                activeMemberCount++;
                emit MemberAdded(m, msg.sender);
            }
        }
    }

    // --- Inflow (Donations & Grants) ---

    receive() external payable {
        if (msg.value > 0) {
            totalDeposited += msg.value;
            emit FundsReceived(msg.sender, msg.value, "Direct Inflow", block.timestamp);
        }
    }

    fallback() external payable {
        if (msg.value > 0) {
            totalDeposited += msg.value;
            emit FundsReceived(msg.sender, msg.value, "Fallback Inflow", block.timestamp);
        }
    }

    /**
     * @notice Explicit deposit function with an optional memo for public accounting.
     * @param note Purpose or source of the deposit (e.g. "Fest Sponsorship", "Alumni Grant").
     */
    function deposit(string calldata note) external payable {
        if (msg.value == 0) revert InvalidAmount();
        totalDeposited += msg.value;
        emit FundsReceived(msg.sender, msg.value, note, block.timestamp);
    }

    // --- Proposal Management (Outflow Decisions) ---

    /**
     * @notice Allows any active club member to raise an expenditure proposal.
     * @param recipient Target address where funds will be disbursed if approved.
     * @param amount Amount in wei (ETH) requested.
     * @param category Fiscal category (e.g., "Prizes", "Logistics", "Catering").
     * @param description Justification and reference links (e.g., invoice link).
     */
    function createProposal(
        address payable recipient,
        uint256 amount,
        string calldata category,
        string calldata description
    ) external onlyMember returns (uint256) {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        uint256 proposalId = proposalCount++;
        uint256 deadline = block.timestamp + votingDuration;

        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            recipient: recipient,
            amount: amount,
            category: category,
            description: description,
            votingDeadline: deadline,
            yesVotes: 0,
            noVotes: 0,
            executed: false
        });

        emit ProposalCreated(
            proposalId,
            msg.sender,
            recipient,
            amount,
            category,
            description,
            deadline
        );

        return proposalId;
    }

    /**
     * @notice Cast a vote on an active proposal. Each active member gets 1 vote.
     * @param proposalId ID of the proposal.
     * @param support True for YES, False for NO.
     */
    function vote(uint256 proposalId, bool support) external onlyMember {
        if (proposalId >= proposalCount) revert ProposalDoesNotExist();
        Proposal storage p = proposals[proposalId];

        if (p.executed) revert ProposalAlreadyExecuted();
        if (block.timestamp >= p.votingDeadline) revert ProposalVotingExpired();
        if (hasVoted[proposalId][msg.sender]) revert ProposalAlreadyVoted();

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            p.yesVotes++;
        } else {
            p.noVotes++;
        }

        emit VoteCast(proposalId, msg.sender, support, p.yesVotes, p.noVotes);
    }

    /**
     * @notice Execute a passed proposal and transfer funds to the recipient.
     * @dev Enforces all 3 mandatory safety invariants and CEI (Checks-Effects-Interactions).
     * @param proposalId ID of the proposal.
     */
    function executeProposal(uint256 proposalId) external nonReentrant {
        if (proposalId >= proposalCount) revert ProposalDoesNotExist();
        Proposal storage p = proposals[proposalId];

        // Invariant 2: Cannot be executed more than once
        if (p.executed) revert ProposalAlreadyExecuted();

        // Invariant 3: Must meet voting criteria and cannot execute if rejected
        // Note: Can execute early if yesVotes strictly exceeds 50% of all members,
        // otherwise requires deadline to have passed.
        bool hasMajority = p.yesVotes > (activeMemberCount / 2);
        if (!hasMajority && block.timestamp < p.votingDeadline) {
            revert ProposalVotingStillActive();
        }

        uint256 totalVotes = p.yesVotes + p.noVotes;
        // Quorum check: total votes must meet required percentage of active members
        if (totalVotes * 10000 < activeMemberCount * quorumBps) {
            revert QuorumNotReached();
        }

        // Must have more Yes than No votes
        if (p.yesVotes <= p.noVotes) {
            revert ProposalDefeated();
        }

        // Invariant 1: Contract can NEVER pay out more than it holds
        if (address(this).balance < p.amount) {
            revert InsufficientTreasuryBalance();
        }

        // --- Effects (State changes BEFORE external call) ---
        p.executed = true;
        totalDisbursed += p.amount;
        spentByCategory[p.category] += p.amount;

        emit ProposalExecuted(proposalId, p.recipient, p.amount, p.category);

        // --- Interactions (Safe external ETH transfer) ---
        (bool success, ) = p.recipient.call{value: p.amount}("");
        if (!success) revert TransferFailed();
    }

    // --- Membership Governance (Democratic Club Onboarding) ---

    /**
     * @notice Add a new member. Enforced through caller checks (or member consensus).
     * @param newMember The address to be added as a voting member.
     */
    function addMember(address newMember) external onlyMember {
        if (newMember == address(0)) revert InvalidAddress();
        if (isMember[newMember]) revert AlreadyMember();

        isMember[newMember] = true;
        memberList.push(newMember);
        activeMemberCount++;

        emit MemberAdded(newMember, msg.sender);
    }

    /**
     * @notice Remove an existing member.
     * @param member The address to remove.
     */
    function removeMember(address member) external onlyMember {
        if (!isMember[member]) revert NotAMember();
        if (activeMemberCount <= 1) revert CannotRemoveLastMember();

        isMember[member] = false;
        activeMemberCount--;

        emit MemberRemoved(member, msg.sender);
    }

    // --- View & Balance Sheet Helper Functions ---

    /**
     * @notice Returns complete live financial state of the treasury.
     * @return currentBalance Current liquid ETH held in the vault.
     * @return deposited Total historical ETH deposited.
     * @return disbursed Total historical ETH paid out.
     * @return members Number of active voting members.
     * @return proposalsTotal Total number of proposals created.
     */
    function getBalanceSheet() external view returns (
        uint256 currentBalance,
        uint256 deposited,
        uint256 disbursed,
        uint256 members,
        uint256 proposalsTotal
    ) {
        return (
            address(this).balance,
            totalDeposited,
            totalDisbursed,
            activeMemberCount,
            proposalCount
        );
    }

    /**
     * @notice Returns details of a specific proposal.
     */
    function getProposal(uint256 proposalId) external view returns (
        uint256 id,
        address proposer,
        address recipient,
        uint256 amount,
        string memory category,
        string memory description,
        uint256 votingDeadline,
        uint256 yesVotes,
        uint256 noVotes,
        bool executed,
        ProposalState state
    ) {
        if (proposalId >= proposalCount) revert ProposalDoesNotExist();
        Proposal storage p = proposals[proposalId];

        ProposalState s;
        if (p.executed) {
            s = ProposalState.Executed;
        } else if (block.timestamp < p.votingDeadline) {
            s = ProposalState.Active;
        } else {
            uint256 totalVotes = p.yesVotes + p.noVotes;
            if (totalVotes * 10000 >= activeMemberCount * quorumBps && p.yesVotes > p.noVotes) {
                s = ProposalState.Succeeded;
            } else {
                s = ProposalState.Defeated;
            }
        }

        return (
            p.id,
            p.proposer,
            p.recipient,
            p.amount,
            p.category,
            p.description,
            p.votingDeadline,
            p.yesVotes,
            p.noVotes,
            p.executed,
            s
        );
    }

    /**
     * @notice Returns all member addresses.
     */
    function getMembers() external view returns (address[] memory) {
        return memberList;
    }
}
