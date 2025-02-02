// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPyth {
    struct Price {
        int64 price;
        uint256 conf;
        int32 expo;
        uint256 timestamp;
    }
    
    mapping(bytes32 => Price) public prices;
    
    function getPriceNoOlderThan(bytes32 id, uint256) external view returns (Price memory) {
        return prices[id];
    }
    
    function setPrice(bytes32 id, int64 price) external {
        prices[id] = Price(price, 0, 0, block.timestamp);
    }
    
    function updatePriceFeeds(bytes[] calldata) external payable {
        // Mock implementation - do nothing
    }
} 