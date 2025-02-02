// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract MockPyth {
    mapping(bytes32 => int64) private prices;

    // Just the bare minimum we actually use
    function getPriceNoOlderThan(bytes32 id, uint256) external view returns (PythStructs.Price memory) {
        return PythStructs.Price(
            prices[id], // price
            0,         // conf
            0,         // expo
            0          // timestamp
        );
    }

    // For tests to set prices
    function setPrice(bytes32 id, int64 price) external {
        prices[id] = price;
    }

    // To match interface call in ClaimsManager
    function updatePriceFeeds(bytes[] calldata) external payable {}
} 