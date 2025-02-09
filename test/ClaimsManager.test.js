const { expect } = require("chai");
const { ethers } = require("hardhat");

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
            // Get raw values from FTSO first
            const feedIds = [USDC_FEED];
            const [values, decimals] = await mockFTSO.getFeedsById(feedIds);
            console.log("FTSO values:", values[0].toString());
            console.log("FTSO decimals:", decimals[0].toString());

            // Then get price through ClaimsManager
            const price = await claimsManager.getTokenPrice(await mockUSDC.getAddress());
            console.log("ClaimsManager price:", price.toString());
            
            expect(price).to.equal(ethers.parseUnits("1", 18));
        });

        it("Should detect depeg condition", async function() {
            await mockFTSO.setPrice21(
                USDC_FEED,
                94000000n,
                8
            );
            
            const isDepegged = await claimsManager.isDepegged(await mockUSDC.getAddress());
            const price = await claimsManager.getTokenPrice(await mockUSDC.getAddress());
            console.log("Depeg price:", price.toString());
            console.log("Depeg threshold:", ethers.parseUnits("0.95", 6).toString());
            
            expect(isDepegged).to.be.true;
        });
    });

    // ... rest of claims tests ...
}); 