// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MockVToken.sol";

contract MockVenusPool {
    mapping(address => address) public vTokens;
    address public underlying;
    address public vToken;
    
    constructor(address _usdc, address _vusdc) {
        vTokens[_usdc] = _vusdc;
        underlying = _usdc;
        vToken = _vusdc;
    }

    function supply(address token, uint256 amount) external returns (bool) {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        return true;
    }

    function withdraw(address token, uint256 amount) external returns (bool) {
        IERC20(token).transfer(msg.sender, amount);
        return true;
    }

    function getVToken(address token) external view returns (address) {
        require(vTokens[token] != address(0), "Token not supported");
        return vTokens[token];
    }

    function mint(address _vToken, uint256 amount) external returns (uint256) {
        IERC20(MockVToken(_vToken).underlying()).transferFrom(msg.sender, address(this), amount);
        MockVToken(_vToken).mint(msg.sender, amount);
        return 0; // 0 means success in Venus
    }

    function redeem(address _vToken, uint256 redeemTokens) external returns (uint256) {
        MockVToken(_vToken).burn(msg.sender, redeemTokens);
        IERC20(MockVToken(_vToken).underlying()).transfer(msg.sender, redeemTokens);
        return 0; // 0 means success in Venus
    }
} 