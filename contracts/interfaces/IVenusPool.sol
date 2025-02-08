// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVenusPool {
    function mint(address vToken, uint256 amount) external returns (uint256);
    function redeem(address vToken, uint256 redeemTokens) external returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function exchangeRateStored() external view returns (uint256);
}

interface IVToken {
    function underlying() external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function exchangeRateStored() external view returns (uint256);
} 