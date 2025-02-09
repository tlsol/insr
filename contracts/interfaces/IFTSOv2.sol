// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFTSOv2 {
    function getFeedsById(bytes21[] memory _feedIds) external view returns (
        uint256[] memory _values,
        int8[] memory _decimals,
        uint256[] memory _timestamps
    );
} 