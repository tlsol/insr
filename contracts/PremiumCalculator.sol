// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract PremiumCalculator is Ownable, Pausable {
    uint256 public constant RATE_DECIMALS = 10000;
    
    struct DurationRate {
        uint256 minDuration;
        uint256 maxDuration;
        uint256 rate;
    }
    
    // Duration bounds
    uint256 public constant MIN_DURATION = 7 days;
    uint256 public constant MAX_DURATION = 365 days;
    
    // Coverage bounds
    uint256 public constant MIN_COVERAGE = 50e6;  // 50 USDC minimum coverage
    uint256 public constant MAX_COVERAGE = 10000e6;  // 10k USDC maximum coverage
    uint256 public constant MIN_PREMIUM = 1e6;  // 1 USDC minimum premium
    
    // Rates for different durations
    mapping(uint256 => DurationRate) public durationRates;
    uint256 public rateCount;
    
    event RateUpdated(uint256 indexed index, uint256 minDuration, uint256 maxDuration, uint256 rate);
    event RateRemoved(uint256 indexed index);
    
    constructor() {
        // Initialize default rates
        _addRate(0, 30 days, 200);     // 2% for up to 1 month
        _addRate(30 days, 90 days, 500);  // 5% for 1-3 months
        _addRate(90 days, 365 days, 1000); // 10% for 3-12 months
    }
    
    function _addRate(uint256 minDuration, uint256 maxDuration, uint256 rate) private {
        require(minDuration < maxDuration, "Invalid duration range");
        require(rate > 0 && rate < RATE_DECIMALS, "Invalid rate");
        
        durationRates[rateCount] = DurationRate({
            minDuration: minDuration,
            maxDuration: maxDuration,
            rate: rate
        });
        
        emit RateUpdated(rateCount, minDuration, maxDuration, rate);
        rateCount++;
    }
    
    function updateRate(
        uint256 index,
        uint256 minDuration,
        uint256 maxDuration,
        uint256 rate
    ) external onlyOwner {
        require(index < rateCount, "Invalid rate index");
        require(minDuration < maxDuration, "Invalid duration range");
        require(rate > 0 && rate < RATE_DECIMALS, "Invalid rate");
        
        // Ensure no gaps in duration coverage
        if (index > 0) {
            require(minDuration >= durationRates[index - 1].maxDuration, "Duration overlap with previous rate");
        }
        if (index < rateCount - 1) {
            require(maxDuration <= durationRates[index + 1].minDuration, "Duration overlap with next rate");
        }
        
        durationRates[index] = DurationRate({
            minDuration: minDuration,
            maxDuration: maxDuration,
            rate: rate
        });
        
        emit RateUpdated(index, minDuration, maxDuration, rate);
    }
    
    function removeRate(uint256 index) external onlyOwner {
        require(index < rateCount, "Invalid rate index");
        require(rateCount > 1, "Cannot remove last rate");
        
        // Shift remaining rates
        for (uint256 i = index; i < rateCount - 1; i++) {
            durationRates[i] = durationRates[i + 1];
        }
        delete durationRates[rateCount - 1];
        rateCount--;
        
        emit RateRemoved(index);
    }
    
    function calculatePremium(
        uint256 coverage,
        uint256 duration
    ) external view whenNotPaused returns (uint256) {
        require(coverage >= MIN_COVERAGE && coverage <= MAX_COVERAGE, "Invalid coverage amount");
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "Invalid duration");
        
        uint256 rate;
        bool rateFound = false;
        
        // Find applicable rate
        for (uint256 i = 0; i < rateCount; i++) {
            DurationRate memory dRate = durationRates[i];
            if (duration >= dRate.minDuration && duration <= dRate.maxDuration) {
                rate = dRate.rate;
                rateFound = true;
                break;
            }
        }
        
        require(rateFound, "No rate found for duration");
        
        uint256 premium = (coverage * rate) / RATE_DECIMALS;
        require(premium >= MIN_PREMIUM, "Premium too low");
        
        return premium;
    }
    
    function getRateCount() external view returns (uint256) {
        return rateCount;
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
} 