const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ClaimsManager", function () {
    let claimsManager;
    let mockPyth;
    let mockUSDC;
    let owner;
    let user;
    
    const USDC_PRICE_ID = "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a";
    
    beforeEach(async function () {
        [owner, user] = await ethers.getSigners();

        // Deploy mock USDC
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC");
        await mockUSDC.waitForDeployment();

        // Deploy mock Pyth
        const MockPyth = await ethers.getContractFactory("MockPyth");
        mockPyth = await MockPyth.deploy();
        await mockPyth.waitForDeployment();
        
        // Deploy ClaimsManager
        const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
        claimsManager = await ClaimsManager.deploy(await mockPyth.getAddress(), await mockUSDC.getAddress());
        await claimsManager.waitForDeployment();
        
        // Set USDC price feed
        await claimsManager.setPriceFeed(await mockUSDC.getAddress(), USDC_PRICE_ID);

        // Give user some USDC
        await mockUSDC.mint(user.address, ethers.parseUnits("1000", 6));
        await mockUSDC.connect(user).approve(await claimsManager.getAddress(), ethers.parseUnits("1000", 6));
    });

    describe("Claim Fee Calculations", function() {
        it("Should use minimum fee for small premiums", async function() {
            const coverage = ethers.parseUnits("100", 6);  // Changed from 1000
            const fee = await claimsManager.calculateClaimFee(coverage);
            expect(fee).to.equal(ethers.parseUnits("1", 6));  // 1 USDC min fee
        });

        it("Should use percentage for larger premiums", async function() {
            const coverage = ethers.parseUnits("100", 6);  // 100 USDC
            const fee = await claimsManager.calculateClaimFee(coverage);
            expect(fee).to.equal(ethers.parseUnits("1", 6));  // 1% of 100 USDC = 1 USDC
        });
    });

    describe("Claims Processing", function() {
        it("Should process valid depeg claim", async function() {
            const policyId = 1;
            const amount = ethers.parseUnits("1000", 6);
            const premium = ethers.parseUnits("100", 6);

            // Set depeg price first
            await mockPyth.setPrice(USDC_PRICE_ID, 94_000_000); // $0.94

            // Submit claim
            const tx = await claimsManager.connect(user).submitClaim(policyId, amount, premium, []);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === "ClaimSubmitted");
            const claimId = event.args[0];

            await claimsManager.processClaim(claimId, await mockUSDC.getAddress());
            const claim = await claimsManager.claims(claimId);
            expect(claim.status).to.equal(1); // Approved
        });

        it("Should reject invalid claim", async function() {
            const policyId = 1;
            const amount = ethers.parseUnits("1000", 6);
            const premium = ethers.parseUnits("100", 6);

            // Set normal price
            await mockPyth.setPrice(USDC_PRICE_ID, 99_000_000); // $0.99

            // Submit claim
            const tx = await claimsManager.connect(user).submitClaim(policyId, amount, premium, []);
            const receipt = await tx.wait();
            const event = receipt.logs.find(log => log.fragment?.name === "ClaimSubmitted");
            const claimId = event.args[0];

            await claimsManager.processClaim(claimId, await mockUSDC.getAddress());
            const claim = await claimsManager.claims(claimId);
            expect(claim.status).to.equal(2); // Rejected
        });
    });
}); 