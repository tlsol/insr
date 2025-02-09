// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IFTSORegistry.sol";
import "./MockFTSOv2.sol";

contract MockFTSORegistry is IFTSORegistry {
    MockFTSOv2 public ftsoV2;

    constructor() {
        ftsoV2 = new MockFTSOv2();
    }

    function getFtsoV2() external view override returns (IFTSOv2) {
        return ftsoV2;
    }
} 