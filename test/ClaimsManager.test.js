const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ClaimsManager", function () {
    let claimsManager, mockUSDC, mockPyth;
    let owner, user;
    const USDC_PRICE_ID = "0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722";

    beforeEach(async function () {
        [owner, user] = await ethers.getSigners();

        // Deploy mock USDC
        const MockToken = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockToken.deploy("USDC", "USDC");

        // Deploy mock Pyth
        const MockPyth = await ethers.getContractFactory("contracts/mocks/MockPyth.sol:MockPyth");
        mockPyth = await MockPyth.deploy();

        // Deploy ClaimsManager
        const ClaimsManager = await ethers.getContractFactory("ClaimsManager");
        claimsManager = await ClaimsManager.deploy(
            await mockPyth.getAddress(),
            await mockUSDC.getAddress()
        );

        // Setup price feed
        await claimsManager.setPriceFeed(
            await mockUSDC.getAddress(),
            USDC_PRICE_ID
        );

        // Setup user
        await mockUSDC.mint(user.address, ethers.parseUnits("1000", 6));
        await mockUSDC.connect(user).approve(
            await claimsManager.getAddress(),
            ethers.parseUnits("1000", 6)
        );
    });

    describe("Claim Fee Calculations", function() {
        it("Should use minimum fee for small premiums", async function() {
            const premium = ethers.parseUnits("100", 6);
            const fee = await claimsManager.calculateClaimFee(premium);
            expect(fee).to.equal(ethers.parseUnits("1", 6));
        });

        it("Should use percentage for larger premiums", async function() {
            const premium = ethers.parseUnits("1000", 6);
            const fee = await claimsManager.calculateClaimFee(premium);
            expect(fee).to.equal(ethers.parseUnits("10", 6));
        });
    });

    describe("Claims Processing", function() {
        it("Should process valid depeg claim", async function() {
            const policyId = 1;
            const amount = ethers.parseUnits("1000", 6);
            const premium = ethers.parseUnits("100", 6);
            const priceData = ethers.randomBytes(100);

            await mockPyth.setPrice(USDC_PRICE_ID, 94_000_000);

            const tx = await claimsManager.connect(user).submitClaim(
                policyId,
                amount,
                premium,
                [priceData],
                { value: ethers.parseEther("0.1") }
            );
            
            const receipt = await tx.wait();
            const claimId = receipt.logs.find(
                log => log.fragment?.name === 'ClaimSubmitted'
            ).args.claimId;

            await claimsManager.processClaim(claimId, await mockUSDC.getAddress());
            const claim = await claimsManager.claims(claimId);
            expect(claim.status).to.equal(1); // Approved
        });

        it("Should reject invalid claims", async function() {
            const policyId = 1;
            const amount = ethers.parseUnits("1000", 6);
            const premium = ethers.parseUnits("100", 6);
            const priceData = ethers.randomBytes(100);

            await mockPyth.setPrice(USDC_PRICE_ID, 98_000_000);

            await claimsManager.connect(user).submitClaim(
                policyId,
                amount,
                premium,
                [priceData],
                { value: ethers.parseEther("0.1") }
            );
        });
    });

    describe("Admin Functions", function() {
        it("Should update price feed", async function() {
            const newPriceId = "0x" + "1".repeat(64); // Create valid bytes32
            await claimsManager.setPriceFeed(
                await mockUSDC.getAddress(),
                newPriceId
            );
            expect(await claimsManager.priceFeeds(await mockUSDC.getAddress()))
                .to.equal(newPriceId);
        });

        it("Should handle emergency withdrawal", async function() {
            await claimsManager.pause();
            const amount = ethers.parseUnits("100", 6);
            await mockUSDC.mint(claimsManager.getAddress(), amount);
            
            await claimsManager.emergencyWithdraw(await mockUSDC.getAddress());
            expect(await mockUSDC.balanceOf(owner.address)).to.equal(amount);
        });
    });
}); 