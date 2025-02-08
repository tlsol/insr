const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Emergency Functions", function() {
    let stakingPool, claimsManager, statistics, mockUSDC, mockVToken, mockVenusPool, mockFTSO, mockRegistry;
    let owner, user1, user2;
    
    beforeEach(async function() {
        [owner, user1, user2] = await ethers.getSigners();
        
        // Deploy mock tokens and other dependencies first
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy("USD Coin", "USDC", 6);
        await mockUSDC.waitForDeployment();

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

        // Deploy Statistics
        const Statistics = await ethers.getContractFactory("InsuranceStatistics");
        statistics = await Statistics.deploy(
            await stakingPool.getAddress(),
            await claimsManager.getAddress()
        );
        await statistics.waitForDeployment();

        // Setup initial states
        await stakingPool.setStatistics(await statistics.getAddress());
        
        // Configure USDC in StakingPool
        await stakingPool.addStablecoin(
            await mockUSDC.getAddress(),
            ethers.parseUnits("100", 6),  // minStake
            6  // decimals
        );

        // Configure USDC in ClaimsManager
        await claimsManager.configureStablecoin(
            await mockUSDC.getAddress(),  // stablecoin
            ethers.encodeBytes32String("USDC"),  // priceId
            ethers.parseUnits("95", 6),  // depegThreshold
            ethers.parseUnits("1", 6),   // minFee
            100  // feeRate (1%)
        );

        // Configure calculator for USDC
        await calculator.addStablecoin(
            await mockUSDC.getAddress(),
            6,  // decimals
            ethers.parseUnits("1", 6),  // minCoverage
            ethers.parseUnits("1000000", 6)  // maxCoverage
        );

        // Setup user balance and stake (ONLY ONCE)
        await mockUSDC.mint(user1.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(user1).approve(
            await stakingPool.getAddress(),
            ethers.MaxUint256
        );
        
        // Single stake of 1000 USDC
        await stakingPool.connect(user1).stake(
            await mockUSDC.getAddress(),
            ethers.parseUnits("1000", 6)
        );

        // Setup Venus pool with balance and mapping
        await mockUSDC.mint(owner.address, ethers.parseUnits("1000000", 6));
        await mockUSDC.connect(owner).transfer(
            await mockVenusPool.getAddress(), 
            ethers.parseUnits("1000000", 6)
        );
        await stakingPool.addVToken(
            await mockUSDC.getAddress(),
            await mockVenusPool.getAddress()
        );
    });
    
    describe("StakingPool Emergency", function() {
        beforeEach(async function() {
            // Enable emergency mode
            await stakingPool.connect(owner).setEmergencyMode(true);
        });

        it("Should allow emergency unstake", async function() {
            const initialBalance = await mockUSDC.balanceOf(user1.address);
            await stakingPool.connect(owner).emergencyUnstake(user1.address, await mockUSDC.getAddress());
            const finalBalance = await mockUSDC.balanceOf(user1.address);
            expect(finalBalance - initialBalance).to.equal(ethers.parseUnits("1000", 6));
        });
    });
    
    describe("ClaimsManager Emergency", function() {
        beforeEach(async function() {
            // Set blacklist BEFORE policy creation
            await claimsManager.connect(owner).setBlacklist(user1.address, true);

            // Approve USDC for insurance pool
            await mockUSDC.connect(user1).approve(
                await insurancePool.getAddress(),
                ethers.MaxUint256
            );

            // Try to create policy (should work since blacklist only affects claims)
            const tx = await insurancePool.connect(user1).purchasePolicy(
                await mockUSDC.getAddress(),
                user1.address,
                ethers.parseUnits("100", 6),
                30 * 24 * 60 * 60
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === 'PolicyPurchased');
            policyId = event.args.policyId;
        });

        it("Should handle blacklisted users", async function() {
            await expect(
                claimsManager.connect(user1).submitClaim(policyId, ethers.parseUnits("100", 6))
            ).to.be.revertedWith("User blacklisted");
        });
    });
    
    describe("Statistics Emergency", function() {
        it("Should handle high risk detection", async function() {
            await statistics.setRiskThreshold(ethers.parseUnits("50", 6)); // 50%
            
            // Create risky situation
            const amount = ethers.parseUnits("50", 6);
            await stakingPool.connect(user1).createPolicy(
                await mockUSDC.getAddress(),
                user1.address,
                amount,
                30 * 24 * 60 * 60
            );
            
            // Advance time
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            // Update metrics should pause the contract
            await statistics.updateMetrics();
            expect(await statistics.paused()).to.be.true;
        });
        
        it("Should allow metric correction", async function() {
            await statistics.correctMetrics(100, 1000, 500, 2000);
            
            expect(await statistics.totalPoliciesIssued()).to.equal(100);
            expect(await statistics.totalPremiumsCollected()).to.equal(1000);
            expect(await statistics.totalClaimsPaid()).to.equal(500);
            expect(await statistics.totalPoliciesIssued()).to.equal(100);
        });
    });
}); 