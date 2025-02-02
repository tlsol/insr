const { expect } = require("chai");
const { ethers } = require("hardhat");

// Mock Aave contracts
const MOCK_AAVE = {
    Pool: "0x8F44Fd754c1BC7A55769D07Dca68CfD0abe5A30B",
    aUSDC: "0x625E7708f30cA75bfd92586e17077590C60eb4cD",
    aUSDT: "0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a"
};

describe("StakingPool", function () {
    let stakingPool;
    let mockUSDC, mockUSDT;
    let owner, staker, policyholder;
    
    beforeEach(async function () {
        [owner, staker, policyholder] = await ethers.getSigners();
        
        // Deploy mock stablecoins
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC");
        mockUSDT = await MockToken.deploy("USDT", "USDT");
        
        // Deploy StakingPool with no Aave for testing
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(ethers.ZeroAddress);  // No Aave in tests
        
        // Add stablecoins with 100 USDC minimum
        await stakingPool.addStablecoin(
            await mockUSDC.getAddress(),
            ethers.parseUnits("100", 6),
            6
        );
        await stakingPool.addStablecoin(
            await mockUSDT.getAddress(),
            ethers.parseUnits("100", 6),
            6
        );
        
        // Give staker enough tokens for tests
        await mockUSDC.mint(staker.address, ethers.parseUnits("10000", 6));  // More tokens
        await mockUSDT.mint(staker.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(staker).approve(await stakingPool.getAddress(), ethers.parseUnits("10000", 6));
        await mockUSDT.connect(staker).approve(await stakingPool.getAddress(), ethers.parseUnits("10000", 6));
    });

    describe("Stablecoin Management", function() {
        it("Should add new stablecoins", async function() {
            const coin = await stakingPool.stablecoins(await mockUSDC.getAddress());
            expect(coin.accepted).to.be.true;
            expect(coin.minStake).to.equal(ethers.parseUnits("100", 6));
            expect(coin.decimals).to.equal(6);
        });

        it("Should reject duplicate stablecoins", async function() {
            await expect(
                stakingPool.addStablecoin(await mockUSDC.getAddress(), ethers.parseUnits("100", 6), 6)
            ).to.be.revertedWith("Already added");
        });
    });

    describe("Staking", function() {
        it("Should allow staking multiple tokens", async function() {
            const usdcAmount = ethers.parseUnits("500", 6);
            const usdtAmount = ethers.parseUnits("300", 6);
            
            await stakingPool.connect(staker).stake(await mockUSDC.getAddress(), usdcAmount);
            await stakingPool.connect(staker).stake(await mockUSDT.getAddress(), usdtAmount);
            
            expect(await stakingPool.getAvailableCollateral(staker.address, await mockUSDC.getAddress())).to.equal(usdcAmount);
            expect(await stakingPool.getAvailableCollateral(staker.address, await mockUSDT.getAddress())).to.equal(usdtAmount);
        });

        it("Should enforce minimum stake per token", async function() {
            const belowMin = ethers.parseUnits("50", 6);  // Below 100 USDC minimum
            await expect(
                stakingPool.connect(staker).stake(await mockUSDC.getAddress(), belowMin)
            ).to.be.revertedWith("Below minimum stake");
        });
    });

    describe("Policy Management", function() {
        it("Should create policy with specific token", async function() {
            const stakeAmount = ethers.parseUnits("5000", 6);
            const coverageAmount = ethers.parseUnits("2000", 6);
            const duration = 30 * 24 * 60 * 60;
            
            await stakingPool.connect(staker).stake(await mockUSDC.getAddress(), stakeAmount);
            
            const tx = await stakingPool.connect(policyholder).createPolicy(
                await mockUSDC.getAddress(),
                staker.address,
                coverageAmount,
                duration
            );
            const receipt = await tx.wait();
            const policyId = 0;
            
            const policy = await stakingPool.policies(policyId);
            expect(policy.stablecoin).to.equal(await mockUSDC.getAddress());
            expect(policy.coverageAmount).to.equal(coverageAmount);
            expect(policy.insurer).to.equal(staker.address);
            expect(policy.active).to.be.true;
        });

        it("Should track locked collateral per token", async function() {
            const stakeAmount = ethers.parseUnits("5000", 6);
            const coverageAmount = ethers.parseUnits("2000", 6);
            const duration = 30 * 24 * 60 * 60;
            
            await stakingPool.connect(staker).stake(await mockUSDC.getAddress(), stakeAmount);
            await stakingPool.connect(policyholder).createPolicy(
                await mockUSDC.getAddress(),
                staker.address,
                coverageAmount,
                duration
            );
            
            expect(await stakingPool.getLockedCollateral(staker.address, await mockUSDC.getAddress()))
                .to.equal(coverageAmount);
            expect(await stakingPool.getAvailableCollateral(staker.address, await mockUSDC.getAddress()))
                .to.equal(stakeAmount - coverageAmount);
        });
    });

    describe("Withdrawals", function() {
        it("Should allow withdrawal of free collateral per token", async function() {
            const stakeAmount = ethers.parseUnits("5000", 6);
            await stakingPool.connect(staker).stake(await mockUSDC.getAddress(), stakeAmount);
            
            await stakingPool.connect(staker).withdraw(await mockUSDC.getAddress(), stakeAmount);
            expect(await stakingPool.getAvailableCollateral(staker.address, await mockUSDC.getAddress()))
                .to.equal(0);
        });

        it("Should prevent withdrawal of locked collateral", async function() {
            const stakeAmount = ethers.parseUnits("5000", 6);
            const coverageAmount = ethers.parseUnits("4000", 6);
            const duration = 30 * 24 * 60 * 60;
            
            await stakingPool.connect(staker).stake(await mockUSDC.getAddress(), stakeAmount);
            await stakingPool.connect(policyholder).createPolicy(
                await mockUSDC.getAddress(),
                staker.address,
                coverageAmount,
                duration
            );
            
            await expect(
                stakingPool.connect(staker).withdraw(await mockUSDC.getAddress(), coverageAmount)
            ).to.be.revertedWith("Insufficient free collateral");
        });
    });

    describe("Premium Distribution", function() {
        it("Should distribute premiums correctly", async function() {
            const premium = ethers.parseUnits("100", 6);
            
            // Only owner can distribute
            await stakingPool.distributePremium(
                staker.address,
                await mockUSDC.getAddress(),
                premium
            );
            
            const reward = await stakingPool.getRewards(staker.address, await mockUSDC.getAddress());
            expect(reward).to.equal((premium * 80n) / 100n); // 80% of premium
        });
        
        it("Should allow claiming rewards", async function() {
            const premium = ethers.parseUnits("100", 6);
            
            // Mint USDC to stakingPool for rewards
            await mockUSDC.mint(await stakingPool.getAddress(), premium);
            
            // Distribute premium
            await stakingPool.distributePremium(
                staker.address,
                await mockUSDC.getAddress(),
                premium
            );
            
            // Check balance before
            const balanceBefore = await mockUSDC.balanceOf(staker.address);
            
            // Claim rewards
            await stakingPool.connect(staker).claimRewards(await mockUSDC.getAddress());
            
            // Check balance after
            const balanceAfter = await mockUSDC.balanceOf(staker.address);
            expect(balanceAfter - balanceBefore).to.equal((premium * 80n) / 100n);
        });
        
        it("Should prevent claiming when no rewards", async function() {
            await expect(
                stakingPool.connect(staker).claimRewards(await mockUSDC.getAddress())
            ).to.be.revertedWith("No rewards to claim");
        });
    });

    describe("Emergency Features", function() {
        beforeEach(async function() {
            // Setup initial stake
            await mockUSDC.mint(staker.address, ethers.parseUnits("5000", 6));
            await mockUSDC.connect(staker).approve(await stakingPool.getAddress(), ethers.parseUnits("5000", 6));
            await stakingPool.connect(staker).stake(await mockUSDC.getAddress(), ethers.parseUnits("5000", 6));
        });

        describe("Pause Functionality", function() {
            it("Should allow owner to pause and unpause", async function() {
                await stakingPool.pause();
                expect(await stakingPool.paused()).to.be.true;
                
                await stakingPool.unpause();
                expect(await stakingPool.paused()).to.be.false;
            });

            it("Should prevent non-owner from pausing", async function() {
                await expect(
                    stakingPool.connect(staker).pause()
                ).to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("Should prevent staking when paused", async function() {
                await stakingPool.pause();
                await expect(
                    stakingPool.connect(staker).stake(await mockUSDC.getAddress(), ethers.parseUnits("1000", 6))
                ).to.be.revertedWith("Contract is paused");
            });
        });

        describe("Emergency Withdrawal", function() {
            it("Should allow emergency withdrawal of all funds", async function() {
                // Create a policy to lock some collateral
                const coverageAmount = ethers.parseUnits("2000", 6);
                const duration = 30 * 24 * 60 * 60;
                
                await stakingPool.connect(policyholder).createPolicy(
                    await mockUSDC.getAddress(),
                    staker.address,
                    coverageAmount,
                    duration
                );

                // Check initial balance
                const initialBalance = await mockUSDC.balanceOf(staker.address);
                
                // Emergency withdraw
                await stakingPool.connect(staker).emergencyWithdraw(await mockUSDC.getAddress());
                
                // Should get all funds back
                const finalBalance = await mockUSDC.balanceOf(staker.address);
                expect(finalBalance - initialBalance).to.equal(ethers.parseUnits("5000", 6));
                
                // Collateral should be zeroed
                const stakerInfo = await stakingPool.insurers(staker.address);
                expect(await stakingPool.getAvailableCollateral(staker.address, await mockUSDC.getAddress())).to.equal(0);
            });

            it("Should prevent emergency withdrawal with no balance", async function() {
                await expect(
                    stakingPool.connect(policyholder).emergencyWithdraw(await mockUSDC.getAddress())
                ).to.be.revertedWith("Nothing to withdraw");
            });
        });

        describe("Token Recovery", function() {
            it("Should allow owner to recover tokens", async function() {
                // Send some tokens directly to contract
                const amount = ethers.parseUnits("100", 6);
                await mockUSDT.mint(await stakingPool.getAddress(), amount);
                
                // Check initial balance
                const initialBalance = await mockUSDT.balanceOf(owner.address);
                
                // Recover tokens
                await stakingPool.recoverERC20(await mockUSDT.getAddress(), amount);
                
                // Check final balance
                const finalBalance = await mockUSDT.balanceOf(owner.address);
                expect(finalBalance - initialBalance).to.equal(amount);
            });

            it("Should prevent non-owner from recovering tokens", async function() {
                await expect(
                    stakingPool.connect(staker).recoverERC20(await mockUSDC.getAddress(), 100)
                ).to.be.revertedWith("Ownable: caller is not the owner");
            });
        });

        describe("Reentrancy Protection", function() {
            it("Should prevent reentrancy on stake", async function() {
                await stakingPool.pause();
                await expect(
                    stakingPool.connect(staker).stake(await mockUSDC.getAddress(), ethers.parseUnits("1000", 6))
                ).to.be.revertedWith("Contract is paused");
            });
        });
    });

    describe("Yield Farming", function() {
        let mockAavePool;
        let mockAToken;
        
        beforeEach(async function() {
            // Deploy mock tokens
            const MockToken = await ethers.getContractFactory("MockERC20");
            mockAToken = await MockToken.deploy("aUSDC", "aUSDC");
            
            // Deploy mock Aave pool
            const MockPool = await ethers.getContractFactory("MockPool");
            mockAavePool = await MockPool.deploy(mockAToken.getAddress());
            
            // Deploy StakingPool with mock Aave
            const StakingPool = await ethers.getContractFactory("StakingPool");
            stakingPool = await StakingPool.deploy(await mockAavePool.getAddress());
            
            // Setup initial balances
            await mockUSDC.mint(staker.address, ethers.parseUnits("10000", 6));
            await mockUSDC.connect(staker).approve(await stakingPool.getAddress(), ethers.parseUnits("10000", 6));
        });

        it("Should enable/disable Aave integration", async function() {
            expect(await stakingPool.useAave()).to.be.true;
            
            // Deploy another pool without Aave
            const StakingPool = await ethers.getContractFactory("StakingPool");
            const noAavePool = await StakingPool.deploy(ethers.ZeroAddress);
            expect(await noAavePool.useAave()).to.be.false;
        });

        it("Should stake without Aave when disabled", async function() {
            const StakingPool = await ethers.getContractFactory("StakingPool");
            const noAavePool = await StakingPool.deploy(ethers.ZeroAddress);
            
            await mockUSDC.connect(staker).approve(await noAavePool.getAddress(), ethers.parseUnits("1000", 6));
            await noAavePool.addStablecoin(await mockUSDC.getAddress(), ethers.parseUnits("100", 6), 6);
            
            await noAavePool.connect(staker).stake(await mockUSDC.getAddress(), ethers.parseUnits("1000", 6));
            
            const stakerCollateral = await noAavePool.getAvailableCollateral(staker.address, await mockUSDC.getAddress());
            expect(stakerCollateral).to.equal(ethers.parseUnits("1000", 6));
        });

        it("Should track yield correctly when enabled", async function() {
            await stakingPool.addStablecoin(await mockUSDC.getAddress(), ethers.parseUnits("100", 6), 6);
            
            // Stake
            await stakingPool.connect(staker).stake(await mockUSDC.getAddress(), ethers.parseUnits("1000", 6));
            
            // Simulate yield (10%)
            await mockAToken.mint(await stakingPool.getAddress(), ethers.parseUnits("100", 6));
            
            // Check pending yield
            expect(await stakingPool.getPendingYield(staker.address, await mockUSDC.getAddress()))
                .to.equal(ethers.parseUnits("100", 6));
        });
    });
}); 