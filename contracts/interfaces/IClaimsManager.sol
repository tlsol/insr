// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IClaimsManager {
    enum ClaimStatus {
        Pending,
        Approved,
        Rejected,
        Paid
    }

    function submitClaim(uint256 policyId, uint256 amount) external returns (uint256);
    function processClaim(uint256 claimId, bool approved) external;
    function calculateClaimFee(
        address stablecoin,
        uint256 amount
    ) external view returns (uint256);
    function claims(uint256 claimId) external view returns (
        address user,
        address stablecoin,
        uint256 policyId,
        uint256 amount,
        uint256 fee,
        uint256 timestamp,
        ClaimStatus status
    );
} 