// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMockERC20 is IERC20 {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

struct ReserveData {
    address aTokenAddress;
}

contract MockPool {
    address public aToken;
    
    constructor(address _aToken) {
        aToken = _aToken;
    }
    
    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        IMockERC20(aToken).mint(onBehalfOf, amount);
    }
    
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        IERC20(asset).transfer(to, amount);
        IMockERC20(aToken).burn(msg.sender, amount);
        return amount;
    }
    
    function getReserveData(address) external view returns (ReserveData memory) {
        return ReserveData({aTokenAddress: aToken});
    }
} 