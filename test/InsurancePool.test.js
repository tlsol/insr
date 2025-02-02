const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InsurancePool", function () {
    let insurancePool, calculator, stakingPool, claimsManager;
    let mockUSDC, mockPyth;
    let owner, insurer, user;
    const USDC_PRICE_ID = "0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722";
    
    beforeEach(async function () {
        [owner, insurer, user] = await ethers.getSigners();
        
        // Deploy mock USDC
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC");
        
        // Deploy mock Pyth FIRST
        const MockPyth = await ethers.getContractFactory("contracts/mocks/MockPyth.sol:MockPyth");
        mockPyth = await MockPyth.deploy();
        
        // Deploy calculator
        const PremiumCalculator = await ethers.getContractFactory("PremiumCalculator");
        calculator = await PremiumCalculator.deploy();
        
        // Deploy StakingPool with owner as deployer
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(ethers.ZeroAddress);
        
        // Deploy ClaimsManager
        const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
        claimsManager = await ClaimsManager.deploy(
            await mockPyth.getAddress(),
            await mockUSDC.getAddress()
        );
        
        // Deploy InsurancePool
        const InsurancePool = await ethers.getContractFactory("InsurancePool");
        insurancePool = await InsurancePool.deploy(
            await mockUSDC.getAddress(),
            await calculator.getAddress(),
            await stakingPool.getAddress(),
            await claimsManager.getAddress()
        );

        // Setup staking pool
        await stakingPool.addStablecoin(
            await mockUSDC.getAddress(),
            ethers.parseUnits("100", 6),
            6
        );
        
        // Transfer ownership AFTER everything is set up
        await stakingPool.transferOwnership(await insurancePool.getAddress());
        
        // Setup staking
        await mockUSDC.mint(insurer.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(insurer).approve(await stakingPool.getAddress(), ethers.parseUnits("10000", 6));
        await stakingPool.connect(insurer).stake(
            await mockUSDC.getAddress(),
            ethers.parseUnits("5000", 6)
        );
        
        // Setup user
        await mockUSDC.mint(user.address, ethers.parseUnits("1000", 6));
        await mockUSDC.connect(user).approve(await insurancePool.getAddress(), ethers.parseUnits("1000", 6));
    });

    describe("Policy Purchase", function() {
        it("Should purchase policy and distribute premium", async function() {
            const coverageAmount = ethers.parseUnits("1000", 6);
            const duration = 30 * 24 * 60 * 60;
            
            await insurancePool.connect(user).purchasePolicy(
                await mockUSDC.getAddress(),
                insurer.address,
                coverageAmount,
                duration
            );
            
            const expectedPremium = await calculator.calculatePremium(coverageAmount, duration);
            const policy = await insurancePool.userPolicies(user.address, 1);
            expect(policy.premium).to.equal(expectedPremium);
        });

        it("Should fail with invalid parameters", async function() {
            await expect(insurancePool.connect(user).purchasePolicy(
                ethers.ZeroAddress,
                insurer.address,
                ethers.parseUnits("1000", 6),
                30 * 24 * 60 * 60
            )).to.be.revertedWith("Invalid address");
        });
    });

    describe("Claims Management", function() {
        beforeEach(async function() {
            const coverageAmount = ethers.parseUnits("1000", 6);
            const duration = 30 * 24 * 60 * 60;
            
            // SET THE PRICE FEED FIRST!!!!!
            await claimsManager.setPriceFeed(
                await mockUSDC.getAddress(),
                USDC_PRICE_ID
            );
            
            // MINT MORE USDC FOR EVERYONE
            await mockUSDC.mint(user.address, ethers.parseUnits("2000", 6));
            await mockUSDC.mint(await insurancePool.getAddress(), ethers.parseUnits("2000", 6));
            
            // User approves InsurancePool
            await mockUSDC.connect(user).approve(
                await insurancePool.getAddress(), 
                ethers.parseUnits("2000", 6)
            );

            // INSURANCE POOL APPROVES CLAIMS MANAGER
            await insurancePool.connect(owner).approveClaimsManager(
                await mockUSDC.getAddress(),
                ethers.parseUnits("2000", 6)
            );

            await insurancePool.connect(user).purchasePolicy(
                await mockUSDC.getAddress(),
                insurer.address,
                coverageAmount,
                duration
            );
        });

        it("Should submit and process claim", async function() {
            await mockPyth.setPrice(USDC_PRICE_ID, 94_000_000);
            const priceUpdateData = ethers.randomBytes(100);
            
            await insurancePool.connect(user).submitClaim(1, [priceUpdateData], {
                value: ethers.parseEther("0.1")
            });
            
            await insurancePool.connect(user).processClaim(1);
            
            const policy = await insurancePool.userPolicies(user.address, 1);
            expect(policy.claimed).to.be.true;
        });
    });

    describe("Emergency and Admin Functions", function() {
        it("Should allow emergency withdrawal when paused", async function() {
            await mockUSDC.mint(insurancePool.getAddress(), ethers.parseUnits("100", 6));
            await insurancePool.pause();
            await insurancePool.emergencyWithdraw(await mockUSDC.getAddress());
        });

        it("Should update components correctly", async function() {
            const NewCalculator = await ethers.getContractFactory("PremiumCalculator");
            const newCalculator = await NewCalculator.deploy();
            
            await insurancePool.updateComponent("calculator", await newCalculator.getAddress());
            expect(await insurancePool.calculator()).to.equal(await newCalculator.getAddress());
        });

        it("Should distribute premiums correctly", async function() {
            // Create policy first
            const coverageAmount = ethers.parseUnits("1000", 6);
            const duration = 30 * 24 * 60 * 60;
            
            await insurancePool.connect(user).purchasePolicy(
                await mockUSDC.getAddress(),
                insurer.address,
                coverageAmount,
                duration
            );

            // Add premium to distribute
            const premium = ethers.parseUnits("100", 6);
            await mockUSDC.mint(insurancePool.getAddress(), premium);
            
            // Should work now that ownership is transferred
            await insurancePool.connect(owner).distributePremiums();
        });
    });
}); 