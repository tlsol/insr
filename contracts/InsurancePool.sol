// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./PremiumCalculator.sol";
import "./ClaimsManager.sol";
import "./StakingPool.sol";

contract InsurancePool is Ownable {
    StakingPool public stakingPool;
    ClaimsManager public claimsManager;
    PremiumCalculator public calculator;
    IERC20 public immutable usdc;
    
    struct Policy {
        address stablecoin;
        uint256 coverageAmount;
        uint256 premium;
        uint256 expiration;
        address insurer;
        uint256 claimId;
        bool claimed;
    }
    
    // user => policyId => Policy
    mapping(address => mapping(uint256 => Policy)) public userPolicies;
    uint256 public nextPolicyId = 1;
    
    event PolicyPurchased(address indexed user, uint256 indexed policyId, uint256 premium);
    event ClaimSubmitted(uint256 indexed policyId, uint256 indexed claimId);
    
    constructor(
        address _usdc,
        address _calculator,
        address _stakingPool,
        address _claimsManager
    ) {
        usdc = IERC20(_usdc);
        calculator = PremiumCalculator(_calculator);
        stakingPool = StakingPool(_stakingPool);
        claimsManager = ClaimsManager(_claimsManager);
    }
    
    function purchasePolicy(
        address stablecoin,
        address insurer,
        uint256 coverageAmount,
        uint256 duration
    ) external returns (uint256) {
        // Calculate premium
        uint256 premium = calculator.calculatePremium(coverageAmount, duration);
        
        // Transfer premium from user
        require(IERC20(stablecoin).transferFrom(msg.sender, address(this), premium), "Premium transfer failed");
        
        // Create policy in staking pool
        stakingPool.createPolicy(
            stablecoin,
            insurer,
            coverageAmount,
            duration
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
            claimed: false
        });
        
        emit PolicyPurchased(msg.sender, policyId, premium);
        return policyId;
    }
    
    function submitClaim(uint256 policyId, bytes[] calldata priceUpdateData) external payable {
        Policy storage policy = userPolicies[msg.sender][policyId];
        require(policy.expiration > block.timestamp, "Policy expired");
        require(!policy.claimed, "Already claimed");
        
        uint256 claimId = claimsManager.submitClaim{value: msg.value}(
            policyId,
            policy.coverageAmount,
            policy.premium,
            priceUpdateData
        );
        policy.claimId = claimId;
        
        emit ClaimSubmitted(policyId, claimId);
    }
    
    function processClaim(uint256 policyId) external {
        Policy storage policy = userPolicies[msg.sender][policyId];
        require(policy.claimId != 0, "No claim submitted");
        
        claimsManager.processClaim(policy.claimId, policy.stablecoin);
        policy.claimed = true;
    }
} 