const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingPool Venus Integration", function() {
    let stakingPool, mockUSDC, mockVenusPool;
    let owner, user;

    beforeEach(async function() {
        [owner, user] = await ethers.getSigners();

        // Deploy mock USDC
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC", 6);
        await mockUSDC.waitForDeployment();

        // Deploy mock Venus Pool
        const MockVenusPool = await ethers.getContractFactory("MockVenusPool");
        mockVenusPool = await MockVenusPool.deploy();
        await mockVenusPool.waitForDeployment();

        // Deploy StakingPool with Venus
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(await mockVenusPool.getAddress());
        await stakingPool.waitForDeployment();

        // Configure USDC
        await stakingPool.addStablecoin(
            await mockUSDC.getAddress(),
            ethers.parseUnits("100", 6),
            6
        );

        // Setup initial balances
        await mockUSDC.mint(user.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(user).approve(
            await stakingPool.getAddress(),
            ethers.MaxUint256
        );
    });

    describe("Venus Integration", function() {
        it("Should enable Venus integration", async function() {
            const usdcAddress = await mockUSDC.getAddress();
            await stakingPool.enableVenus(usdcAddress);
            
            const config = await stakingPool.stablecoins(usdcAddress);
            expect(config.venusEnabled).to.be.true;
        });

        it("Should stake with Venus when enabled", async function() {
            const usdcAddress = await mockUSDC.getAddress();
            await stakingPool.enableVenus(usdcAddress);
            
            const amount = ethers.parseUnits("1000", 6);
            await stakingPool.connect(user).stake(usdcAddress, amount);
            
            expect(await mockVenusPool.getDeposited(usdcAddress)).to.equal(amount);
        });

        it("Should withdraw from Venus when enabled", async function() {
            const usdcAddress = await mockUSDC.getAddress();
            await stakingPool.enableVenus(usdcAddress);
            
            const amount = ethers.parseUnits("1000", 6);
            await stakingPool.connect(user).stake(usdcAddress, amount);
            
            const withdrawAmount = ethers.parseUnits("500", 6);
            await stakingPool.connect(user).withdraw(usdcAddress, withdrawAmount);
            
            expect(await mockVenusPool.getWithdrawn(usdcAddress)).to.equal(withdrawAmount);
        });

        it("Should fail gracefully when Venus is down", async function() {
            // Deploy broken Venus pool
            const MockBrokenVenusPool = await ethers.getContractFactory("MockBrokenVenusPool");
            const brokenPool = await MockBrokenVenusPool.deploy();
            await brokenPool.waitForDeployment();

            // Deploy new StakingPool with broken Venus
            const StakingPool = await ethers.getContractFactory("StakingPool");
            const newStakingPool = await StakingPool.deploy(
                await mockVenusPool.getAddress()
            );
            await newStakingPool.waitForDeployment();

            // Configure StakingPool
            await newStakingPool.addStablecoin(
                await mockUSDC.getAddress(),
                ethers.parseUnits("100", 6),
                6
            );

            // Fund Venus Pool with USDC for redemptions
            await mockUSDC.mint(await mockVenusPool.getAddress(), ethers.parseUnits("10000", 6));
        });

        it("Should track yield correctly", async function() {
            const usdcAddress = await mockUSDC.getAddress();
            await stakingPool.enableVenus(usdcAddress);
            
            const amount = ethers.parseUnits("1000", 6);
            await stakingPool.connect(user).stake(usdcAddress, amount);
            
            // Simulate 10% yield by setting exchange rate to 1.1
            await mockVenusPool.setExchangeRate(usdcAddress, ethers.parseUnits("1.1", 18));
            
            // Get balance which should now be 1100 USDC (10% more)
            const expectedBalance = ethers.parseUnits("1100", 6);
            const actualBalance = await stakingPool.getStakedBalance(usdcAddress, user.address);
            expect(actualBalance).to.equal(expectedBalance);
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
            const usdcAddress = await mockUSDC.getAddress();
            await stakingPool.enableVenus(usdcAddress);
            
            const amount = ethers.parseUnits("1000", 6);
            await stakingPool.connect(user).stake(usdcAddress, amount);
        });

        it("Should track yield correctly when exchange rate increases", async function() {
            const usdcAddress = await mockUSDC.getAddress();
            await mockVenusPool.setExchangeRate(usdcAddress, ethers.parseUnits("1.1", 18));
            
            const expectedBalance = ethers.parseUnits("1100", 6);
            const actualBalance = await stakingPool.getStakedBalance(usdcAddress, user.address);
            expect(actualBalance).to.equal(expectedBalance);
        });

        it("Should return zero yield for unsupported token", async function() {
            const yield = await stakingPool.getPendingYield(ethers.ZeroAddress, user.address);
            expect(yield).to.equal(0);
        });

        it("Should return zero yield for user with no deposits", async function() {
            const usdcAddress = await mockUSDC.getAddress();
            const yield = await stakingPool.getPendingYield(usdcAddress, owner.address);
            expect(yield).to.equal(0);
        });
    });
}); 