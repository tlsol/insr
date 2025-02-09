// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStatistics {
    function recordStake(address user, address token, uint256 amount) external returns (bool);
    function recordWithdrawal(address user, address token, uint256 amount) external returns (bool);
    function recordClaim(address user, address token, uint256 amount) external returns (bool);
} 