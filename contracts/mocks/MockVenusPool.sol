// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IVenusPool.sol";

contract MockVenusPool is IVenusPool {
    mapping(address => uint256) public balances;
    mapping(address => address) public vTokens;
    mapping(address => uint256) public exchangeRates;
    mapping(address => uint256) public deposited;
    mapping(address => uint256) public withdrawn;

    constructor() {
        // Initialize exchange rates to 1:1
        // Using 1e18 as base unit for exchange rate
        exchangeRates[address(0)] = 1e18;
    }

    function setBalance(address token, uint256 amount) external {
        balances[token] = amount;
    }

    function setVToken(address token, address vToken) external {
        vTokens[token] = vToken;
    }

    function addVToken(address token, address vToken) external override {
        vTokens[token] = vToken;
    }

    function deposit(address token, uint256 amount) external override returns (bool) {
        deposited[token] += amount;
        if (exchangeRates[token] == 0) {
            exchangeRates[token] = 1e18;
        }
        return true;
    }

    function withdraw(address token, uint256 amount) external override returns (bool) {
        withdrawn[token] += amount;
        return true;
    }

    function withdrawAll(address token) external override returns (bool) {
        withdrawn[token] += deposited[token];
        deposited[token] = 0;
        return true;
    }

    function getDeposited(address token) external view override returns (uint256) {
        return deposited[token];
    }

    function getWithdrawn(address token) external view override returns (uint256) {
        return withdrawn[token];
    }

    function getBalance(address token) external view override returns (uint256) {
        return balances[token];
    }

    function mint(address vToken, uint256 amount) external override returns (uint256) {
        balances[vToken] += amount;
        return 0;
    }

    function redeem(address vToken, uint256 amount) external override returns (uint256) {
        require(balances[vToken] >= amount, "Insufficient balance");
        balances[vToken] -= amount;
        return 0;
    }

    function redeemUnderlying(address vToken, uint256 amount) external override returns (uint256) {
        require(balances[vToken] >= amount, "Insufficient balance");
        balances[vToken] -= amount;
        return 0;
    }

    function balanceOfUnderlying(address vToken) external override returns (uint256) {
        return balances[vToken];
    }

    function exchangeRateStored(address vToken) external view override returns (uint256) {
        return exchangeRates[vToken] == 0 ? 1e18 : exchangeRates[vToken];
    }

    function supply(address token, uint256 amount) external returns (uint256) {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        balances[token] += amount;
        return amount;
    }

    function setExchangeRate(address token, uint256 rate) external {
        exchangeRates[token] = rate;
    }

    function getVToken(address token) external view returns (address) {
        return vTokens[token];
    }

    function getExchangeRate(address token) external view returns (uint256) {
        return exchangeRates[token] == 0 ? 1e18 : exchangeRates[token];
    }
} 