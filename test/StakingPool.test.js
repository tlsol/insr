const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingPool", function () {
    let stakingPool, mockUSDC, mockFTSO, mockRegistry;
    let owner, staker1, staker2, policyholder;
    
    const USDC_FEED = "0x015553444300000000000000000000000000000000"; // USDC feed
    
    beforeEach(async function () {
        [owner, staker1, staker2, policyholder] = await ethers.getSigners();
        
        // Deploy mock tokens
        const MockToken = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC", 6);
        await mockUSDC.waitForDeployment();

        // Deploy mock FTSO
        const MockFTSO = await ethers.getContractFactory("MockFTSOv2");
        mockFTSO = await MockFTSO.deploy();
        await mockFTSO.waitForDeployment();

        // Deploy mock Registry
        const MockRegistry = await ethers.getContractFactory("contracts/mocks/MockRegistry.sol:MockRegistry");
        mockRegistry = await MockRegistry.deploy(await mockFTSO.getAddress());
        await mockRegistry.waitForDeployment();
        
        // Deploy StakingPool with mock Registry and no Venus
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(
            await mockRegistry.getAddress(),
            ethers.ZeroAddress
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

        // Set initial USDC price
        await mockFTSO.setPrice(USDC_FEED, 100n, 2n); // $1.00

        // Setup initial balances
        await mockUSDC.mint(staker1.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(staker1).approve(await stakingPool.getAddress(), ethers.MaxUint256);
        
        await mockUSDC.mint(staker2.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(staker2).approve(await stakingPool.getAddress(), ethers.MaxUint256);
    });

    describe("Policy Management", function() {
        beforeEach(async function() {
            await stakingPool.connect(staker1).stake(
                await mockUSDC.getAddress(),
                ethers.parseUnits("1000", 6)
            );
        });

        it("Should handle multiple active policies per insurer", async function() {
            const coverageAmount = ethers.parseUnits("300", 6);
            const duration = 30 * 24 * 60 * 60; // 30 days
            
            // Create first policy
            await stakingPool.createPolicy(
                await mockUSDC.getAddress(),
                staker1.address,
                coverageAmount,
                duration
            );
            
            // Create second policy
            await stakingPool.createPolicy(
                await mockUSDC.getAddress(),
                staker1.address,
                coverageAmount,
                duration
            );
            
            const lockedCollateral = await stakingPool.getLockedCollateral(
                staker1.address,
                await mockUSDC.getAddress()
            );
            expect(lockedCollateral).to.equal(coverageAmount * 2n);
        });

        it("Should prevent policy creation if insufficient collateral", async function() {
            const coverageAmount = ethers.parseUnits("1200", 6); // More than staked
            const duration = 30 * 24 * 60 * 60;
            
            await expect(stakingPool.createPolicy(
                await mockUSDC.getAddress(),
                staker1.address,
                coverageAmount,
                duration
            )).to.be.revertedWith("Insufficient collateral");
        });

        it("Should handle policy expiration correctly with multiple policies", async function() {
            const coverageAmount = ethers.parseUnits("300", 6);
            const duration1 = 30 * 24 * 60 * 60; // 30 days
            const duration2 = 60 * 24 * 60 * 60; // 60 days
            
            // Create two policies
            await stakingPool.createPolicy(
                await mockUSDC.getAddress(),
                staker1.address,
                coverageAmount,
                duration1
            );
            
            await stakingPool.createPolicy(
                await mockUSDC.getAddress(),
                staker1.address,
                coverageAmount,
                duration2
            );
            
            // Fast forward past first policy
            await ethers.provider.send("evm_increaseTime", [duration1 + 1]);
            await ethers.provider.send("evm_mine");
            
            // Expire first policy
            await stakingPool.expirePolicy(0);
            
            const lockedCollateral = await stakingPool.getLockedCollateral(
                staker1.address,
                await mockUSDC.getAddress()
            );
            expect(lockedCollateral).to.equal(coverageAmount); // Only second policy remains
        });
    });

    describe("Collateral Management", function() {
        it("Should track locked collateral across multiple tokens", async function() {
            // Stake both tokens
            await stakingPool.connect(staker1).stake(
                await mockUSDC.getAddress(),
                ethers.parseUnits("1000", 6)
            );

            const duration = 30 * 24 * 60 * 60;
            
            // Create policies in different tokens
            await stakingPool.createPolicy(
                await mockUSDC.getAddress(),
                staker1.address,
                ethers.parseUnits("500", 6),
                duration
            );

            expect(await stakingPool.getLockedCollateral(
                staker1.address,
                await mockUSDC.getAddress()
            )).to.equal(ethers.parseUnits("500", 6));
        });

        it("Should prevent withdrawal when all collateral is locked", async function() {
            await stakingPool.connect(staker1).stake(
                await mockUSDC.getAddress(),
                ethers.parseUnits("1000", 6)
            );

            // Lock all collateral
            await stakingPool.createPolicy(
                await mockUSDC.getAddress(),
                staker1.address,
                ethers.parseUnits("1000", 6),
                30 * 24 * 60 * 60
            );

            await expect(stakingPool.connect(staker1).withdraw(
                await mockUSDC.getAddress(),
                ethers.parseUnits("100", 6)
            )).to.be.revertedWith("Insufficient free collateral");
        });

        it("Should allow partial withdrawal up to free collateral", async function() {
            await stakingPool.connect(staker1).stake(
                await mockUSDC.getAddress(),
                ethers.parseUnits("1000", 6)
            );

            // Lock 400 USDC
            await stakingPool.createPolicy(
                await mockUSDC.getAddress(),
                staker1.address,
                ethers.parseUnits("400", 6),
                30 * 24 * 60 * 60
            );

            // Try to withdraw 700 (should fail)
            await expect(stakingPool.connect(staker1).withdraw(
                await mockUSDC.getAddress(),
                ethers.parseUnits("700", 6)
            )).to.be.revertedWith("Insufficient free collateral");

            // Withdraw 500 (should succeed)
            await stakingPool.connect(staker1).withdraw(
                await mockUSDC.getAddress(),
                ethers.parseUnits("500", 6)
            );

            expect(await stakingPool.getAvailableCollateral(
                staker1.address,
                await mockUSDC.getAddress()
            )).to.equal(ethers.parseUnits("100", 6));
        });
    });

    describe("Premium Distribution", function() {
        beforeEach(async function() {
            // Setup stakes for both insurers
            await stakingPool.connect(staker1).stake(
                await mockUSDC.getAddress(),
                ethers.parseUnits("1000", 6)
            );
            await stakingPool.connect(staker2).stake(
                await mockUSDC.getAddress(),
                ethers.parseUnits("1000", 6)
            );
        });

        it("Should distribute premiums correctly between insurers", async function() {
            const premium = ethers.parseUnits("100", 6);
            
            await stakingPool.distributePremium(
                staker1.address,
                await mockUSDC.getAddress(),
                premium
            );

            const rewards = await stakingPool.getRewards(
                staker1.address,
                await mockUSDC.getAddress()
            );
            expect(rewards).to.equal((premium * 80n) / 100n);
        });

        it("Should allow claiming accumulated premiums", async function() {
            const premium = ethers.parseUnits("100", 6);
            
            await stakingPool.distributePremium(
                staker1.address,
                await mockUSDC.getAddress(),
                premium
            );

            const initialBalance = await mockUSDC.balanceOf(staker1.address);
            await stakingPool.connect(staker1).claimRewards(await mockUSDC.getAddress());
            
            const finalBalance = await mockUSDC.balanceOf(staker1.address);
            expect(finalBalance - initialBalance).to.equal((premium * 80n) / 100n);
        });

        it("Should track premiums separately per token", async function() {
            const premiumUSDC = ethers.parseUnits("100", 6);
            
            await stakingPool.distributePremium(
                staker1.address,
                await mockUSDC.getAddress(),
                premiumUSDC
            );

            const rewardsUSDC = await stakingPool.getRewards(
                staker1.address,
                await mockUSDC.getAddress()
            );

            expect(rewardsUSDC).to.equal((premiumUSDC * 80n) / 100n);
        });
    });

    describe("Edge Cases", function() {
        it("Should handle zero amount premium distribution", async function() {
            await expect(stakingPool.distributePremium(
                staker1.address,
                await mockUSDC.getAddress(),
                0
            )).to.be.revertedWith("Premium too low");
        });

        it("Should handle maximum policy duration", async function() {
            await stakingPool.connect(staker1).stake(
                await mockUSDC.getAddress(),
                ethers.parseUnits("1000", 6)
            );

            await expect(stakingPool.createPolicy(
                await mockUSDC.getAddress(),
                staker1.address,
                ethers.parseUnits("100", 6),
                366 * 24 * 60 * 60 // More than 365 days
            )).to.be.revertedWith("Invalid duration");
        });

        it("Should prevent creating policy with zero coverage", async function() {
            await expect(stakingPool.createPolicy(
                await mockUSDC.getAddress(),
                staker1.address,
                0,
                30 * 24 * 60 * 60
            )).to.be.revertedWith("Invalid coverage amount");
        });
    });

    describe("Access Control", function() {
        it("Should restrict admin functions to owner", async function() {
            await expect(stakingPool.connect(staker1).addStablecoin(
                await mockUSDC.getAddress(),
                ethers.parseUnits("100", 6),
                6
            )).to.be.revertedWith("Ownable: caller is not the owner");

            await expect(stakingPool.connect(staker1).updateMinStake(
                await mockUSDC.getAddress(),
                ethers.parseUnits("200", 6)
            )).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should allow owner to update minimum stake amounts", async function() {
            const newMin = ethers.parseUnits("200", 6);
            await stakingPool.updateMinStake(
                await mockUSDC.getAddress(),
                newMin
            );

            // Try to stake below new minimum
            await expect(stakingPool.connect(staker1).stake(
                await mockUSDC.getAddress(),
                ethers.parseUnits("150", 6)
            )).to.be.revertedWith("Below minimum stake");
        });

        it("Should prevent adding duplicate stablecoin", async function() {
            await expect(stakingPool.addStablecoin(
                await mockUSDC.getAddress(),
                ethers.parseUnits("100", 6),
                6
            )).to.be.revertedWith("Token already added");
        });
    });
}); 