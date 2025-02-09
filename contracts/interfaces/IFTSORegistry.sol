// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IFTSOv2.sol";

interface IFTSORegistry {
    function getFtsoV2() external view returns (IFTSOv2);
} 