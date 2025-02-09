const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ClaimsManager", function() {
    let claimsManager, stakingPool, insurancePool, mockUSDC, mockFTSO;
    let owner, user;
    
    const USDC_FEED = ethers.zeroPadValue(ethers.toUtf8Bytes("USDC"), 21);
    
    beforeEach(async function() {
        [owner, user] = await ethers.getSigners();
        
        // Deploy mock USDC
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC", 6);
        await mockUSDC.waitForDeployment();

        // Deploy mock FTSO
        const MockFTSO = await ethers.getContractFactory("MockFTSOv2");
        mockFTSO = await MockFTSO.deploy();
        await mockFTSO.waitForDeployment();

        // Deploy mock Venus Pool
        const MockVenusPool = await ethers.getContractFactory("MockVenusPool");
        const mockVenusPool = await MockVenusPool.deploy();
        await mockVenusPool.waitForDeployment();

        // Deploy StakingPool
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(await mockVenusPool.getAddress());
        await stakingPool.waitForDeployment();

        // Deploy InsurancePool
        const InsurancePool = await ethers.getContractFactory("InsurancePool");
        insurancePool = await InsurancePool.deploy(
            await stakingPool.getAddress(),
            owner.address
        );
        await insurancePool.waitForDeployment();

        // Deploy ClaimsManager
        const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
        claimsManager = await ClaimsManager.deploy(
            await mockUSDC.getAddress(),
            await insurancePool.getAddress(),
            await stakingPool.getAddress(),
            await mockFTSO.getAddress()
        );
        await claimsManager.waitForDeployment();

        // Configure USDC in ClaimsManager
        await claimsManager.configureStablecoin(
            await mockUSDC.getAddress(),
            USDC_FEED,
            ethers.parseUnits("0.95", 6),
            ethers.parseUnits("1", 6),
            100
        );

        // Set initial USDC price using setPrice21
        await mockFTSO.setPrice21(
            USDC_FEED,
            100000000n,  // $1.00 with 8 decimals
            8            // Will become -8 inside getFeedsById
        );
    });

    describe("Price Feeds", function() {
        it("Should get correct token price", async function() {
            await claimsManager.updateAndGetPrice(await mockUSDC.getAddress());
            const price = await claimsManager.getTokenPrice(await mockUSDC.getAddress());
            expect(price).to.equal(ethers.parseUnits("1", 18));
        });

        it("Should detect depeg condition", async function() {
            await mockFTSO.setPrice21(
                USDC_FEED,
                94000000n,   // $0.94 with 8 decimals
                8
            );
            
            await claimsManager.updateAndGetPrice(await mockUSDC.getAddress());
            const isDepegged = await claimsManager.isDepegged(await mockUSDC.getAddress());
            expect(isDepegged).to.be.true;
        });
    });

    describe("Price Feed Validations", function() {
        it("Should reject stale prices", async function() {
            const currentTime = await time.latest();
            await mockFTSO.setPrice21(USDC_FEED, 100000000n, 8);
            await claimsManager.updateAndGetPrice(await mockUSDC.getAddress());
            
            await time.increaseTo(currentTime + 7200);
            
            await expect(
                claimsManager.updateAndGetPrice(await mockUSDC.getAddress())
            ).to.be.revertedWith("Price too old");
        });

        it("Should reject large price changes", async function() {
            await mockFTSO.setPrice21(USDC_FEED, 100000000n, 8);
            await claimsManager.updateAndGetPrice(await mockUSDC.getAddress());

            await mockFTSO.setPrice21(USDC_FEED, 70000000n, 8);
            await expect(
                claimsManager.updateAndGetPrice(await mockUSDC.getAddress())
            ).to.be.revertedWith("Price change too large");
        });

        it("Should allow price changes within limits", async function() {
            await mockFTSO.setPrice21(USDC_FEED, 100000000n, 8);
            await claimsManager.updateAndGetPrice(await mockUSDC.getAddress());

            await mockFTSO.setPrice21(USDC_FEED, 85000000n, 8);
            await claimsManager.updateAndGetPrice(await mockUSDC.getAddress());
            const price = await claimsManager.getTokenPrice(await mockUSDC.getAddress());
            expect(price).to.equal(ethers.parseUnits("0.85", 18));
        });
    });

    // ... rest of claims tests ...
}); 