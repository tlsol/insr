// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockVToken is ERC20 {
    address public underlying;
    uint256 public exchangeRate;

    constructor(
        string memory name,
        string memory symbol,
        address _underlying
    ) ERC20(name, symbol) {
        underlying = _underlying;
        exchangeRate = 1e18; // Start with 1:1
    }

    function setExchangeRate(uint256 _rate) external {
        exchangeRate = _rate;
    }

    function exchangeRateStored() external view returns (uint256) {
        return exchangeRate;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
} 