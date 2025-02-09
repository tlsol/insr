const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InsurancePool", function() {
    let insurancePool, stakingPool, mockUSDC, mockVenusPool, mockFTSO, calculator;
    let owner, user, insurer;

    beforeEach(async function() {
        [owner, user, insurer] = await ethers.getSigners();

        // Deploy mocks first
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy(
            "USDC",     // name
            "USDC",     // symbol
            6           // decimals
        );
        await mockUSDC.waitForDeployment();

        const MockFTSO = await ethers.getContractFactory("MockFTSOv2");
        mockFTSO = await MockFTSO.deploy();
        await mockFTSO.waitForDeployment();

        // Deploy MockVenusPool first
        const MockVenusPool = await ethers.getContractFactory("MockVenusPool");
        mockVenusPool = await MockVenusPool.deploy();
        await mockVenusPool.waitForDeployment();

        // Deploy StakingPool with VenusPool address
        const StakingPool = await ethers.getContractFactory("StakingPool");
        stakingPool = await StakingPool.deploy(await mockVenusPool.getAddress());
        await stakingPool.waitForDeployment();

        // Deploy Calculator first
        const Calculator = await ethers.getContractFactory("PremiumCalculator");
        calculator = await Calculator.deploy();
        await calculator.waitForDeployment();

        // Deploy InsurancePool with both required args
        const InsurancePool = await ethers.getContractFactory("InsurancePool");
        insurancePool = await InsurancePool.deploy(
            await stakingPool.getAddress(),
            await calculator.getAddress()
        );
        await insurancePool.waitForDeployment();

        // Set up relationships after deployment
        await stakingPool.setInsurancePool(await insurancePool.getAddress());

        // Deploy ClaimsManager with correct args
        const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
        const claimsManager = await ClaimsManager.deploy(
            await mockUSDC.getAddress(),
            await insurancePool.getAddress(),
            await stakingPool.getAddress(),
            await mockFTSO.getAddress()
        );
        await claimsManager.waitForDeployment();

        // Update ClaimsManager setup
        await insurancePool.updateComponent("claimsManager", await claimsManager.getAddress());

        // Configure USDC in calculator
        await calculator.addStablecoin(
            await mockUSDC.getAddress(),
            6,  // decimals
            ethers.parseUnits("100", 6),  // min coverage
            ethers.parseUnits("50000", 6)  // max coverage
        );

        // Mint some USDC to user for policy purchase
        await mockUSDC.mint(user.address, ethers.parseUnits("10000", 6));
        await mockUSDC.connect(user).approve(
            await insurancePool.getAddress(),
            ethers.MaxUint256
        );
    });

    describe("Policy Purchase", function() {
        it("Should purchase policy with USDC", async function() {
            const coverageAmount = ethers.parseUnits("1000", 6);
            const duration = 30 * 24 * 60 * 60;

            const tx = await insurancePool.connect(user).purchasePolicy(
                await mockUSDC.getAddress(),
                insurer.address,
                coverageAmount,
                duration
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === 'PolicyPurchased');
            expect(event).to.not.be.undefined;

            const policyId = event.args.policyId;
            const policy = await insurancePool.getPolicy(user.address, policyId);

            expect(policy.stablecoin).to.equal(await mockUSDC.getAddress());
            expect(policy.coverageAmount).to.equal(coverageAmount);
            expect(policy.active).to.be.true;
        });
    });

    describe("Claims Management", function() {
        it("Should approve claims manager for multiple stablecoins", async function() {
            // Deploy mock FTSO first
            const MockFTSO = await ethers.getContractFactory("MockFTSOv2");
            const mockFTSO = await MockFTSO.deploy();
            await mockFTSO.waitForDeployment();

            // Deploy ClaimsManager with correct args
            const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
            const claimsManager = await ClaimsManager.deploy(
                await mockUSDC.getAddress(),
                await insurancePool.getAddress(),
                await stakingPool.getAddress(),
                await mockFTSO.getAddress()
            );
            await claimsManager.waitForDeployment();

            // Set ClaimsManager in InsurancePool
            await insurancePool.updateComponent("claimsManager", await claimsManager.getAddress());

            // Now approve
            await insurancePool.approveClaimsManager(await mockUSDC.getAddress(), ethers.MaxUint256);
            
            expect(await mockUSDC.allowance(
                await insurancePool.getAddress(),
                await claimsManager.getAddress()
            )).to.equal(ethers.MaxUint256);
        });
    });
}); 