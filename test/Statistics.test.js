const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InsuranceStatistics", function() {
    let statistics, stakingPool, claimsManager;
    let owner, user1, user2;
    
    const DAY_IN_SECONDS = 24 * 60 * 60;
    const THIRTY_DAYS = 30 * DAY_IN_SECONDS;
    
    beforeEach(async function() {
        [owner, user1, user2] = await ethers.getSigners();
        
        // Deploy mocks first
        const MockStakingPool = await ethers.getContractFactory("MockStakingPool");
        stakingPool = await MockStakingPool.deploy();
        await stakingPool.waitForDeployment();
        
        const MockClaimsManager = await ethers.getContractFactory("MockClaimsManager");
        claimsManager = await MockClaimsManager.deploy();
        await claimsManager.waitForDeployment();
        
        // Deploy Statistics
        const Statistics = await ethers.getContractFactory("InsuranceStatistics");
        statistics = await Statistics.deploy(
            await stakingPool.getAddress(),
            await claimsManager.getAddress()
        );
        await statistics.waitForDeployment();

        // Fund the contracts
        await owner.sendTransaction({
            to: await stakingPool.getAddress(),
            value: ethers.parseEther("1")
        });
        
        await owner.sendTransaction({
            to: await claimsManager.getAddress(),
            value: ethers.parseEther("1")
        });

        // Impersonate the contracts
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [await stakingPool.getAddress()]
        });
        
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [await claimsManager.getAddress()]
        });
    });
    
    describe("Risk Metrics", function() {
        it("Should calculate risk score correctly", async function() {
            const stakingPoolSigner = await ethers.getSigner(await stakingPool.getAddress());
            const claimsManagerSigner = await ethers.getSigner(await claimsManager.getAddress());
            
            // Create some test policies
            await statistics.connect(stakingPoolSigner).recordNewPolicy(
                user1.address,
                ethers.ZeroAddress,
                ethers.parseEther("1000"),
                THIRTY_DAYS
            );
            
            // Create some test claims
            await statistics.connect(claimsManagerSigner).recordClaim(
                user1.address,
                ethers.ZeroAddress,
                ethers.parseEther("500")
            );
            
            // Advance time by 1 day
            await hre.network.provider.send("evm_increaseTime", [DAY_IN_SECONDS]);
            await hre.network.provider.send("evm_mine");
            
            await statistics.updateMetrics();
            
            const riskMetrics = await statistics.riskMetrics();
            expect(riskMetrics.riskScore).to.be.gt(0);
        });
    });
    
    // ... more tests ...
}); 