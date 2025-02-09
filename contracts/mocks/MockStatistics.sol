// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IStatistics.sol";

contract MockStatistics is IStatistics {
    bool public paused;
    uint256 public riskThreshold;

    function recordStake(address user, address token, uint256 amount) external returns (bool) {
        return true;
    }

    function recordWithdrawal(address user, address token, uint256 amount) external returns (bool) {
        return true;
    }

    function recordClaim(address user, address token, uint256 amount) external returns (bool) {
        return true;
    }

    function setRiskThreshold(uint256 _threshold) external {
        riskThreshold = _threshold;
    }

    function updateMetrics() external {
        paused = riskThreshold > 0;
    }
} 