// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IContractRegistry.sol";
import "../interfaces/IFTSOv2.sol";

contract MockRegistry is IContractRegistry {
    IFTSOv2 public ftsoV2;

    constructor(address _ftso) {
        ftsoV2 = IFTSOv2(_ftso);
    }

    function getFtsoV2() external view returns (IFTSOv2) {
        return ftsoV2;
    }
} 