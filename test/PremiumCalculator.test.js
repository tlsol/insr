const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PremiumCalculator", function() {
    let calculator;
    let owner, user;
    let mockUSDC, mockUSDT, mockDAI;

    // Common values
    const USDC_DECIMALS = 6;
    const DAI_DECIMALS = 18;
    const USDT_DECIMALS = 6;
    const DAY_IN_SECONDS = 24 * 60 * 60;

    beforeEach(async function() {
        [owner, user] = await ethers.getSigners();

        // Deploy mock tokens - fixed constructor arguments
        const MockToken = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC", USDC_DECIMALS);
        await mockUSDC.waitForDeployment();

        mockUSDT = await MockToken.deploy("USDT", "USDT", USDT_DECIMALS);
        await mockUSDT.waitForDeployment();

        mockDAI = await MockToken.deploy("DAI", "DAI", DAI_DECIMALS);
        await mockDAI.waitForDeployment();

        // Deploy calculator
        const Calculator = await ethers.getContractFactory("PremiumCalculator");
        calculator = await Calculator.deploy();
        await calculator.waitForDeployment();

        // Add supported stablecoins
        await calculator.addStablecoin(
            await mockUSDC.getAddress(),
            USDC_DECIMALS,
            ethers.parseUnits("100", USDC_DECIMALS),    // 100 USDC min
            ethers.parseUnits("50000", USDC_DECIMALS)   // 50k USDC max
        );

        await calculator.addStablecoin(
            await mockDAI.getAddress(),
            DAI_DECIMALS,
            ethers.parseUnits("100", DAI_DECIMALS),     // 100 DAI min
            ethers.parseUnits("1000000", DAI_DECIMALS)    // 1,000,000 DAI max
        );
    });

    describe("Stablecoin Management", function() {
        it("Should add new stablecoins correctly", async function() {
            const usdcConfig = await calculator.getStablecoinConfig(await mockUSDC.getAddress());
            expect(usdcConfig.supported).to.be.true;
            expect(usdcConfig.decimals).to.equal(USDC_DECIMALS);
            expect(usdcConfig.minCoverage).to.equal(ethers.parseUnits("100", USDC_DECIMALS));
        });

        it("Should reject duplicate stablecoins", async function() {
            await expect(
                calculator.addStablecoin(
                    await mockUSDC.getAddress(),
                    USDC_DECIMALS,
                    ethers.parseUnits("100", USDC_DECIMALS),
                    ethers.parseUnits("50000", USDC_DECIMALS)
                )
            ).to.be.revertedWith("Stablecoin already supported");
        });

        it("Should remove stablecoins", async function() {
            await calculator.removeStablecoin(await mockUSDC.getAddress());
            const config = await calculator.getStablecoinConfig(await mockUSDC.getAddress());
            expect(config.supported).to.be.false;
        });
    });

    describe("Premium Calculation", function() {
        it("Should calculate premiums correctly", async function() {
            const coverage = ethers.parseUnits("1000", USDC_DECIMALS);
            const duration = 30 * 24 * 60 * 60;

            const premium = await calculator.calculatePremium(
                await mockUSDC.getAddress(),
                coverage,
                duration
            );

            // 2% for 30 days
            expect(premium).to.equal(coverage * 200n / 10000n);
        });

        it("Should enforce coverage limits per stablecoin", async function() {
            const tooLow = ethers.parseUnits("50", USDC_DECIMALS);
            const tooHigh = ethers.parseUnits("60000", USDC_DECIMALS);
            const duration = 30 * 24 * 60 * 60;

            await expect(
                calculator.calculatePremium(await mockUSDC.getAddress(), tooLow, duration)
            ).to.be.revertedWith("Coverage too low");

            await expect(
                calculator.calculatePremium(await mockUSDC.getAddress(), tooHigh, duration)
            ).to.be.revertedWith("Coverage too high");
        });

        it("Should reject unsupported stablecoins", async function() {
            const coverage = ethers.parseUnits("1000", USDT_DECIMALS);
            const duration = 30 * 24 * 60 * 60;

            await expect(
                calculator.calculatePremium(await mockUSDT.getAddress(), coverage, duration)
            ).to.be.revertedWith("Unsupported stablecoin");
        });
    });

    describe("Duration Rates", function() {
        it("Should handle different durations correctly", async function() {
            const coverage = ethers.parseUnits("1000", USDC_DECIMALS);
            
            // 30 days - 2%
            const premium1 = await calculator.calculatePremium(
                await mockUSDC.getAddress(),
                coverage,
                30 * DAY_IN_SECONDS
            );
            expect(premium1).to.equal(coverage * 200n / 10000n);

            // 90 days - 5%
            const premium2 = await calculator.calculatePremium(
                await mockUSDC.getAddress(),
                coverage,
                90 * DAY_IN_SECONDS
            );
            expect(premium2).to.equal(coverage * 500n / 10000n);
        });

        it("Should allow owner to update duration rates", async function() {
            await calculator.updateDurationRate(
                0,
                7 * DAY_IN_SECONDS,
                30 * DAY_IN_SECONDS,
                300
            ); // Update to 3%
            
            const coverage = ethers.parseUnits("1000", USDC_DECIMALS);
            const premium = await calculator.calculatePremium(
                await mockUSDC.getAddress(),
                coverage,
                30 * DAY_IN_SECONDS
            );
            
            expect(premium).to.equal(coverage * 300n / 10000n);
        });
    });

    describe("DAI Premium Calculations", function() {
        it("Should calculate correct premium for DAI", async function() {
            const coverage = ethers.parseUnits("1000", DAI_DECIMALS);
            const duration = 30 * 24 * 60 * 60; // 30 days
            
            const premium = await calculator.calculatePremium(
                await mockDAI.getAddress(),
                coverage,
                duration
            );
            
            // Verify premium calculation
            expect(premium).to.be.gt(0);
        });
    });
}); 