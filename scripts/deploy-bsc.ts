import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying contracts to BSC...");

  // Get deployer address
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // We'll use real USDC on BSC
  const USDC_ADDRESS = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
  console.log("Using USDC at:", USDC_ADDRESS);

  // Deploy StakingPool with correct constructor args
  console.log("\n📦 Deploying StakingPool...");
  const StakingPool = await ethers.getContractFactory("StakingPool");
  const stakingPool = await StakingPool.deploy(
    "1000000",        // minStakeAmount (1 USDC with 6 decimals)
    "100000000",      // maxStakeAmount (100 USDC with 6 decimals)
    "500"             // stakingFee (0.5%)
  );
  await stakingPool.waitForDeployment();
  console.log("✅ StakingPool deployed to:", await stakingPool.getAddress());

  // Deploy ClaimsManager
  console.log("\n📦 Deploying ClaimsManager...");
  const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
  const claimsManager = await ClaimsManager.deploy();
  await claimsManager.waitForDeployment();
  console.log("✅ ClaimsManager deployed to:", await claimsManager.getAddress());

  // Deploy InsurancePool
  console.log("\n📦 Deploying InsurancePool...");
  const InsurancePool = await ethers.getContractFactory("InsurancePool");
  const insurancePool = await InsurancePool.deploy(
    USDC_ADDRESS,
    await stakingPool.getAddress(),
    await claimsManager.getAddress()
  );
  await insurancePool.waitForDeployment();
  console.log("✅ InsurancePool deployed to:", await insurancePool.getAddress());

  // Set up contract relationships
  console.log("\n🔗 Setting up contract relationships...");
  
  console.log("Setting InsurancePool in StakingPool...");
  const stakingPoolSetTx = await stakingPool.setInsurancePool(await insurancePool.getAddress());
  await stakingPoolSetTx.wait();
  
  console.log("Setting InsurancePool in ClaimsManager...");
  const claimsManagerSetTx = await claimsManager.setInsurancePool(await insurancePool.getAddress());
  await claimsManagerSetTx.wait();

  // Add USDC as supported token
  console.log("\n🪙 Adding USDC as supported token...");
  const addTokenTx = await stakingPool.addSupportedToken(USDC_ADDRESS);
  await addTokenTx.wait();

  // Final deployment info
  console.log("\n🎉 Deployment Complete! Contract Addresses:");
  console.log("----------------------------------------");
  console.log("USDC:", USDC_ADDRESS);
  console.log("StakingPool:", await stakingPool.getAddress());
  console.log("ClaimsManager:", await claimsManager.getAddress());
  console.log("InsurancePool:", await insurancePool.getAddress());
  console.log("----------------------------------------");

  // Verification instructions
  console.log("\n🔍 To verify contracts on BSCScan:");
  console.log("----------------------------------------");
  console.log(`npx hardhat verify --network bsc ${await stakingPool.getAddress()} "1000000" "100000000" "500"`);
  console.log(`npx hardhat verify --network bsc ${await claimsManager.getAddress()}`);
  console.log(`npx hardhat verify --network bsc ${await insurancePool.getAddress()} "${USDC_ADDRESS}" "${await stakingPool.getAddress()}" "${await claimsManager.getAddress()}"`);
  console.log("----------------------------------------");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
}); 