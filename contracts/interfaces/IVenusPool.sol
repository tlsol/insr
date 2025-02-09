// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVenusPool {
    function deposit(address token, uint256 amount) external returns (bool);
    function withdraw(address token, uint256 amount) external returns (bool);
    function withdrawAll(address token) external returns (bool);
    function getDeposited(address token) external view returns (uint256);
    function getWithdrawn(address token) external view returns (uint256);
    function getExchangeRate(address token) external view returns (uint256);
    function getBalance(address token) external view returns (uint256);
    function mint(address vToken, uint256 amount) external returns (uint256);
    function redeem(address vToken, uint256 amount) external returns (uint256);
    function redeemUnderlying(address vToken, uint256 amount) external returns (uint256);
    function balanceOfUnderlying(address vToken) external returns (uint256);
    function exchangeRateStored(address vToken) external view returns (uint256);
    function addVToken(address token, address vToken) external;
}

interface IVToken {
    function underlying() external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function exchangeRateStored() external view returns (uint256);
} 