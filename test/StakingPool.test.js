const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingPool", function() {
    let stakingPool, mockUSDC, mockDAI, mockVenusPool;
    let owner, staker1, staker2;

    beforeEach(async function() {
        [owner, staker1, staker2] = await ethers.getSigners();
        
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

        // Configure USDC in StakingPool
        await stakingPool.addStablecoin(
            await mockUSDC.getAddress(),
            ethers.parseUnits("100", 6),  // minStake
            6  // decimals
        );

        // Setup initial balances
        await mockUSDC.mint(staker1.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(staker1).approve(
            await stakingPool.getAddress(),
            ethers.MaxUint256
        );
        
        await mockUSDC.mint(staker2.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(staker2).approve(
            await stakingPool.getAddress(),
            ethers.MaxUint256
        );

        // Deploy mock DAI
        const MockDAI = await ethers.getContractFactory("MockDAI");
        mockDAI = await MockDAI.deploy();
        await mockDAI.waitForDeployment();
        
        // Add DAI to StakingPool
        await stakingPool.addStablecoin(
            await mockDAI.getAddress(),
            ethers.parseUnits("100", 18),  // minStake
            18  // decimals
        );
    });

    describe("Staking", function() {
        it("Should allow staking tokens", async function() {
            const amount = ethers.parseUnits("1000", 6);
            await stakingPool.connect(staker1).stake(await mockUSDC.getAddress(), amount);
            
            expect(await stakingPool.getStakedBalance(await mockUSDC.getAddress(), staker1.address))
                .to.equal(amount);
        });

        it("Should reject stakes below minimum", async function() {
            const amount = ethers.parseUnits("50", 6); // Below 100 USDC minimum
            await expect(
                stakingPool.connect(staker1).stake(await mockUSDC.getAddress(), amount)
            ).to.be.revertedWith("Below minimum stake");
        });

        it("Should deposit to Venus when enabled", async function() {
            const amount = ethers.parseUnits("1000", 6);
            const usdcAddress = await mockUSDC.getAddress();

            // Enable Venus for USDC
            await stakingPool.enableVenus(usdcAddress);

            // Stake tokens
            await stakingPool.connect(staker1).stake(usdcAddress, amount);

            // Check Venus deposit was made
            expect(await mockVenusPool.getDeposited(usdcAddress)).to.equal(amount);
        });
    });

    describe("Withdrawals", function() {
        beforeEach(async function() {
            await stakingPool.connect(staker1).stake(
                await mockUSDC.getAddress(),
                ethers.parseUnits("1000", 6)
            );
        });

        it("Should allow withdrawing staked tokens", async function() {
            const amount = ethers.parseUnits("500", 6);
            await stakingPool.connect(staker1).withdraw(await mockUSDC.getAddress(), amount);
            
            expect(await stakingPool.getStakedBalance(await mockUSDC.getAddress(), staker1.address))
                .to.equal(ethers.parseUnits("500", 6));
        });

        it("Should reject withdrawals above staked balance", async function() {
            const amount = ethers.parseUnits("2000", 6);
            await expect(
                stakingPool.connect(staker1).withdraw(await mockUSDC.getAddress(), amount)
            ).to.be.revertedWith("Insufficient balance");
        });

        it("Should withdraw from Venus when enabled", async function() {
            const usdcAddress = await mockUSDC.getAddress();
            const withdrawAmount = ethers.parseUnits("500", 6);

            // Enable Venus for USDC
            await stakingPool.enableVenus(usdcAddress);

            // Withdraw tokens
            await stakingPool.connect(staker1).withdraw(usdcAddress, withdrawAmount);

            // Check Venus withdrawal was made
            expect(await mockVenusPool.getWithdrawn(usdcAddress)).to.equal(withdrawAmount);
        });
    });

    describe("Venus Integration", function() {
        it("Should enable Venus integration", async function() {
            const usdcAddress = await mockUSDC.getAddress();
            await stakingPool.enableVenus(usdcAddress);
            
            const config = await stakingPool.stablecoins(usdcAddress);
            expect(config.venusEnabled).to.be.true;
        });

        it("Should disable Venus integration", async function() {
            const usdcAddress = await mockUSDC.getAddress();
            
            // Enable first
            await stakingPool.enableVenus(usdcAddress);
            
            // Then disable
            await stakingPool.disableVenus(usdcAddress);
            
            const config = await stakingPool.stablecoins(usdcAddress);
            expect(config.venusEnabled).to.be.false;
        });

        it("Should revert when enabling Venus twice", async function() {
            const usdcAddress = await mockUSDC.getAddress();
            await stakingPool.enableVenus(usdcAddress);
            
            await expect(
                stakingPool.enableVenus(usdcAddress)
            ).to.be.revertedWith("Venus already enabled");
        });

        it("Should revert when disabling Venus if not enabled", async function() {
            const usdcAddress = await mockUSDC.getAddress();
            await expect(
                stakingPool.disableVenus(usdcAddress)
            ).to.be.revertedWith("Venus not enabled");
        });
    });
}); 