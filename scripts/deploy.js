const hre = require("hardhat");
const { expect } = require("chai");
const { ethers } = require("hardhat");

async function main() {
  // Mainnet addresses
  const PYTH_ADDRESS = "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a";
  const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
  
  // Deploy ClaimsManager
  const ClaimsManager = await hre.ethers.getContractFactory("ClaimsManager");
  const claimsManager = await ClaimsManager.deploy(PYTH_ADDRESS);
  await claimsManager.deployed();
  console.log("ClaimsManager deployed to:", claimsManager.address);

  // Deploy StakingPool
  const StakingPool = await hre.ethers.getContractFactory("StakingPool");
  const stakingPool = await StakingPool.deploy(USDC_ADDRESS);
  await stakingPool.deployed();
  console.log("StakingPool deployed to:", stakingPool.address);
}

describe("StakingPool", function () {
  let StakingPool;
  let stakingPool;
  let owner;
  let addr1;
  let mockUSDC;

  beforeEach(async function () {
    // Deploy mock USDC
    const MockToken = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockToken.deploy("USDC", "USDC");
    await mockUSDC.deployed();

    // Deploy StakingPool
    StakingPool = await ethers.getContractFactory("StakingPool");
    [owner, addr1] = await ethers.getSigners();
    stakingPool = await StakingPool.deploy(mockUSDC.address);
    await stakingPool.deployed();
  });

  it("Should allow staking", async function () {
    const stakeAmount = ethers.utils.parseUnits("1000", 18);
    await mockUSDC.mint(addr1.address, stakeAmount);
    await mockUSDC.connect(addr1).approve(stakingPool.address, stakeAmount);
    
    await stakingPool.connect(addr1).stake(stakeAmount);
    expect(await stakingPool.totalCollateral()).to.equal(stakeAmount);
  });
});

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 