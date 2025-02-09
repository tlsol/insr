// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IStakingPool.sol";
import "./interfaces/IPremiumCalculator.sol";
import "./interfaces/IClaimsManager.sol";

contract InsurancePool is Ownable, Pausable, ReentrancyGuard {
    struct Policy {
        address stablecoin;         // Which stablecoin this policy uses
        uint256 coverageAmount;     // Amount in stablecoin's native decimals
        uint256 premium;            // Premium paid in stablecoin
        uint256 expiration;         // Timestamp when policy expires
        address insurer;            // Address of the insurer
        uint256 claimId;            // ID of the claim if filed
        bool claimed;               // Whether a claim has been filed
        bool active;                // Whether policy is still active
    }

    // Core components
    IStakingPool public stakingPool;
    IPremiumCalculator public calculator;
    IClaimsManager public claimsManager;

    // Policy storage
    uint256 public nextPolicyId = 1;
    mapping(address => mapping(uint256 => Policy)) public userPolicies; // user -> policyId -> Policy
    
    // Stablecoin approvals for claims manager
    mapping(address => uint256) public claimsManagerAllowance;

    // Events
    event PolicyPurchased(
        address indexed user,
        uint256 indexed policyId,
        address stablecoin,
        uint256 premium,
        uint256 coverageAmount
    );
    event ClaimSubmitted(uint256 indexed policyId, uint256 indexed claimId);
    event ClaimProcessed(uint256 indexed policyId, uint256 indexed claimId, bool approved);
    event PremiumDistributed(address indexed insurer, uint256 amount);
    event ComponentUpdated(string indexed name, address newAddress);
    event ClaimsManagerApproved(address stablecoin, uint256 amount);

    constructor(address _stakingPool, address _calculator) {
        stakingPool = IStakingPool(_stakingPool);
        calculator = IPremiumCalculator(_calculator);
    }

    // Purchase a new insurance policy
    function purchasePolicy(
        address stablecoin,
        address insurer,
        uint256 coverageAmount,
        uint256 duration
    ) external whenNotPaused returns (uint256) {
        require(coverageAmount > 0, "Invalid coverage amount");
        require(duration > 0, "Invalid duration");
        
        // Calculate premium using the specified stablecoin
        uint256 premium = calculator.calculatePremium(
            stablecoin,
            coverageAmount,
            duration
        );
        
        // Create policy in staking pool first
        stakingPool.createPolicy(
            stablecoin,
            insurer,
            coverageAmount,
            duration
        );
        
        // Transfer premium using the correct stablecoin
        require(
            IERC20(stablecoin).transferFrom(msg.sender, address(this), premium),
            "Premium transfer failed"
        );
        
        // Create policy
        uint256 policyId = nextPolicyId++;
        userPolicies[msg.sender][policyId] = Policy({
            stablecoin: stablecoin,
            coverageAmount: coverageAmount,
            premium: premium,
            expiration: block.timestamp + duration,
            insurer: insurer,
            claimId: 0,
            claimed: false,
            active: true
        });
        
        emit PolicyPurchased(msg.sender, policyId, stablecoin, premium, coverageAmount);
        return policyId;
    }

    function submitClaim(uint256 policyId) external whenNotPaused nonReentrant {
        Policy storage policy = userPolicies[msg.sender][policyId];
        require(policy.active, "Policy not active");
        require(policy.expiration > block.timestamp, "Policy expired");
        require(!policy.claimed, "Already claimed");
        
        uint256 claimId = claimsManager.submitClaim(
            policyId,
            policy.coverageAmount
        );
        
        policy.claimId = claimId;
        emit ClaimSubmitted(policyId, claimId);
    }
    
    function processClaim(uint256 policyId) external whenNotPaused nonReentrant {
        Policy storage policy = userPolicies[msg.sender][policyId];
        require(policy.active, "Policy not active");
        require(policy.claimId != 0, "No claim submitted");
        require(!policy.claimed, "Already claimed");
        
        claimsManager.processClaim(policy.claimId, true);
        
        (,,,,,, IClaimsManager.ClaimStatus status) = claimsManager.claims(policy.claimId);
        
        if (status == IClaimsManager.ClaimStatus.Approved) {
            policy.claimed = true;
            policy.active = false;
            require(IERC20(policy.stablecoin).transfer(msg.sender, policy.coverageAmount), "Payout failed");
        }
        
        emit ClaimProcessed(policyId, policy.claimId, status == IClaimsManager.ClaimStatus.Approved);
    }
    
    function distributePremiums(address stablecoin) external onlyOwner {
        uint256 balance = IERC20(stablecoin).balanceOf(address(this));
        require(balance > 0, "No premiums to distribute");
        
        // Transfer ownership of premium to StakingPool
        require(IERC20(stablecoin).approve(address(stakingPool), balance), "Approval failed");
        stakingPool.distributePremium(stablecoin, balance);
        emit PremiumDistributed(address(stakingPool), balance);
    }

    // Approve claims manager to spend stablecoins
    function approveClaimsManager(
        address stablecoin,
        uint256 amount
    ) external onlyOwner {
        require(amount > 0, "Invalid amount");
        IERC20(stablecoin).approve(address(claimsManager), amount);
        claimsManagerAllowance[stablecoin] = amount;
        emit ClaimsManagerApproved(stablecoin, amount);
    }

    // Update component addresses
    function updateComponent(
        string memory name,
        address newAddress
    ) external onlyOwner {
        require(newAddress != address(0), "Invalid address");
        
        if (keccak256(bytes(name)) == keccak256(bytes("stakingPool"))) {
            stakingPool = IStakingPool(newAddress);
        } else if (keccak256(bytes(name)) == keccak256(bytes("calculator"))) {
            calculator = IPremiumCalculator(newAddress);
        } else if (keccak256(bytes(name)) == keccak256(bytes("claimsManager"))) {
            claimsManager = IClaimsManager(newAddress);
        } else {
            revert("Invalid component name");
        }
        
        emit ComponentUpdated(name, newAddress);
    }

    // View functions
    function getPolicy(
        address user,
        uint256 policyId
    ) external view returns (Policy memory) {
        return userPolicies[user][policyId];
    }

    function isPolicyActive(
        address user,
        uint256 policyId
    ) external view returns (bool) {
        Policy memory policy = userPolicies[user][policyId];
        return policy.active && 
               !policy.claimed && 
               block.timestamp <= policy.expiration;
    }

    // Admin functions
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Emergency functions
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "Invalid address");
        require(IERC20(token).transfer(to, amount), "Transfer failed");
    }
}