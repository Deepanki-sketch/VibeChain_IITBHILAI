const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("==================================================");
  console.log("Deploying ClubTreasury with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // Initial founding members: Deployer plus any extra addresses
  const initialMembers = [deployer.address];
  const votingDuration = 300; // 5 minutes for rapid hackathon testing (prod would be 1-3 days)
  const quorumBps = 5000;     // 50%

  console.log("Initial Members:", initialMembers);
  console.log("Voting Duration (seconds):", votingDuration);
  console.log("Quorum:", quorumBps / 100, "%");

  const ClubTreasury = await hre.ethers.getContractFactory("ClubTreasury");
  const treasury = await ClubTreasury.deploy(initialMembers, votingDuration, quorumBps);
  await treasury.waitForDeployment();

  const treasuryAddress = await treasury.getAddress();
  console.log("--------------------------------------------------");
  console.log("🚀 ClubTreasury deployed to:", treasuryAddress);
  console.log("--------------------------------------------------");

  // Export ABI and address for Frontend
  const frontendConfigDir = path.join(__dirname, "../frontend/src");
  if (!fs.existsSync(frontendConfigDir)) {
    fs.mkdirSync(frontendConfigDir, { recursive: true });
  }

  const contractArtifact = await hre.artifacts.readArtifact("ClubTreasury");
  const contractConfig = {
    address: treasuryAddress,
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    abi: contractArtifact.abi,
  };

  fs.writeFileSync(
    path.join(frontendConfigDir, "contractConfig.json"),
    JSON.stringify(contractConfig, null, 2)
  );
  console.log("✅ Exported contract config & ABI to frontend/src/contractConfig.json");
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
