// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStatistics {
    function recordNewPolicy(
        address user,
        address token,
        uint256 amount,
        uint256 duration
    ) external;
    
    function recordClaim(
        address user,
        address token,
        uint256 amount
    ) external;
} 