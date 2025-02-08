const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ClaimsManager", function() {
    let claimsManager, insurancePool, calculator, mockPyth;
    let owner, user, insurer;
    let mockUSDC, mockDAI, mockStakingPool;

    const USDC_DECIMALS = 6;
    const DAI_DECIMALS = 18;
    const USDC_PRICE_ID = ethers.id("USDC/USD");
    const DAI_PRICE_ID = ethers.id("DAI/USD");

    beforeEach(async function() {
        [owner, user, insurer] = await ethers.getSigners();

        // Deploy mock tokens
        const MockToken = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC", USDC_DECIMALS);
        await mockUSDC.waitForDeployment();

        mockDAI = await MockToken.deploy("DAI", "DAI", DAI_DECIMALS);
        await mockDAI.waitForDeployment();

        // Deploy mock StakingPool
        const MockStakingPool = await ethers.getContractFactory("contracts/mocks/MockStakingPool.sol:MockStakingPool", owner);
        mockStakingPool = await MockStakingPool.deploy();
        await mockStakingPool.waitForDeployment();

        // Deploy Calculator
        const Calculator = await ethers.getContractFactory("PremiumCalculator");
        calculator = await Calculator.deploy();
        await calculator.waitForDeployment();

        // Deploy InsurancePool WITHOUT constructor arguments
        const InsurancePool = await ethers.getContractFactory("InsurancePool");
        insurancePool = await InsurancePool.deploy(await mockStakingPool.getAddress(), await calculator.getAddress());
        await insurancePool.waitForDeployment();

        // Set InsurancePool's components
        await insurancePool.updateComponent("stakingPool", await mockStakingPool.getAddress());
        await insurancePool.updateComponent("calculator", await calculator.getAddress());

        // Deploy a mock Pyth contract (ensure contracts/mocks/MockPyth.sol exists)
        const MockPyth = await ethers.getContractFactory("contracts/mocks/MockPyth.sol:MockPyth");
        mockPyth = await MockPyth.deploy();
        await mockPyth.waitForDeployment();

        // Deploy ClaimsManager with three constructor arguments: Pyth, USDC, and the InsurancePool
        const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
        claimsManager = await ClaimsManager.deploy(
            await mockPyth.getAddress(),
            await mockUSDC.getAddress(),
            await insurancePool.getAddress()
        );
        await claimsManager.waitForDeployment();

        // Update InsurancePool with the ClaimsManager address
        await insurancePool.updateComponent("claimsManager", await claimsManager.getAddress());

        // Configure stablecoins in ClaimsManager
        await claimsManager.configureStablecoin(
            await mockUSDC.getAddress(),
            USDC_PRICE_ID,
            95000000, // depeg threshold
            ethers.parseUnits("1", USDC_DECIMALS), // minimum fee
            100 // fee rate (1%)
        );
        await claimsManager.configureStablecoin(
            await mockDAI.getAddress(),
            DAI_PRICE_ID,
            95000000,
            ethers.parseUnits("1", DAI_DECIMALS),
            100
        );

        // Configure Calculator with USDC stablecoin settings
        await calculator.addStablecoin(
            await mockUSDC.getAddress(),
            USDC_DECIMALS,
            ethers.parseUnits("100", USDC_DECIMALS),
            ethers.parseUnits("50000", USDC_DECIMALS)
        );

        // Setup a mock policy for testing
        const coverageAmount = ethers.parseUnits("1000", USDC_DECIMALS);
        const duration = 30 * 24 * 60 * 60;

        // Mint tokens to insurer and approve
        await mockUSDC.mint(insurer.address, ethers.parseUnits("10000", USDC_DECIMALS));
        await mockUSDC.connect(insurer).approve(await insurancePool.getAddress(), ethers.MaxUint256);

        // Mint tokens to InsurancePool for payouts and approve the ClaimsManager
        await mockUSDC.mint(await insurancePool.getAddress(), ethers.parseUnits("10000", USDC_DECIMALS));
        await insurancePool.approveClaimsManager(
            await mockUSDC.getAddress(),
            ethers.parseUnits("10000", USDC_DECIMALS)
        );

        // Mint tokens to the user and approve InsurancePool to spend them
        await mockUSDC.mint(user.address, ethers.parseUnits("10000", USDC_DECIMALS));
        await mockUSDC.connect(user).approve(insurancePool.getAddress(), ethers.MaxUint256);

        // User purchases a policy
        await insurancePool.connect(user).purchasePolicy(
            await mockUSDC.getAddress(),
            insurer.address,
            coverageAmount,
            duration
        );
    });

    describe("Stablecoin Configuration", function() {
        it("Should configure stablecoins correctly", async function() {
            const usdcConfig = await claimsManager.stablecoins(await mockUSDC.getAddress());
            expect(usdcConfig.supported).to.be.true;
            expect(usdcConfig.priceId).to.equal(USDC_PRICE_ID);
            expect(usdcConfig.depegThreshold).to.equal(95000000);
        });

        it("Should calculate fees correctly for different stablecoins", async function() {
            const usdcAmount = ethers.parseUnits("1000", USDC_DECIMALS);
            const daiAmount = ethers.parseUnits("1000", DAI_DECIMALS);

            const usdcFee = await claimsManager.calculateClaimFee(
                await mockUSDC.getAddress(),
                usdcAmount
            );
            const daiFee = await claimsManager.calculateClaimFee(
                await mockDAI.getAddress(),
                daiAmount
            );

            expect(usdcFee).to.equal(usdcAmount * 100n / 10000n); // 1%
            expect(daiFee).to.equal(daiAmount * 100n / 10000n); // 1%
        });
    });

    describe("Claims Processing", function() {
        it("Should submit and process claims", async function() {
            const claimAmount = ethers.parseUnits("1000", USDC_DECIMALS);
            
            const tx = await claimsManager.connect(user).submitClaim(1, claimAmount);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === 'ClaimSubmitted');
            const claimId = event.args.claimId;

            // Process the claim (approve the claim)
            await claimsManager.processClaim(claimId, true);

            const claim = await claimsManager.claims(claimId);
            // Update expectation: the contract returns 3 for Approved claims.
            expect(claim.status).to.equal(3); // Approved status
        });
    });
}); 