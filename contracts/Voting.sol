// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Voting — 온체인 투표 컨트랙트 (메타데이터 오프체인, 득표수만 온체인)
contract Voting {
    enum VotingStatus { PREPARING, ONGOING, ENDED }

    struct Candidate {
        uint256 voteCount;   // 이름·사진은 Supabase에서 관리 — 가스비 최소화
    }

    address public owner;
    VotingStatus public votingStatus;
    Candidate[] private candidates;
    mapping(address => bool) public hasVoted;

    event CandidateAdded(uint256 indexed candidateId);
    event CandidateRemoved(uint256 indexed candidateId);
    event VotingStarted();
    event VotingEnded();
    event Voted(address indexed voter, uint256 indexed candidateId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        votingStatus = VotingStatus.PREPARING;
    }

    /// @notice 후보자 슬롯 생성 — 이름·사진은 오프체인(Supabase)에서 저장
    function addCandidate() external onlyOwner {
        require(votingStatus == VotingStatus.PREPARING, "Voting already started");
        uint256 candidateId = candidates.length;
        candidates.push(Candidate({ voteCount: 0 }));
        emit CandidateAdded(candidateId);
    }

    /// @notice 후보자 삭제 (순서 보존)
    function removeCandidate(uint256 candidateId) external onlyOwner {
        require(votingStatus == VotingStatus.PREPARING, "Voting already started");
        require(candidateId < candidates.length, "Invalid candidate");
        for (uint256 i = candidateId; i < candidates.length - 1; ) {
            candidates[i] = candidates[i + 1];
            unchecked { ++i; }
        }
        candidates.pop();
        emit CandidateRemoved(candidateId);
    }

    function startVoting() external onlyOwner {
        require(votingStatus == VotingStatus.PREPARING, "Voting already started");
        require(candidates.length >= 2, "Need at least 2 candidates");
        votingStatus = VotingStatus.ONGOING;
        emit VotingStarted();
    }

    function endVoting() external onlyOwner {
        require(votingStatus == VotingStatus.ONGOING, "Voting is not ongoing");
        votingStatus = VotingStatus.ENDED;
        emit VotingEnded();
    }

    function vote(uint256 candidateId) external {
        require(votingStatus == VotingStatus.ONGOING, "Voting is not ongoing");
        require(!hasVoted[msg.sender], "Already voted");
        require(candidateId < candidates.length, "Invalid candidate");
        hasVoted[msg.sender] = true;
        candidates[candidateId].voteCount += 1;
        emit Voted(msg.sender, candidateId);
    }

    function getCandidates() external view returns (Candidate[] memory) {
        return candidates;
    }

    function getVotingStatus() external view returns (VotingStatus) {
        return votingStatus;
    }
}
