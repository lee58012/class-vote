const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Voting Contract — 온체인 최소화 (메타데이터 오프체인)", function () {
  let voting;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const Voting = await ethers.getContractFactory("Voting");
    voting = await Voting.deploy();
  });

  const STATUS = { PREPARING: 0n, ONGOING: 1n, ENDED: 2n };

  async function addTwoCandidates() {
    await voting.addCandidate();
    await voting.addCandidate();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TC-01: 후보자 2명 등록 후 startVoting() → ONGOING
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-01: 후보자 2명 등록 → startVoting() → 상태 ONGOING", async function () {
    await addTwoCandidates();
    await expect(voting.startVoting()).to.emit(voting, "VotingStarted");
    expect(await voting.votingStatus()).to.equal(STATUS.ONGOING);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-02: 후보자 1명만 → startVoting() → revert
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-02: 후보자 1명 → startVoting() → revert", async function () {
    await voting.addCandidate();
    await expect(voting.startVoting()).to.be.revertedWith("Need at least 2 candidates");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-03: vote(0) → 득표수 1 증가
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-03: ONGOING → vote(0) → 후보자 0번 득표수 1 증가", async function () {
    await addTwoCandidates();
    await voting.startVoting();

    await expect(voting.connect(addr1).vote(0))
      .to.emit(voting, "Voted")
      .withArgs(addr1.address, 0n);

    const candidates = await voting.getCandidates();
    expect(candidates[0].voteCount).to.equal(1n);
    expect(candidates[1].voteCount).to.equal(0n);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-04: 중복 투표 → revert
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-04: 중복 투표 → revert Already voted", async function () {
    await addTwoCandidates();
    await voting.startVoting();
    await voting.connect(addr1).vote(0);
    await expect(voting.connect(addr1).vote(1)).to.be.revertedWith("Already voted");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-05: 비owner addCandidate() → revert
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-05: 비owner → addCandidate() → revert Not owner", async function () {
    await expect(voting.connect(addr1).addCandidate()).to.be.revertedWith("Not owner");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-06: endVoting() 후 vote() → revert
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-06: endVoting() 후 vote() → revert Voting is not ongoing", async function () {
    await addTwoCandidates();
    await voting.startVoting();
    await expect(voting.endVoting()).to.emit(voting, "VotingEnded");
    expect(await voting.votingStatus()).to.equal(STATUS.ENDED);

    await expect(voting.connect(addr1).vote(0)).to.be.revertedWith("Voting is not ongoing");
    await expect(voting.startVoting()).to.be.revertedWith("Voting already started");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-07: getCandidates() → voteCount 배열 반환
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-07: getCandidates() → 후보자 배열 반환 (voteCount만 온체인)", async function () {
    await voting.addCandidate();
    await voting.addCandidate();

    const list = await voting.getCandidates();
    expect(list.length).to.equal(2);
    expect(list[0].voteCount).to.equal(0n);
    expect(list[1].voteCount).to.equal(0n);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-08: hasVoted()
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-08: hasVoted() → 투표 전 false, 투표 후 true", async function () {
    await addTwoCandidates();
    await voting.startVoting();

    expect(await voting.hasVoted(addr1.address)).to.equal(false);
    await voting.connect(addr1).vote(0);
    expect(await voting.hasVoted(addr1.address)).to.equal(true);
    expect(await voting.hasVoted(addr2.address)).to.equal(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REVIEW 항목
  // ─────────────────────────────────────────────────────────────────────────
  it("REVIEW: 존재하지 않는 candidateId → revert Invalid candidate", async function () {
    await addTwoCandidates();
    await voting.startVoting();
    await expect(voting.connect(addr1).vote(99)).to.be.revertedWith("Invalid candidate");
  });

  it("REVIEW: PREPARING 상태에서 vote() → revert Voting is not ongoing", async function () {
    await addTwoCandidates();
    await expect(voting.connect(addr1).vote(0)).to.be.revertedWith("Voting is not ongoing");
  });

  it("REVIEW: PREPARING 상태에서 endVoting() → revert Voting is not ongoing", async function () {
    await expect(voting.endVoting()).to.be.revertedWith("Voting is not ongoing");
  });

  it("REVIEW: owner() getter → 배포자 주소 반환", async function () {
    expect(await voting.owner()).to.equal(owner.address);
  });

  it("REVIEW: ONGOING 상태에서 addCandidate() → revert Voting already started", async function () {
    await addTwoCandidates();
    await voting.startVoting();
    await expect(voting.addCandidate()).to.be.revertedWith("Voting already started");
  });

  it("REVIEW: removeCandidate() — PREPARING에서 삭제 후 목록 축소", async function () {
    await voting.addCandidate();
    await voting.addCandidate();
    await voting.addCandidate();
    await expect(voting.removeCandidate(1))
      .to.emit(voting, "CandidateRemoved").withArgs(1n);
    const list = await voting.getCandidates();
    expect(list.length).to.equal(2);
    expect(list[0].voteCount).to.equal(0n);
    expect(list[1].voteCount).to.equal(0n);
  });

  it("REVIEW: removeCandidate() — ONGOING 상태에서 호출 시 revert", async function () {
    await addTwoCandidates();
    await voting.startVoting();
    await expect(voting.removeCandidate(0)).to.be.revertedWith("Voting already started");
  });

  it("REVIEW: CandidateAdded 이벤트 — candidateId만 포함", async function () {
    await expect(voting.addCandidate())
      .to.emit(voting, "CandidateAdded")
      .withArgs(0n);
  });

  it("REVIEW: getVotingStatus() → 초기 PREPARING 반환", async function () {
    expect(await voting.getVotingStatus()).to.equal(STATUS.PREPARING);
  });

  it("REVIEW: owner 외 주소 → startVoting() → revert Not owner", async function () {
    await addTwoCandidates();
    await expect(voting.connect(addr1).startVoting()).to.be.revertedWith("Not owner");
  });

  it("REVIEW: owner 외 주소 → endVoting() → revert Not owner", async function () {
    await addTwoCandidates();
    await voting.startVoting();
    await expect(voting.connect(addr1).endVoting()).to.be.revertedWith("Not owner");
  });
});
