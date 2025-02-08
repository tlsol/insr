// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFTSOv2 {
    function getFeedsById(bytes21[] memory _feedIds) external returns (
        uint256[] memory _feedValues,
        int8[] memory _decimals,
        uint64 _timestamp
    );
} 