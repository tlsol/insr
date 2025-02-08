const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ClaimsManager", function() {
    let stakingPool, claimsManager, mockUSDC, mockVToken, mockVenusPool, mockFTSO, mockRegistry, mockDAI;
    let owner, user1, user2;
    
    const USDC_PRICE_ID = ethers.encodeBytes32String("USDC");
    const USDC_DECIMALS = 6;
    const DAI_DECIMALS = 18;
    
    beforeEach(async function() {
        [owner, user1, user2] = await ethers.getSigners();
        
        // Deploy mock tokens and other dependencies first
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy("USD Coin", "USDC", 6);
        await mockUSDC.waitForDeployment();

        mockDAI = await MockToken.deploy("DAI", "DAI", 18);
        await mockDAI.waitForDeployment();

        // Deploy mock FTSO
        const MockFTSOv2 = await ethers.getContractFactory("MockFTSOv2");
        mockFTSO = await MockFTSOv2.deploy();
        await mockFTSO.waitForDeployment();

        // Deploy mock registry
        const MockRegistry = await ethers.getContractFactory("MockRegistry");
        mockRegistry = await MockRegistry.deploy(await mockFTSO.getAddress());
        await mockRegistry.waitForDeployment();

        // Deploy mock Venus pool
        const MockVenusPool = await ethers.getContractFactory("MockVenusPool");
        mockVenusPool = await MockVenusPool.deploy(
            await mockUSDC.getAddress(),
            await mockUSDC.getAddress() // Using USDC as mock vToken for simplicity
        );
        await mockVenusPool.waitForDeployment();

        // Deploy StakingPool
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(
            await mockRegistry.getAddress(),
            await mockVenusPool.getAddress()
        );
        await stakingPool.waitForDeployment();

        // Deploy calculator first
        const Calculator = await ethers.getContractFactory("PremiumCalculator");
        calculator = await Calculator.deploy();
        await calculator.waitForDeployment();

        // Deploy InsurancePool before ClaimsManager
        const InsurancePool = await ethers.getContractFactory("InsurancePool");
        insurancePool = await InsurancePool.deploy(
            await stakingPool.getAddress(),
            await calculator.getAddress()
        );
        await insurancePool.waitForDeployment();

        // Now deploy ClaimsManager with all dependencies
        const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
        claimsManager = await ClaimsManager.deploy(
            await mockFTSO.getAddress(),      // _pyth
            await mockUSDC.getAddress(),      // _usdc
            await insurancePool.getAddress(), // _insurancePool
            await stakingPool.getAddress()    // _stakingPool
        );
        await claimsManager.waitForDeployment();

        // Configure USDC in StakingPool
        await stakingPool.addStablecoin(
            await mockUSDC.getAddress(),
            ethers.parseUnits("100", 6),  // minStake
            6  // decimals
        );

        // Configure USDC in ClaimsManager
        await claimsManager.configureStablecoin(
            await mockUSDC.getAddress(),  // stablecoin
            USDC_PRICE_ID,  // priceId
            ethers.parseUnits("95", 6),  // depegThreshold
            ethers.parseUnits("1", 6),   // minFee
            100  // feeRate (1%)
        );

        // Configure DAI in ClaimsManager
        await claimsManager.configureStablecoin(
            await mockDAI.getAddress(),  // stablecoin
            ethers.encodeBytes32String("DAI"),  // priceId
            ethers.parseUnits("95", 18),  // depegThreshold
            ethers.parseUnits("1", 18),   // minFee
            100  // feeRate (1%)
        );

        // Additional setup for claims tests
        await mockUSDC.mint(user1.address, ethers.parseUnits("1000", 6));
        await mockUSDC.connect(user1).approve(
            await stakingPool.getAddress(),
            ethers.MaxUint256
        );
        await stakingPool.connect(user1).stake(
            await mockUSDC.getAddress(),
            ethers.parseUnits("1000", 6)
        );
    });

    describe("Stablecoin Configuration", function() {
        it("Should configure stablecoins correctly", async function() {
            const usdcConfig = await claimsManager.stablecoins(await mockUSDC.getAddress());
            expect(usdcConfig.supported).to.be.true;
            expect(usdcConfig.priceId).to.equal(USDC_PRICE_ID);
            expect(usdcConfig.depegThreshold).to.equal(95000000);
        });
    });
}); 