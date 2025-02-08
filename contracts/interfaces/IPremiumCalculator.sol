// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPremiumCalculator {
    function calculatePremium(
        address stablecoin,
        uint256 coverageAmount,
        uint256 duration
    ) external view returns (uint256);

    function getStablecoinConfig(address _stablecoin) 
        external 
        view 
        returns (
            bool supported,
            uint8 decimals,
            uint256 minCoverage,
            uint256 maxCoverage
        );
} 