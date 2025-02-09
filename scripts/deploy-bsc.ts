import { ethers } from "hardhat";

// Add token addresses
const USDC_ADDRESS = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const DAI_ADDRESS = "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3";

// Add feed IDs
const USDC_FEED = "0x015553444300000000000000000000000000000000";
const USDT_FEED = "0x015553534400000000000000000000000000000000";
const DAI_FEED = "0x014441492f55534400000000000000000000000000";

async function main() {
  console.log("🚀 Deploying contracts to BSC...");

  // Get deployer address
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // We'll use real USDC on BSC
  console.log("Using USDC at:", USDC_ADDRESS);

  // Deploy StakingPool with correct constructor args
  console.log("\n📦 Deploying StakingPool...");
  const StakingPool = await ethers.getContractFactory("StakingPool");
  const stakingPool = await StakingPool.deploy(
    FTSO_REGISTRY_ADDRESS,
    VENUS_POOL_ADDRESS,
    PRICE_FEEDER_ADDRESS
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

  // Configure supported tokens
  console.log("\n🪙 Adding supported tokens...");
  
  // USDC
  console.log("Adding USDC...");
  await stakingPool.addSupportedToken(USDC_ADDRESS);
  await stakingPool.addTokenFeed(USDC_ADDRESS, USDC_FEED);
  await stakingPool.addStablecoin(
    USDC_ADDRESS,
    ethers.parseUnits("100", 6), // min stake
    6 // decimals
  );
  
  // USDT
  console.log("Adding USDT...");
  await stakingPool.addSupportedToken(USDT_ADDRESS);
  await stakingPool.addTokenFeed(USDT_ADDRESS, USDT_FEED);
  await stakingPool.addStablecoin(
    USDT_ADDRESS,
    ethers.parseUnits("100", 6),
    6
  );
  
  // DAI
  console.log("Adding DAI...");
  await stakingPool.addSupportedToken(DAI_ADDRESS);
  await stakingPool.addTokenFeed(DAI_ADDRESS, DAI_FEED);
  await stakingPool.addStablecoin(
    DAI_ADDRESS,
    ethers.parseUnits("100", 18), // DAI uses 18 decimals
    18
  );

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