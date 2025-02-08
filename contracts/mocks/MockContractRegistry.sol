// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockContractRegistry {
    address public ftso;
    
    constructor(address _ftso) {
        ftso = _ftso;
    }
    
    function getContractAddress(bytes32) external view returns (address) {
        return ftso;
    }
} 