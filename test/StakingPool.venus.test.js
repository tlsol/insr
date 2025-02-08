const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingPool Venus Integration", function() {
    let stakingPool, mockUSDC, mockVToken, mockVenusPool, mockFTSO, mockRegistry;
    let owner, staker;
    
    const USDC_FEED = "0x015553444300000000000000000000000000000000"; // USDC feed

    beforeEach(async function() {
        [owner, staker] = await ethers.getSigners();
        
        // Deploy mock tokens
        const MockToken = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC", 6);
        await mockUSDC.waitForDeployment();

        // Deploy mock Venus contracts
        const MockVToken = await ethers.getContractFactory("MockVToken");
        mockVToken = await MockVToken.deploy(
            "Venus USDC", 
            "vUSDC",
            await mockUSDC.getAddress()
        );
        await mockVToken.waitForDeployment();

        // Deploy mock Venus pool
        const MockVenusPool = await ethers.getContractFactory("MockVenusPool");
        mockVenusPool = await MockVenusPool.deploy();
        await mockVenusPool.waitForDeployment();

        // Deploy mock FTSO
        const MockFTSO = await ethers.getContractFactory("MockFTSOv2");
        mockFTSO = await MockFTSO.deploy();
        await mockFTSO.waitForDeployment();

        // Deploy mock Registry
        const MockRegistry = await ethers.getContractFactory("contracts/mocks/MockRegistry.sol:MockRegistry");
        mockRegistry = await MockRegistry.deploy(await mockFTSO.getAddress());
        await mockRegistry.waitForDeployment();

        // Deploy StakingPool
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(
            await mockRegistry.getAddress(),
            await mockVenusPool.getAddress()
        );
        await stakingPool.waitForDeployment();

        // Add USDC feed and stablecoin
        await stakingPool.addTokenFeed(
            await mockUSDC.getAddress(),
            USDC_FEED
        );
        
        await stakingPool.addStablecoin(
            await mockUSDC.getAddress(),
            ethers.parseUnits("100", 6),
            6
        );

        // Map vToken for USDC
        await stakingPool.mapVToken(
            await mockUSDC.getAddress(),
            await mockVToken.getAddress()
        );

        // Set initial USDC price
        await mockFTSO.setPrice(USDC_FEED, 100n, 2n); // $1.00

        // Set initial vToken exchange rate (1:1)
        await mockVToken.setExchangeRate(ethers.parseUnits("1", 18));

        // Setup initial balances
        await mockUSDC.mint(staker.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(staker).approve(await stakingPool.getAddress(), ethers.MaxUint256);

        // Fund Venus Pool
        await mockUSDC.mint(await mockVenusPool.getAddress(), ethers.parseUnits("10000", 6));
    });

    describe("Venus Integration", function() {
        it("Should enable/disable Venus integration", async function() {
            await stakingPool.setUseVenus(true);
            expect(await stakingPool.useVenus()).to.be.true;
        });

        it("Should stake with Venus when enabled", async function() {
            await stakingPool.setUseVenus(true);
            const stakeAmount = ethers.parseUnits("1000", 6);
            
            await stakingPool.connect(staker).stake(
                await mockUSDC.getAddress(),
                stakeAmount
            );

            const vTokenBalance = await stakingPool.vTokenBalances(
                staker.address,
                await mockUSDC.getAddress()
            );
            expect(vTokenBalance).to.equal(stakeAmount);
        });

        it("Should withdraw from Venus when enabled", async function() {
            await stakingPool.setUseVenus(true);
            const stakeAmount = ethers.parseUnits("1000", 6);
            
            await stakingPool.connect(staker).stake(
                await mockUSDC.getAddress(),
                stakeAmount
            );

            await stakingPool.connect(staker).withdraw(
                await mockUSDC.getAddress(),
                stakeAmount
            );

            const vTokenBalance = await stakingPool.vTokenBalances(
                staker.address,
                await mockUSDC.getAddress()
            );
            expect(vTokenBalance).to.equal(0);
        });

        it("Should fail gracefully when Venus is down", async function() {
            // Deploy broken Venus pool
            const MockBrokenVenusPool = await ethers.getContractFactory("MockBrokenVenusPool");
            const brokenPool = await MockBrokenVenusPool.deploy();
            await brokenPool.waitForDeployment();

            // Deploy new StakingPool with broken Venus
            const StakingPool = await ethers.getContractFactory("StakingPool");
            const newStakingPool = await StakingPool.deploy(
                await mockRegistry.getAddress(),
                await brokenPool.getAddress()
            );
            await newStakingPool.waitForDeployment();

            // Configure StakingPool
            await newStakingPool.addStablecoin(
                await mockUSDC.getAddress(),
                ethers.parseUnits("100", 6),
                6
            );
            await newStakingPool.addVToken(
                await mockUSDC.getAddress(),
                await mockVToken.getAddress()
            );

            // Fund Venus Pool with USDC for redemptions
            await mockUSDC.mint(await mockVenusPool.getAddress(), ethers.parseUnits("10000", 6));
        });

        it("Should track yield correctly", async function() {
            await stakingPool.setUseVenus(true);
            // Mock some yield accumulation
            // Check getPendingYield returns correct amount
        });

        it("Should handle multiple stablecoins with Venus", async function() {
            // Add another stablecoin (e.g., USDT) with its vToken
            // Test staking/withdrawing with multiple tokens
        });

        it("Should maintain correct balances after partial withdrawals", async function() {
            // Stake 1000
            // Withdraw 500
            // Check both normal and vToken balances
        });

        it("Should properly remove vToken mapping", async function() {
            // Test removing a vToken mapping
            // Ensure subsequent operations work correctly
        });

        describe("Emergency Scenarios", function() {
            it("Should allow emergency withdrawal when Venus is stuck", async function() {
                // Test emergency withdrawal bypassing Venus
            });

            it("Should handle Venus protocol paused state", async function() {
                // Mock Venus protocol pause
                // Ensure our protocol still works
            });
        });
    });

    describe("Venus Yield", function() {
        beforeEach(async function() {
            await stakingPool.setUseVenus(true);
            await mockUSDC.mint(staker.address, ethers.parseUnits("1000", 6));
            await mockUSDC.connect(staker).approve(
                await stakingPool.getAddress(),
                ethers.MaxUint256
            );
        });

        it("Should track yield correctly when exchange rate increases", async function() {
            const stakeAmount = ethers.parseUnits("100", 6);
            
            // 1. Stake tokens
            await stakingPool.connect(staker).stake(
                await mockUSDC.getAddress(),
                stakeAmount
            );

            // 2. Mock exchange rate increase (10% yield)
            const newExRate = ethers.parseUnits("1.1", 18); // 1.1 * 1e18
            await mockVToken.setExchangeRate(newExRate);

            // 3. Check pending yield
            const pendingYield = await stakingPool.getPendingYield(
                staker.address,
                await mockUSDC.getAddress()
            );
            
            // Should show 10% yield
            expect(pendingYield).to.equal(ethers.parseUnits("10", 6));
        });

        it("Should return zero yield when Venus is disabled", async function() {
            await stakingPool.setUseVenus(false);
            
            const pendingYield = await stakingPool.getPendingYield(
                staker.address,
                await mockUSDC.getAddress()
            );
            
            expect(pendingYield).to.equal(0);
        });

        it("Should return zero yield for unsupported token", async function() {
            const pendingYield = await stakingPool.getPendingYield(
                staker.address,
                ethers.ZeroAddress
            );
            
            expect(pendingYield).to.equal(0);
        });

        it("Should return zero yield for user with no deposits", async function() {
            const pendingYield = await stakingPool.getPendingYield(
                staker.address,
                await mockUSDC.getAddress()
            );
            
            expect(pendingYield).to.equal(0);
        });
    });
}); 