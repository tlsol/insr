// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract PremiumCalculator is Ownable, Pausable {
    uint256 public constant RATE_DECIMALS = 10000;
    
    // Stablecoin configuration
    struct StablecoinConfig {
        bool supported;
        uint8 decimals;
        uint256 minCoverage;    // Minimum coverage amount in stablecoin's decimals
        uint256 maxCoverage;    // Maximum coverage amount in stablecoin's decimals
    }
    
    // Duration-based rate configuration
    struct DurationRate {
        uint256 minDuration;    // Minimum duration in seconds
        uint256 maxDuration;    // Maximum duration in seconds
        uint256 rate;          // Rate in basis points (1/10000)
    }

    // Mapping of stablecoin address to its configuration
    mapping(address => StablecoinConfig) public stablecoins;
    
    // Array to store duration rates
    DurationRate[] public durationRates;
    
    // Duration bounds
    uint256 public constant MIN_DURATION = 7 days;
    uint256 public constant MAX_DURATION = 365 days;
    
    // Coverage bounds
    uint256 public constant MIN_PREMIUM = 1e6;  // 1 USDC minimum premium
    
    event StablecoinAdded(address stablecoin, uint8 decimals, uint256 minCoverage, uint256 maxCoverage);
    event StablecoinRemoved(address stablecoin);
    event DurationRateUpdated(uint256 index, uint256 minDuration, uint256 maxDuration, uint256 rate);
    event RateUpdated(uint256 indexed index, uint256 minDuration, uint256 maxDuration, uint256 rate);
    event RateRemoved(uint256 indexed index);
    
    constructor() {
        // Initialize with default duration rates
        durationRates.push(DurationRate(7 days, 30 days, 200));    // 2% for 1-4 weeks
        durationRates.push(DurationRate(30 days, 90 days, 500));   // 5% for 1-3 months
        durationRates.push(DurationRate(90 days, 180 days, 900));  // 9% for 3-6 months
    }
    
    function addStablecoin(
        address _stablecoin,
        uint8 _decimals,
        uint256 _minCoverage,
        uint256 _maxCoverage
    ) external onlyOwner {
        require(_stablecoin != address(0), "Invalid stablecoin address");
        require(!stablecoins[_stablecoin].supported, "Stablecoin already supported");
        
        stablecoins[_stablecoin] = StablecoinConfig({
            supported: true,
            decimals: _decimals,
            minCoverage: _minCoverage,
            maxCoverage: _maxCoverage
        });

        emit StablecoinAdded(_stablecoin, _decimals, _minCoverage, _maxCoverage);
    }

    function removeStablecoin(address _stablecoin) external onlyOwner {
        require(stablecoins[_stablecoin].supported, "Stablecoin not supported");
        delete stablecoins[_stablecoin];
        emit StablecoinRemoved(_stablecoin);
    }
    
    function calculatePremium(
        address _stablecoin,
        uint256 _coverageAmount,
        uint256 _duration
    ) external view returns (uint256) {
        StablecoinConfig memory config = stablecoins[_stablecoin];
        require(config.supported, "Unsupported stablecoin");
        require(_coverageAmount >= config.minCoverage, "Coverage too low");
        require(_coverageAmount <= config.maxCoverage, "Coverage too high");
        
        // Find the appropriate duration rate
        uint256 rate;
        bool durationFound = false;
        
        for (uint256 i = 0; i < durationRates.length; i++) {
            if (_duration >= durationRates[i].minDuration && 
                _duration <= durationRates[i].maxDuration) {
                rate = durationRates[i].rate;
                durationFound = true;
                break;
            }
        }
        
        require(durationFound, "Invalid duration");

        // Calculate premium: coverage * rate / 10000
        return (_coverageAmount * rate) / 10000;
    }
    
    function updateDurationRate(
        uint256 _index,
        uint256 _minDuration,
        uint256 _maxDuration,
        uint256 _rate
    ) external onlyOwner {
        require(_index < durationRates.length, "Invalid index");
        require(_rate <= 10000, "Rate too high"); // Max 100%
        
        durationRates[_index] = DurationRate({
            minDuration: _minDuration,
            maxDuration: _maxDuration,
            rate: _rate
        });

        emit DurationRateUpdated(_index, _minDuration, _maxDuration, _rate);
    }
    
    function getDurationRatesLength() external view returns (uint256) {
        return durationRates.length;
    }
    
    function getStablecoinConfig(address _stablecoin) 
        external 
        view 
        returns (
            bool supported,
            uint8 decimals,
            uint256 minCoverage,
            uint256 maxCoverage
        ) 
    {
        StablecoinConfig memory config = stablecoins[_stablecoin];
        return (
            config.supported,
            config.decimals,
            config.minCoverage,
            config.maxCoverage
        );
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
} 