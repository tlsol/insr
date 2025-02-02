const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  const [owner] = await ethers.getSigners();

  // Base mainnet addresses
  const PYTH_ADDRESS = "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a";
  const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  
  console.log("Deploying contracts to Base...");

  // 1. Deploy StakingPool with Aave integration (update address for Base)
  const StakingPool = await ethers.getContractFactory("StakingPool");
  const AAVE_POOL_ADDRESS = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"; // Base mainnet Aave v3 Pool
  const stakingPool = await StakingPool.deploy(AAVE_POOL_ADDRESS);
  await stakingPool.waitForDeployment();
  console.log("StakingPool deployed to:", await stakingPool.getAddress());

  // 2. Add USDC with correct parameters (100 USDC minimum)
  await stakingPool.addStablecoin(
    USDC_ADDRESS,
    ethers.parseUnits("100", 6), // 100 USDC in proper units
    6
  );
  console.log("USDC added to StakingPool");

  // 3. Verify contract (optional but recommended)
  await hre.run("verify:verify", {
    address: await stakingPool.getAddress(),
    constructorArguments: [AAVE_POOL_ADDRESS]
  });

  // 4. Update frontend config
  console.log("\nFrontend config update required:");
  console.log(`STAKING_POOL_ADDRESS: "${await stakingPool.getAddress()}"`);

  // Deploy PremiumCalculator
  const PremiumCalculator = await hre.ethers.getContractFactory("PremiumCalculator");
  const calculator = await PremiumCalculator.deploy();
  await calculator.waitForDeployment();
  console.log("PremiumCalculator deployed to:", await calculator.getAddress());

  // Deploy ClaimsManager
  const ClaimsManager = await hre.ethers.getContractFactory("ClaimsManager");
  const claimsManager = await ClaimsManager.deploy(PYTH_ADDRESS, USDC_ADDRESS);
  await claimsManager.waitForDeployment();
  console.log("ClaimsManager deployed to:", await claimsManager.getAddress());

  // Deploy InsurancePool last
  const InsurancePool = await hre.ethers.getContractFactory("InsurancePool");
  const insurancePool = await InsurancePool.deploy(
    USDC_ADDRESS,
    await calculator.getAddress(),
    await stakingPool.getAddress(),
    await claimsManager.getAddress()
  );
  await insurancePool.waitForDeployment();
  console.log("InsurancePool deployed to:", await insurancePool.getAddress());

  console.log("\nDeployment complete! Contract addresses:");
  console.log("----------------------------------------");
  console.log("StakingPool:", await stakingPool.getAddress());
  console.log("PremiumCalculator:", await calculator.getAddress());
  console.log("ClaimsManager:", await claimsManager.getAddress());
  console.log("InsurancePool:", await insurancePool.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });