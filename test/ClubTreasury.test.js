const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ClubTreasury Security & Invariant Tests", function () {
  let ClubTreasury;
  let treasury;
  let deployer, member1, member2, member3, nonMember, vendor;
  const VOTING_DURATION = 3600; // 1 hour
  const QUORUM_BPS = 5000;      // 50%

  beforeEach(async function () {
    [deployer, member1, member2, member3, nonMember, vendor] = await ethers.getSigners();

    const initialMembers = [deployer.address, member1.address, member2.address, member3.address];
    ClubTreasury = await ethers.getContractFactory("ClubTreasury");
    treasury = await ClubTreasury.deploy(initialMembers, VOTING_DURATION, QUORUM_BPS);
    await treasury.waitForDeployment();
  });

  describe("1. Inflows & Balance Sheet", function () {
    it("Should accept direct ETH deposits and update totalDeposited", async function () {
      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("2.0"),
      });

      expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(ethers.parseEther("2.0"));
      const sheet = await treasury.getBalanceSheet();
      expect(sheet.currentBalance).to.equal(ethers.parseEther("2.0"));
      expect(sheet.deposited).to.equal(ethers.parseEther("2.0"));
    });

    it("Should accept deposit() with memo note and emit FundsReceived event", async function () {
      await expect(
        treasury.connect(nonMember).deposit("Alumni Fest Grant", { value: ethers.parseEther("1.5") })
      )
        .to.emit(treasury, "FundsReceived")
        .withArgs(nonMember.address, ethers.parseEther("1.5"), "Alumni Fest Grant", (t) => t > 0);

      expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(ethers.parseEther("1.5"));
    });
  });

  describe("2. Backdoor Prevention (Core Requirement)", function () {
    it("Deployer MUST NOT have any unilateral withdraw function", async function () {
      // Confirm by inspecting contract interface that no 'withdraw' or 'drain' exists
      expect(treasury.withdraw).to.be.undefined;
      expect(treasury.adminWithdraw).to.be.undefined;
      expect(treasury.emergencyWithdraw).to.be.undefined;
    });

    it("Deployer cannot bypass voting to send funds", async function () {
      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("1.0"),
      });

      // Try creating and executing without votes
      await treasury.connect(deployer).createProposal(
        deployer.address,
        ethers.parseEther("0.5"),
        "Tech",
        "Self pay"
      );

      // Attempt immediate execution without votes
      await expect(treasury.connect(deployer).executeProposal(0))
        .to.be.revertedWithCustomError(treasury, "ProposalVotingStillActive");
    });
  });

  describe("3. Invariant 1: Contract Can NEVER Pay Out More Than It Holds", function () {
    it("Reverts when proposal amount exceeds treasury balance at execution time", async function () {
      // Treasury has 0.5 ETH
      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("0.5"),
      });

      // Proposal asks for 1.0 ETH
      await treasury.connect(member1).createProposal(
        vendor.address,
        ethers.parseEther("1.0"),
        "Logistics",
        "Stage Setup"
      );

      // Members vote YES
      await treasury.connect(member1).vote(0, true);
      await treasury.connect(member2).vote(0, true);
      await treasury.connect(member3).vote(0, true);

      // Fast forward past deadline
      await time.increase(VOTING_DURATION + 1);

      // Attempt execute -> should fail with InsufficientTreasuryBalance
      await expect(treasury.executeProposal(0))
        .to.be.revertedWithCustomError(treasury, "InsufficientTreasuryBalance");
    });
  });

  describe("4. Invariant 2: No Authorization Can Move Funds More Than Once", function () {
    it("Reverts if someone tries to re-execute an already executed proposal", async function () {
      // Treasury has 5 ETH
      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("5.0"),
      });

      await treasury.connect(member1).createProposal(
        vendor.address,
        ethers.parseEther("1.0"),
        "Prizes",
        "Winner Trophy & Cash"
      );

      await treasury.connect(member1).vote(0, true);
      await treasury.connect(member2).vote(0, true);
      await treasury.connect(member3).vote(0, true);

      // First execution succeeds
      await treasury.executeProposal(0);
      expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(ethers.parseEther("4.0"));

      // Second execution MUST revert with ProposalAlreadyExecuted
      await expect(treasury.executeProposal(0))
        .to.be.revertedWithCustomError(treasury, "ProposalAlreadyExecuted");
    });
  });

  describe("5. Invariant 3: Rejected or Expired Proposals Cannot Move Funds", function () {
    it("Reverts execution if proposal was voted DOWN (Defeated)", async function () {
      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("2.0"),
      });

      await treasury.connect(member1).createProposal(
        vendor.address,
        ethers.parseEther("0.5"),
        "Catering",
        "Snacks"
      );

      // Votes: 1 Yes, 2 No
      await treasury.connect(member1).vote(0, true);
      await treasury.connect(member2).vote(0, false);
      await treasury.connect(member3).vote(0, false);

      await time.increase(VOTING_DURATION + 1);

      await expect(treasury.executeProposal(0))
        .to.be.revertedWithCustomError(treasury, "ProposalDefeated");
    });

    it("Reverts execution if quorum was not reached", async function () {
      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("2.0"),
      });

      await treasury.connect(member1).createProposal(
        vendor.address,
        ethers.parseEther("0.5"),
        "Tech",
        "Cloud Hosting"
      );

      // Only 1 person votes (Total members = 4, Quorum = 50% => 2 votes needed)
      await treasury.connect(member1).vote(0, true);

      await time.increase(VOTING_DURATION + 1);

      await expect(treasury.executeProposal(0))
        .to.be.revertedWithCustomError(treasury, "QuorumNotReached");
    });
  });

  describe("6. Roles and Access Control", function () {
    it("Non-members cannot create proposals or vote", async function () {
      await expect(
        treasury.connect(nonMember).createProposal(
          nonMember.address,
          ethers.parseEther("0.1"),
          "Other",
          "Unauthorized proposal"
        )
      ).to.be.revertedWithCustomError(treasury, "NotAMember");

      await treasury.connect(member1).createProposal(
        vendor.address,
        ethers.parseEther("0.1"),
        "Tech",
        "Valid"
      );

      await expect(
        treasury.connect(nonMember).vote(0, true)
      ).to.be.revertedWithCustomError(treasury, "NotAMember");
    });

    it("Cannot vote twice on the same proposal", async function () {
      await treasury.connect(member1).createProposal(
        vendor.address,
        ethers.parseEther("0.1"),
        "Tech",
        "Valid"
      );

      await treasury.connect(member1).vote(0, true);

      await expect(
        treasury.connect(member1).vote(0, true)
      ).to.be.revertedWithCustomError(treasury, "ProposalAlreadyVoted");
    });

    it("Members can dynamically onboard new members", async function () {
      expect(await treasury.isMember(nonMember.address)).to.be.false;

      await expect(treasury.connect(member1).addMember(nonMember.address))
        .to.emit(treasury, "MemberAdded")
        .withArgs(nonMember.address, member1.address);

      expect(await treasury.isMember(nonMember.address)).to.be.true;
      expect(await treasury.activeMemberCount()).to.equal(5);
    });
  });

  describe("7. Category Balance Sheet Tracking", function () {
    it("Updates spentByCategory properly upon execution", async function () {
      await deployer.sendTransaction({
        to: await treasury.getAddress(),
        value: ethers.parseEther("5.0"),
      });

      await treasury.connect(member1).createProposal(
        vendor.address,
        ethers.parseEther("0.8"),
        "Prizes",
        "Hackathon Prizes"
      );

      await treasury.connect(member1).vote(0, true);
      await treasury.connect(member2).vote(0, true);
      await treasury.connect(member3).vote(0, true);

      await treasury.executeProposal(0);

      expect(await treasury.spentByCategory("Prizes")).to.equal(ethers.parseEther("0.8"));
      expect(await treasury.totalDisbursed()).to.equal(ethers.parseEther("0.8"));
    });
  });
});
