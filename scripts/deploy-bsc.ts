import { ethers, run } from "hardhat";
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import '@nomicfoundation/hardhat-ethers';

// Add token addresses - ensure they're checksummed
const USDC_ADDRESS = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const DAI_ADDRESS = "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3";
const VENUS_POOL = "0xfD36E2c2a6789Db23113685031d7F16329158384"; // BSC Venus Pool
const FTSO_ADDRESS = "0x0000000000000000000000000000000000000001"; // BSC FTSO

// Add feed IDs
const USDC_FEED = "0x015553444300000000000000000000000000000000";
const USDT_FEED = "0x015553534400000000000000000000000000000000";
const DAI_FEED = "0x014441492f55534400000000000000000000000000";

async function main() {
  console.log("🚀 Deploying contracts to BSC...");

  // Get deployer address
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Using USDC at:", USDC_ADDRESS);

  // Deploy Calculator first
  const Calculator = await ethers.getContractFactory("PremiumCalculator");
  const calculator = await Calculator.deploy();
  const calculatorAddress = await calculator.getAddress();
  console.log("Calculator deployed to:", calculatorAddress);

  // Deploy StakingPool with Venus Pool address
  const StakingPool = await ethers.getContractFactory("StakingPool");
  const stakingPool = await StakingPool.deploy(VENUS_POOL);
  const stakingPoolAddress = await stakingPool.getAddress();
  console.log("StakingPool deployed to:", stakingPoolAddress);

  // Deploy InsurancePool before ClaimsManager
  const InsurancePool = await ethers.getContractFactory("InsurancePool");
  const insurancePool = await InsurancePool.deploy(
    stakingPoolAddress,
    calculatorAddress
  );
  const insurancePoolAddress = await insurancePool.getAddress();
  console.log("InsurancePool deployed to:", insurancePoolAddress);

  // Deploy ClaimsManager with all required arguments
  const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
  const claimsManager = await ClaimsManager.deploy(
    USDC_ADDRESS,
    insurancePoolAddress,
    stakingPoolAddress,
    FTSO_ADDRESS
  );
  const claimsManagerAddress = await claimsManager.getAddress();
  console.log("ClaimsManager deployed to:", claimsManagerAddress);

  // Set up relationships
  await stakingPool.setInsurancePool(insurancePoolAddress);
  await insurancePool.updateComponent("claimsManager", claimsManagerAddress);

  // Configure tokens
  console.log("\n🪙 Configuring tokens...");

  // USDC
  await stakingPool.addStablecoin(
    USDC_ADDRESS,
    ethers.parseUnits("100", 6),
    6
  );
  await claimsManager.configureStablecoin(
    USDC_ADDRESS,
    USDC_FEED,
    ethers.parseUnits("0.95", 6),
    ethers.parseUnits("1", 6),
    100
  );

  // Verify contracts
  console.log("\n📝 Verifying contracts...");
  try {
    await run("verify:verify", {
      address: calculatorAddress,
      constructorArguments: []
    });

    await run("verify:verify", {
      address: stakingPoolAddress,
      constructorArguments: [VENUS_POOL]
    });

    await run("verify:verify", {
      address: claimsManagerAddress,
      constructorArguments: [USDC_ADDRESS, insurancePoolAddress, stakingPoolAddress, FTSO_ADDRESS]
    });

    await run("verify:verify", {
      address: insurancePoolAddress,
      constructorArguments: [stakingPoolAddress, calculatorAddress]
    });
  } catch (error) {
    console.log("❌ Error verifying contracts:", error);
  }

  // Final deployment info
  console.log("\n🎉 Deployment Complete! Contract Addresses:");
  console.log("----------------------------------------");
  console.log("Calculator:", calculatorAddress);
  console.log("StakingPool:", stakingPoolAddress);
  console.log("ClaimsManager:", claimsManagerAddress);
  console.log("InsurancePool:", insurancePoolAddress);
  console.log("----------------------------------------");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
}); 