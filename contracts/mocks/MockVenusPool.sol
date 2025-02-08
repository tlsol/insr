// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MockVToken.sol";

contract MockVenusPool {
    function mint(address vToken, uint256 amount) external returns (uint256) {
        IERC20(MockVToken(vToken).underlying()).transferFrom(msg.sender, address(this), amount);
        MockVToken(vToken).mint(msg.sender, amount);
        return 0; // 0 means success in Venus
    }

    function redeem(address vToken, uint256 redeemTokens) external returns (uint256) {
        MockVToken(vToken).burn(msg.sender, redeemTokens);
        IERC20(MockVToken(vToken).underlying()).transfer(msg.sender, redeemTokens);
        return 0; // 0 means success in Venus
    }
} 