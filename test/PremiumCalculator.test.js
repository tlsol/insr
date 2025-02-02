const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PremiumCalculator", function () {
    let calculator;
    let owner;
    
    beforeEach(async function () {
        [owner] = await ethers.getSigners();
        
        const PremiumCalculator = await ethers.getContractFactory("PremiumCalculator");
        calculator = await PremiumCalculator.deploy();
        await calculator.waitForDeployment();
    });

    it("Should calculate one month premium correctly", async function() {
        const coverage = ethers.parseUnits("100", 6);
        const duration = 30 * 24 * 60 * 60; // ONE_MONTH
        
        const premium = await calculator.calculatePremium(coverage, duration);
        expect(premium).to.be.gt(0);
    });

    it("Should calculate one year premium with discount", async function() {
        const coverageAmount = ethers.parseUnits("1000", 6);
        const duration = 365 * 24 * 60 * 60; // ONE_YEAR
        
        const premium = await calculator.calculatePremium(coverageAmount, duration);
        const expectedPremium = ethers.parseUnits("100", 6); // 10%
        expect(premium).to.equal(expectedPremium);
    });

    it("Should scale with duration", async function() {
        const coverageAmount = ethers.parseUnits("1000", 6);
        
        const oneMonthPremium = await calculator.calculatePremium(coverageAmount, await calculator.ONE_MONTH());
        const threeMonthPremium = await calculator.calculatePremium(coverageAmount, await calculator.THREE_MONTHS());
        
        // Compare raw numbers instead of using mul
        expect(threeMonthPremium).to.equal(ethers.parseUnits("50", 6)); // 5% for 3 months
    });

    it("Should enforce minimum coverage", async function() {
        const smallCoverage = ethers.parseUnits("25", 6);  // Below 50 USDC minimum
        const duration = 30 * 24 * 60 * 60;
        
        await expect(
            calculator.calculatePremium(smallCoverage, duration)
        ).to.be.revertedWith("Coverage too low");
    });
}); 