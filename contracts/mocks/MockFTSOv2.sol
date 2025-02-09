// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IFTSOv2.sol";

contract MockFTSOv2 is IFTSOv2 {
    struct PriceData {
        uint64 price;
        uint32 decimalPrecision;
        uint256 timestamp;
    }

    mapping(bytes32 => PriceData) private priceRecords;

    constructor() {}

    function setPrice(
        bytes memory priceId,
        uint64 priceValue,
        uint32 precision
    ) external {
        bytes32 storageId;
        if (priceId.length == 21) {
            storageId = bytes32(bytes.concat(priceId, bytes11(0)));
        } else if (priceId.length == 32) {
            storageId = bytes32(priceId);
        } else {
            revert("Invalid price ID length");
        }
        
        priceRecords[storageId] = PriceData({
            price: priceValue,
            decimalPrecision: precision,
            timestamp: block.timestamp
        });
    }

    /// @notice Sets a price using bytes21
    /// @param priceId Symbol as bytes21
    /// @param priceValue New price value
    /// @param precision Number of decimals for the price
    function setPrice21(
        bytes21 priceId,
        uint64 priceValue,
        uint32 precision
    ) external {
        bytes32 storageId = bytes32(bytes.concat(priceId, bytes11(0)));
        priceRecords[storageId] = PriceData({
            price: priceValue,
            decimalPrecision: precision,
            timestamp: block.timestamp
        });
    }

    function getPrice(bytes21 priceId) external view returns (PriceData memory) {
        return priceRecords[bytes32(bytes.concat(priceId, bytes11(0)))];
    }

    function getFeedsById(bytes21[] memory _feedIds) external view override returns (
        uint256[] memory _values,
        int8[] memory _decimals,
        uint256[] memory _timestamps
    ) {
        _values = new uint256[](_feedIds.length);
        _decimals = new int8[](_feedIds.length);
        _timestamps = new uint256[](_feedIds.length);
        
        for (uint i = 0; i < _feedIds.length; i++) {
            bytes32 storageId = bytes32(bytes.concat(_feedIds[i], bytes11(0)));
            PriceData memory data = priceRecords[storageId];
            _values[i] = uint256(data.price);
            _decimals[i] = -int8(uint8(data.decimalPrecision));
            _timestamps[i] = data.timestamp;
        }
        
        return (_values, _decimals, _timestamps);
    }
} 