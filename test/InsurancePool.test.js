const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("InsurancePool", function() {
    let insurancePool, stakingPool, calculator, claimsManager;
    let owner, user, insurer;
    let mockUSDC, mockDAI, mockPyth;

    const USDC_DECIMALS = 6;
    const DAI_DECIMALS = 18;

    beforeEach(async function() {
        [owner, user, insurer] = await ethers.getSigners();

        // Deploy mock tokens
        const MockToken = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC", USDC_DECIMALS);
        await mockUSDC.waitForDeployment();

        mockDAI = await MockToken.deploy("DAI", "DAI", DAI_DECIMALS);
        await mockDAI.waitForDeployment();

        // Deploy mock StakingPool
        const MockStakingPool = await ethers.getContractFactory("contracts/mocks/MockStakingPool.sol:MockStakingPool", owner);
        stakingPool = await MockStakingPool.deploy();
        await stakingPool.waitForDeployment();

        // Deploy calculator
        const Calculator = await ethers.getContractFactory("PremiumCalculator");
        calculator = await Calculator.deploy();
        await calculator.waitForDeployment();

        // Deploy InsurancePool
        const InsurancePool = await ethers.getContractFactory("InsurancePool");
        insurancePool = await InsurancePool.deploy(
            await stakingPool.getAddress(), 
            await calculator.getAddress()
        );
        await insurancePool.waitForDeployment();

        // Configure InsurancePool's components
        await insurancePool.updateComponent("stakingPool", await stakingPool.getAddress());
        await insurancePool.updateComponent("calculator", await calculator.getAddress());

        // Deploy mockPyth first
        const MockPyth = await ethers.getContractFactory("MockPyth");
        const mockPyth = await MockPyth.deploy();
        await mockPyth.waitForDeployment();

        // Then deploy ClaimsManager with all dependencies
        const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
        claimsManager = await ClaimsManager.deploy(
            await mockPyth.getAddress(),
            await mockUSDC.getAddress(),
            await insurancePool.getAddress()
        );
        await claimsManager.waitForDeployment();

        // Update InsurancePool's claimsManager component
        await insurancePool.updateComponent("claimsManager", await claimsManager.getAddress());

        // Configure the Calculator with stablecoin settings
        await calculator.addStablecoin(
            await mockUSDC.getAddress(),
            USDC_DECIMALS,
            ethers.parseUnits("100", USDC_DECIMALS),
            ethers.parseUnits("50000", USDC_DECIMALS)
        );
        await calculator.addStablecoin(
            await mockDAI.getAddress(),
            DAI_DECIMALS,
            ethers.parseUnits("100", DAI_DECIMALS),
            ethers.parseUnits("50000", DAI_DECIMALS)
        );

        // Mint tokens to user and set approvals
        await mockUSDC.mint(user.address, ethers.parseUnits("10000", USDC_DECIMALS));
        await mockDAI.mint(user.address, ethers.parseUnits("10000", DAI_DECIMALS));
        await mockUSDC.connect(user).approve(insurancePool.getAddress(), ethers.MaxUint256);
        await mockDAI.connect(user).approve(insurancePool.getAddress(), ethers.MaxUint256);
    });

    describe("Policy Purchase", function() {
        it("Should purchase policy with USDC", async function() {
            const coverageAmount = ethers.parseUnits("1000", USDC_DECIMALS);
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

        it("Should purchase policy with DAI", async function() {
            const coverageAmount = ethers.parseUnits("1000", DAI_DECIMALS);
            const duration = 30 * 24 * 60 * 60;

            const tx = await insurancePool.connect(user).purchasePolicy(
                await mockDAI.getAddress(),
                insurer.address,
                coverageAmount,
                duration
            );
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === 'PolicyPurchased');
            const policyId = event.args.policyId;
            const policy = await insurancePool.getPolicy(user.address, policyId);

            expect(policy.stablecoin).to.equal(await mockDAI.getAddress());
            expect(policy.coverageAmount).to.equal(coverageAmount);
        });
    });

    describe("Claims Management", function() {
        it("Should approve claims manager for multiple stablecoins", async function() {
            await insurancePool.approveClaimsManager(
                await mockUSDC.getAddress(),
                ethers.parseUnits("10000", USDC_DECIMALS)
            );
            await insurancePool.approveClaimsManager(
                await mockDAI.getAddress(),
                ethers.parseUnits("10000", DAI_DECIMALS)
            );

            expect(await insurancePool.claimsManagerAllowance(await mockUSDC.getAddress()))
                .to.equal(ethers.parseUnits("10000", USDC_DECIMALS));
            expect(await insurancePool.claimsManagerAllowance(await mockDAI.getAddress()))
                .to.equal(ethers.parseUnits("10000", DAI_DECIMALS));
        });
    });
}); 