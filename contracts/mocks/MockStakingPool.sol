// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IStakingPool.sol";

contract MockStakingPool is IStakingPool {
    address public immutable SELF;
    address public claimsManager;

    constructor() {
        SELF = address(this);
    }

    // Add receive function to accept ETH
    receive() external payable {}
    
    // Add fallback function just in case
    fallback() external payable {}

    function stake(address token, uint256 amount) external {}
    function unstake(address token, uint256 amount) external {}
    
    function createPolicy(
        address token,
        address insurer,
        uint256 coverageAmount,
        uint256 duration
    ) external returns (uint256) {
        return 1;
    }
    
    function getLockedCollateral(address insurer, address token) external pure returns (uint256) {
        return 0;
    }
    
    function getAvailableCollateral(address insurer, address token) external pure returns (uint256) {
        return 1000000;
    }
    
    function policies(uint256) external pure returns (
        address stablecoin,
        uint256 coverageAmount,
        uint256 expiration,
        address insurer,
        bool active
    ) {
        return (address(0), 0, 0, address(0), false);
    }
    
    function distributePremium(address stablecoin, uint256 amount) external {}

    function getAddress() external view returns (address) {
        return SELF;
    }

    function setClaimsManager(address _claimsManager) external {
        claimsManager = _claimsManager;
    }
} 