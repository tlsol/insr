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

    describe("Rate Management", function() {
        it("Should initialize with default rates", async function() {
            expect(await calculator.rateCount()).to.equal(3);
            const rate = await calculator.durationRates(0);
            expect(rate.rate).to.equal(200);
        });

        it("Should update rate correctly", async function() {
            await calculator.updateRate(0, 0, 30 * 24 * 60 * 60, 300);
            const rate = await calculator.durationRates(0);
            expect(rate.rate).to.equal(300);
        });

        it("Should prevent rate overlap", async function() {
            await expect(calculator.updateRate(
                0,
                0,
                100 * 24 * 60 * 60,
                200
            )).to.be.revertedWith("Duration overlap with next rate");
        });
    });

    describe("Premium Calculation", function() {
        it("Should calculate premium correctly for different durations", async function() {
            const coverage = ethers.parseUnits("1000", 6);
            
            // 1 month
            const premium1 = await calculator.calculatePremium(
                coverage,
                30 * 24 * 60 * 60
            );
            expect(premium1).to.equal(coverage * 200n / 10000n);

            // 3 months
            const premium2 = await calculator.calculatePremium(
                coverage,
                90 * 24 * 60 * 60
            );
            expect(premium2).to.equal(coverage * 500n / 10000n);
        });

        it("Should enforce coverage limits", async function() {
            const duration = 30 * 24 * 60 * 60;
            
            await expect(calculator.calculatePremium(
                ethers.parseUnits("10", 6),
                duration
            )).to.be.revertedWith("Invalid coverage amount");

            await expect(calculator.calculatePremium(
                ethers.parseUnits("20000", 6),
                duration
            )).to.be.revertedWith("Invalid coverage amount");
        });
    });

    describe("Admin Functions", function() {
        it("Should pause and unpause correctly", async function() {
            await calculator.pause();
            await expect(calculator.calculatePremium(
                ethers.parseUnits("1000", 6),
                30 * 24 * 60 * 60
            )).to.be.revertedWith("Pausable: paused");

            await calculator.unpause();
            await calculator.calculatePremium(
                ethers.parseUnits("1000", 6),
                30 * 24 * 60 * 60
            );
        });
    });
}); 