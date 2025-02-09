const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Emergency Functions", function() {
    let stakingPool, insurancePool, claimsManager, mockUSDC, mockVenusPool, statistics, mockFTSO;
    let owner, user;

    beforeEach(async function() {
        [owner, user] = await ethers.getSigners();

        // Deploy mocks first
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy(
            "USDC",     // name
            "USDC",     // symbol
            6           // decimals
        );
        await mockUSDC.waitForDeployment();

        const MockFTSO = await ethers.getContractFactory("MockFTSOv2");
        mockFTSO = await MockFTSO.deploy();
        await mockFTSO.waitForDeployment();

        // Deploy MockVenusPool first
        const MockVenusPool = await ethers.getContractFactory("MockVenusPool");
        mockVenusPool = await MockVenusPool.deploy();
        await mockVenusPool.waitForDeployment();

        // Deploy StakingPool with VenusPool address
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(await mockVenusPool.getAddress());
        await stakingPool.waitForDeployment();

        // Deploy Calculator first
        const Calculator = await ethers.getContractFactory("PremiumCalculator");
        calculator = await Calculator.deploy();
        await calculator.waitForDeployment();

        // Deploy InsurancePool with both required args
        const InsurancePool = await ethers.getContractFactory("InsurancePool");
        insurancePool = await InsurancePool.deploy(
            await stakingPool.getAddress(),
            await calculator.getAddress()
        );
        await insurancePool.waitForDeployment();

        // Deploy ClaimsManager with all required args
        const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
        claimsManager = await ClaimsManager.deploy(
            await mockUSDC.getAddress(),
            await insurancePool.getAddress(),
            await stakingPool.getAddress(),
            await mockFTSO.getAddress()
        );
        await claimsManager.waitForDeployment();

        // Now we can set up relationships
        await stakingPool.setInsurancePool(await insurancePool.getAddress());
        await insurancePool.updateComponent("claimsManager", await claimsManager.getAddress());
    });

    describe("Emergency Operations", function() {
        it("Should handle blacklisted users", async function() {
            await claimsManager.setBlacklist(user.address, true);
            expect(await claimsManager.blacklistedUsers(user.address)).to.be.true;
        });

        it("Should handle emergency withdrawals", async function() {
            const amount = ethers.parseUnits("1000", 6);
            await mockUSDC.mint(await insurancePool.getAddress(), amount);
            
            await insurancePool.emergencyWithdraw(
                await mockUSDC.getAddress(),
                owner.address,
                amount
            );
            
            expect(await mockUSDC.balanceOf(owner.address)).to.equal(amount);
        });
    });
}); 