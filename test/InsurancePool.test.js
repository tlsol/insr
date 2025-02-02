const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InsurancePool", function () {
    let insurancePool, calculator, stakingPool, claimsManager;
    let mockUSDC;
    let owner, insurer, user;
    
    beforeEach(async function () {
        [owner, insurer, user] = await ethers.getSigners();
        
        // Deploy mock USDC
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC");
        
        // Deploy StakingPool - COPY THE WORKING VERSION
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(ethers.ZeroAddress);
        
        // Deploy calculator
        const PremiumCalculator = await ethers.getContractFactory("PremiumCalculator");
        calculator = await PremiumCalculator.deploy();
        
        // Deploy ClaimsManager
        const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
        claimsManager = await ClaimsManager.deploy(
            "0x0000000000000000000000000000000000000000",
            await mockUSDC.getAddress()
        );
        
        // Deploy InsurancePool
        const InsurancePool = await ethers.getContractFactory("InsurancePool");
        insurancePool = await InsurancePool.deploy(
            await mockUSDC.getAddress(),
            await calculator.getAddress(),
            await stakingPool.getAddress(),
            await claimsManager.getAddress()
        );
        
        // Add USDC as an accepted stablecoin in the staking pool
        await stakingPool.addStablecoin(
            await mockUSDC.getAddress(),
            ethers.parseUnits("100", 6), // Set minimum staking amount (100 USDC, adjust as needed)
            6                           // USDC decimal places
        );
        
        // Setup staking
        await mockUSDC.mint(insurer.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(insurer).approve(await stakingPool.getAddress(), ethers.parseUnits("10000", 6));
        await stakingPool.connect(insurer).stake(
            await mockUSDC.getAddress(),
            ethers.parseUnits("5000", 6)
        );
        
        // Setup user
        await mockUSDC.mint(user.address, ethers.parseUnits("1000", 6));
        await mockUSDC.connect(user).approve(await insurancePool.getAddress(), ethers.parseUnits("1000", 6));
    });
    
    it("Should purchase policy and distribute premium", async function() {
        const coverageAmount = ethers.parseUnits("1000", 6);
        const duration = 30 * 24 * 60 * 60; // 30 days
        
        await insurancePool.connect(user).purchasePolicy(
            await mockUSDC.getAddress(),
            insurer.address,
            coverageAmount,
            duration
        );
        
        // Check insurer rewards
        const expectedPremium = await calculator.calculatePremium(coverageAmount, duration);
        // Add more checks as needed
    });
}); 