// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PremiumCalculator {
    uint256 constant RATE_DECIMALS = 10000;
    
    uint256 constant ONE_MONTH_RATE = 200;  // 2% for 1 month
    uint256 constant THREE_MONTH_RATE = 500; // 5% for 3 months
    uint256 constant ONE_YEAR_RATE = 1000;   // 10% for 1 year
    
    uint256 public constant ONE_MONTH = 30 days;
    uint256 public constant THREE_MONTHS = 90 days;
    uint256 public constant ONE_YEAR = 365 days;

    uint256 public constant MIN_COVERAGE = 50e6;  // 50 USDC minimum coverage
    uint256 public constant MAX_COVERAGE = 10000e6;  // 10k USDC maximum coverage
    
    uint256 public constant MIN_PREMIUM = 1e6;  // 1 USDC minimum premium

    function calculatePremium(uint256 coverage, uint256 duration) external pure returns (uint256) {
        require(coverage >= MIN_COVERAGE, "Coverage too low");
        require(coverage <= MAX_COVERAGE, "Coverage too high");
        uint256 rate;
        
        if (duration == ONE_MONTH) {
            rate = ONE_MONTH_RATE;
        } else if (duration == THREE_MONTHS) {
            rate = THREE_MONTH_RATE;
        } else if (duration == ONE_YEAR) {
            rate = ONE_YEAR_RATE;
        } else {
            revert("Invalid duration");
        }
        
        return (coverage * rate) / RATE_DECIMALS;
    }
} 