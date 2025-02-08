// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IFTSOv2.sol";

contract MockFTSOv2 is IFTSOv2 {
    mapping(bytes21 => uint256) public prices;
    mapping(bytes21 => int8) public decimals;

    constructor() {} // Empty constructor to fix deployment

    function setPrice(bytes21 feedId, uint256 price, int8 decimal) external {
        prices[feedId] = price;
        decimals[feedId] = decimal;
    }

    function getCurrentPrice(bytes21 _symbol) external view returns (uint256, uint256, uint256, bool) {
        return (prices[_symbol], block.timestamp, uint256(uint8(decimals[_symbol])), true);
    }

    function getFeedsById(bytes21[] memory _feedIds) external view returns (
        uint256[] memory _feedValues,
        int8[] memory _decimals,
        uint64 _timestamp
    ) {
        _feedValues = new uint256[](_feedIds.length);
        _decimals = new int8[](_feedIds.length);

        for(uint i = 0; i < _feedIds.length; i++) {
            _feedValues[i] = prices[_feedIds[i]];
            _decimals[i] = decimals[_feedIds[i]];
        }

        _timestamp = uint64(block.timestamp);
    }
} 