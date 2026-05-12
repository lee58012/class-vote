// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Voting — 수업 실습용 온체인 투표 컨트랙트 (1컨트랙트 = 1투표)
contract Voting {
    // ─── 상태 열거형 (2.4 상태 및 데이터 구조) ───────────────────────────────
    enum VotingStatus { PREPARING, ONGOING, ENDED }

    // ─── 후보자 구조체 ────────────────────────────────────────────────────────
    struct Candidate {
        string   name;
        string   photoUrl;
        uint256  voteCount;
    }

    // ─── 상태 변수 ────────────────────────────────────────────────────────────
    address public owner;                        // NFR-01-2: public → 자동 getter owner()
    VotingStatus public votingStatus;
    Candidate[] private candidates;
    mapping(address => bool) public hasVoted;    // public → 자동 getter hasVoted(address)

    // ─── 이벤트 (2.4 이벤트 명세) ────────────────────────────────────────────
    event CandidateAdded(uint256 indexed candidateId, string name, string photoUrl);
    event VotingStarted();
    event VotingEnded();
    event Voted(address indexed voter, uint256 indexed candidateId);

    // ─── Modifier ─────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ─── 생성자 ───────────────────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
        votingStatus = VotingStatus.PREPARING;
    }

    // ─── 관리자 함수 ──────────────────────────────────────────────────────────

    /// @notice 후보자 등록 (FR-02-1, FR-02-5)
    function addCandidate(string calldata name, string calldata photoUrl) external onlyOwner {
        require(votingStatus == VotingStatus.PREPARING, "Voting already started");
        uint256 candidateId = candidates.length;
        candidates.push(Candidate({ name: name, photoUrl: photoUrl, voteCount: 0 }));
        emit CandidateAdded(candidateId, name, photoUrl);
    }

    /// @notice 투표 시작 (FR-03-1, FR-03-2)
    function startVoting() external onlyOwner {
        require(votingStatus == VotingStatus.PREPARING, "Voting already started");
        require(candidates.length >= 2, "Need at least 2 candidates");
        votingStatus = VotingStatus.ONGOING;
        emit VotingStarted();
    }

    /// @notice 투표 수동 종료 (FR-03-3, FR-03-4)
    function endVoting() external onlyOwner {
        require(votingStatus == VotingStatus.ONGOING, "Voting is not ongoing");
        votingStatus = VotingStatus.ENDED;
        emit VotingEnded();
    }

    // ─── 투표자 함수 ──────────────────────────────────────────────────────────

    /// @notice 투표 실행 — 중복 투표 차단 (FR-04-1 ~ FR-04-6)
    function vote(uint256 candidateId) external {
        require(votingStatus == VotingStatus.ONGOING, "Voting is not ongoing");
        require(!hasVoted[msg.sender], "Already voted");
        require(candidateId < candidates.length, "Invalid candidate");
        hasVoted[msg.sender] = true;
        candidates[candidateId].voteCount += 1;
        emit Voted(msg.sender, candidateId);
    }

    // ─── 조회 함수 ────────────────────────────────────────────────────────────

    /// @notice 후보자 전체 목록 반환 (FR-05-1, FR-05-2)
    function getCandidates() external view returns (Candidate[] memory) {
        return candidates;
    }

    /// @notice 현재 투표 상태 반환
    function getVotingStatus() external view returns (VotingStatus) {
        return votingStatus;
    }
}
