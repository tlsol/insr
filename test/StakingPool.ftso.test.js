const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StakingPool FTSO Integration", function() {
    let stakingPool, mockUSDC, mockFTSO, mockRegistry;
    let owner, staker;
    
    // FTSO Feed IDs (example from docs)
    const USDC_FEED = "0x015553444300000000000000000000000000000000"; // USDC feed
    
    beforeEach(async function() {
        [owner, staker] = await ethers.getSigners();
        
        // Deploy mock USDC
        const MockToken = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC", 6);
        await mockUSDC.waitForDeployment();

        // Deploy mock FTSO
        const MockFTSO = await ethers.getContractFactory("MockFTSOv2");
        mockFTSO = await MockFTSO.deploy();
        await mockFTSO.waitForDeployment();

        // Deploy mock Registry with fully qualified path
        const MockRegistry = await ethers.getContractFactory("contracts/mocks/MockRegistry.sol:MockRegistry");
        mockRegistry = await MockRegistry.deploy(await mockFTSO.getAddress());
        await mockRegistry.waitForDeployment();

        // Deploy StakingPool with both registry and venus pool
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(
            await mockRegistry.getAddress(),
            ethers.ZeroAddress
        );
        await stakingPool.waitForDeployment();

        // Add USDC feed
        await stakingPool.addTokenFeed(
            await mockUSDC.getAddress(),
            USDC_FEED
        );

        // Setup initial balances
        await mockUSDC.mint(staker.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(staker).approve(
            await stakingPool.getAddress(),
            ethers.MaxUint256
        );
    });

    describe("FTSO Price Feeds", function() {
        it("Should get correct token price", async function() {
            await mockFTSO.setPrice(USDC_FEED, 100n, 2n); // $1.00 with 2 decimals
            const price = await stakingPool.getTokenPrice.staticCall(await mockUSDC.getAddress());
            expect(price).to.equal(ethers.parseUnits("1", 18));
        });

        it("Should handle price updates", async function() {
            await mockFTSO.setPrice(USDC_FEED, 105n, 2n); // $1.05 with 2 decimals
            const price = await stakingPool.getTokenPrice.staticCall(await mockUSDC.getAddress());
            expect(price).to.equal(ethers.parseUnits("1.05", 18));
        });

        it("Should revert for unsupported token", async function() {
            await expect(
                stakingPool.getTokenPrice.staticCall(ethers.ZeroAddress)
            ).to.be.revertedWith("Feed not found");
        });

        it("Should allow admin to add new token feed", async function() {
            const newToken = ethers.Wallet.createRandom().address;
            const newFeed = "0x014254432f55534400000000000000000000000000"; // Different feed

            await stakingPool.addTokenFeed(newToken, newFeed);
            await mockFTSO.setPrice(newFeed, 5000000n, 2n); // $50,000.00
            
            const price = await stakingPool.getTokenPrice.staticCall(newToken);
            expect(price).to.equal(ethers.parseUnits("50000", 18));
        });

        it("Should handle different decimal places", async function() {
            await mockFTSO.setPrice(USDC_FEED, 100000n, 5n); // Still $1.00 but with 5 decimals
            const price = await stakingPool.getTokenPrice.staticCall(await mockUSDC.getAddress());
            expect(price).to.equal(ethers.parseUnits("1", 18));
        });
    });
}); 