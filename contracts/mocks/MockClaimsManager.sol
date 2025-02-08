// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockClaimsManager {
    // Add receive function to accept ETH
    receive() external payable {}
    
    // Add fallback function just in case
    fallback() external payable {}

    function submitClaim(uint256 policyId, uint256 amount) external {}
    function processClaim(uint256 claimId, bool approved) external {}
    function getClaimStatus(uint256 claimId) external pure returns (uint8) {
        return 0;
    }
} 