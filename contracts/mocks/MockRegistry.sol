// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFTSOv2 {
    function getCurrentPrice(bytes21 _symbol) external view returns (uint256, uint256, uint256, bool);
    function getFeedsById(bytes21[] memory _feedIds) external view returns (uint256[] memory, int8[] memory, uint64);
}

contract MockRegistry {
    IFTSOv2 public ftso;
    
    constructor(address _ftso) {
        ftso = IFTSOv2(_ftso);
    }

    function getFtsoManager() external view returns (address) {
        return address(ftso);
    }

    function getFtsoRegistry() external view returns (address) {
        return address(ftso);
    }

    function getPriceFromSymbol(bytes21 _symbol) external view returns (uint256, uint256, uint256, bool) {
        return ftso.getCurrentPrice(_symbol);
    }

    function getCurrentPrice(bytes21 _symbol) external view returns (uint256, uint256, uint256, bool) {
        return ftso.getCurrentPrice(_symbol);
    }

    function getCurrentPriceWithDecimals(bytes21 _symbol) external view returns (uint256, uint256, uint256, bool) {
        return ftso.getCurrentPrice(_symbol);
    }

    function getFeedsById(bytes21[] memory _feedIds) external view returns (uint256[] memory, int8[] memory, uint64) {
        return ftso.getFeedsById(_feedIds);
    }

    function getContractAddresses(bytes32[] memory _names) external view returns (address[] memory) {
        address[] memory addresses = new address[](_names.length);
        for(uint i = 0; i < _names.length; i++) {
            addresses[i] = address(ftso);
        }
        return addresses;
    }

    function getFtsoV2() external view returns (IFTSOv2) {
        return ftso;
    }
} 