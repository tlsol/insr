// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakingPool {
    function stake(address token, uint256 amount) external;
    function unstake(address token, uint256 amount) external;
    function createPolicy(
        address token,
        address insurer,
        uint256 coverageAmount,
        uint256 duration
    ) external returns (uint256);
    
    function getLockedCollateral(address insurer, address token) external view returns (uint256);
    function getAvailableCollateral(address insurer, address token) external view returns (uint256);
    function policies(uint256 policyId) external view returns (
        address stablecoin,
        uint256 coverageAmount,
        uint256 expiration,
        address insurer,
        bool active
    );
    function distributePremium(address stablecoin, uint256 amount) external;
} 