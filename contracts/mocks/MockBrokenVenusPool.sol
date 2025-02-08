// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockBrokenVenusPool {
    function mint(address, uint256) external pure returns (uint256) {
        revert("Venus down");
    }

    function redeem(address, uint256) external pure returns (uint256) {
        revert("Venus down");
    }
} 