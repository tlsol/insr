const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InsurancePool", function() {
    let stakingPool, claimsManager, calculator, insurancePool, mockUSDC, mockVToken, mockVenusPool, mockFTSO, mockRegistry;
    let owner, user, insurer;
    
    beforeEach(async function() {
        [owner, user, insurer] = await ethers.getSigners();
        
        // Deploy mock tokens
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy("USD Coin", "USDC", 6);
        await mockUSDC.waitForDeployment();

        // Deploy mock vToken
        const MockVToken = await ethers.getContractFactory("MockVToken");
        mockVToken = await MockVToken.deploy("vUSDC", "vUSDC", await mockUSDC.getAddress());
        await mockVToken.waitForDeployment();

        // Deploy mock Venus pool
        const MockVenusPool = await ethers.getContractFactory("MockVenusPool");
        mockVenusPool = await MockVenusPool.deploy(
            await mockUSDC.getAddress(),
            await mockVToken.getAddress()
        );
        await mockVenusPool.waitForDeployment();

        // Deploy mock FTSO
        const MockFTSOv2 = await ethers.getContractFactory("MockFTSOv2");
        mockFTSO = await MockFTSOv2.deploy();
        await mockFTSO.waitForDeployment();

        // Deploy mock registry
        const MockRegistry = await ethers.getContractFactory("MockRegistry");
        mockRegistry = await MockRegistry.deploy(await mockFTSO.getAddress());
        await mockRegistry.waitForDeployment();

        // Deploy StakingPool first
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(
            await mockRegistry.getAddress(),
            await mockVenusPool.getAddress()
        );
        await stakingPool.waitForDeployment();

        // Deploy calculator
        const Calculator = await ethers.getContractFactory("PremiumCalculator");
        calculator = await Calculator.deploy();
        await calculator.waitForDeployment();

        // Deploy InsurancePool with required dependencies
        const InsurancePool = await ethers.getContractFactory("InsurancePool");
        insurancePool = await InsurancePool.deploy(
            await stakingPool.getAddress(),
            await calculator.getAddress()
        );
        await insurancePool.waitForDeployment();

        // Configure InsurancePool's components
        await insurancePool.updateComponent("stakingPool", await stakingPool.getAddress());
        await insurancePool.updateComponent("calculator", await calculator.getAddress());

        // Deploy ClaimsManager with all dependencies
        const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
        claimsManager = await ClaimsManager.deploy(
            await mockFTSO.getAddress(),
            await mockUSDC.getAddress(),
            await insurancePool.getAddress(),
            await stakingPool.getAddress()
        );
        await claimsManager.waitForDeployment();

        // Update InsurancePool's claimsManager component
        await insurancePool.updateComponent("claimsManager", await claimsManager.getAddress());

        // Configure USDC in StakingPool
        await stakingPool.addStablecoin(
            await mockUSDC.getAddress(),
            ethers.parseUnits("100", 6),  // minStake
            6  // decimals
        );

        // Configure calculator for USDC
        await calculator.addStablecoin(
            await mockUSDC.getAddress(),
            6,  // decimals
            ethers.parseUnits("1", 6),  // minCoverage
            ethers.parseUnits("1000000", 6)  // maxCoverage
        );

        // Setup for policy purchase tests
        await mockUSDC.mint(insurer.address, ethers.parseUnits("1000", 6));
        await mockUSDC.connect(insurer).approve(
            await stakingPool.getAddress(),
            ethers.MaxUint256
        );
        await stakingPool.connect(insurer).stake(
            await mockUSDC.getAddress(),
            ethers.parseUnits("1000", 6)
        );

        // Add before purchasePolicy test
        await mockUSDC.mint(user.address, ethers.parseUnits("1000", 6));
        await mockUSDC.connect(user).approve(
            await insurancePool.getAddress(),
            ethers.MaxUint256
        );
    });

    describe("Policy Purchase", function() {
        it("Should purchase policy with USDC", async function() {
            const coverageAmount = ethers.parseUnits("1000", 6);
            const duration = 30 * 24 * 60 * 60;

            const tx = await insurancePool.connect(user).purchasePolicy(
                await mockUSDC.getAddress(),
                insurer.address,
                coverageAmount,
                duration
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === 'PolicyPurchased');
            expect(event).to.not.be.undefined;

            const policyId = event.args.policyId;
            const policy = await insurancePool.getPolicy(user.address, policyId);

            expect(policy.stablecoin).to.equal(await mockUSDC.getAddress());
            expect(policy.coverageAmount).to.equal(coverageAmount);
            expect(policy.active).to.be.true;
        });
    });

    describe("Claims Management", function() {
        it("Should approve claims manager for multiple stablecoins", async function() {
            await insurancePool.approveClaimsManager(
                await mockUSDC.getAddress(),
                ethers.parseUnits("10000", 6)
            );

            expect(await insurancePool.claimsManagerAllowance(await mockUSDC.getAddress()))
                .to.equal(ethers.parseUnits("10000", 6));
        });
    });
}); 