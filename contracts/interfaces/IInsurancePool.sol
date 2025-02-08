// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IInsurancePool {
    struct Policy {
        address stablecoin;
        uint256 coverageAmount;
        uint256 premium;
        uint256 expiration;
        address insurer;
        uint256 claimId;
        bool claimed;
        bool active;
    }

    function getPolicy(address user, uint256 policyId) external view returns (Policy memory);
    function approveClaimsManager(address stablecoin, uint256 amount) external;
    function purchasePolicy(
        address stablecoin,
        address insurer,
        uint256 coverageAmount,
        uint256 duration
    ) external returns (uint256);
    function isPolicyActive(address user, uint256 policyId) external view returns (bool);
} 