// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./PremiumCalculator.sol";
import "./ClaimsManager.sol";
import "./StakingPool.sol";

contract InsurancePool is Ownable, Pausable, ReentrancyGuard {
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
        bool active;
    }
    
    // user => policyId => Policy
    mapping(address => mapping(uint256 => Policy)) public userPolicies;
    uint256 public nextPolicyId = 1;
    
    event PolicyPurchased(address indexed user, uint256 indexed policyId, uint256 premium, uint256 coverageAmount);
    event ClaimSubmitted(uint256 indexed policyId, uint256 indexed claimId);
    event ClaimProcessed(uint256 indexed policyId, uint256 indexed claimId, bool approved);
    event PremiumDistributed(address indexed insurer, uint256 amount);
    event ContractUpgraded(address indexed component, address newAddress);
    
    constructor(
        address _usdc,
        address _calculator,
        address _stakingPool,
        address _claimsManager
    ) {
        require(_usdc != address(0) && _calculator != address(0) && 
                _stakingPool != address(0) && _claimsManager != address(0), 
                "Invalid address");
                
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
    ) external whenNotPaused nonReentrant returns (uint256) {
        require(stablecoin != address(0) && insurer != address(0), "Invalid address");
        require(coverageAmount > 0, "Invalid coverage amount");
        require(duration > 0, "Invalid duration");
        
        // Calculate premium first
        uint256 premium = calculator.calculatePremium(coverageAmount, duration);
        
        // Create policy in staking pool first
        stakingPool.createPolicy(
            stablecoin,
            insurer,
            coverageAmount,
            duration
        );
        
        // Transfer premium last
        require(IERC20(stablecoin).transferFrom(msg.sender, address(this), premium), 
                "Premium transfer failed");
        
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
        
        emit PolicyPurchased(msg.sender, policyId, premium, coverageAmount);
        return policyId;
    }
    
    function submitClaim(
        uint256 policyId, 
        bytes[] calldata priceUpdateData
    ) external payable whenNotPaused nonReentrant {
        Policy storage policy = userPolicies[msg.sender][policyId];
        require(policy.active, "Policy not active");
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
    
    function processClaim(uint256 policyId) external whenNotPaused nonReentrant {
        Policy storage policy = userPolicies[msg.sender][policyId];
        require(policy.active, "Policy not active");
        require(policy.claimId != 0, "No claim submitted");
        require(!policy.claimed, "Already claimed");
        
        claimsManager.processClaim(policy.claimId, policy.stablecoin);
        
        (,,,,,ClaimsManager.ClaimStatus status) = claimsManager.claims(policy.claimId);
        
        if (status == ClaimsManager.ClaimStatus.Approved) {
            policy.claimed = true;
            policy.active = false;
            require(usdc.transfer(msg.sender, policy.coverageAmount), "Payout failed");
        }
        
        emit ClaimProcessed(policyId, policy.claimId, status == ClaimsManager.ClaimStatus.Approved);
    }
    
    function distributePremiums() external onlyOwner {
        uint256 balance = usdc.balanceOf(address(this));
        require(balance > 0, "No premiums to distribute");
        
        // Transfer ownership of premium to StakingPool
        require(usdc.approve(address(stakingPool), balance), "Approval failed");
        stakingPool.distributePremium(address(this), address(usdc), balance);
        emit PremiumDistributed(address(stakingPool), balance);
    }
    
    function updateComponent(
        string memory component,
        address newAddress
    ) external onlyOwner {
        require(newAddress != address(0), "Invalid address");
        
        if (keccak256(bytes(component)) == keccak256(bytes("calculator"))) {
            calculator = PremiumCalculator(newAddress);
        } else if (keccak256(bytes(component)) == keccak256(bytes("stakingPool"))) {
            stakingPool = StakingPool(newAddress);
        } else if (keccak256(bytes(component)) == keccak256(bytes("claimsManager"))) {
            claimsManager = ClaimsManager(newAddress);
        } else {
            revert("Invalid component");
        }
        
        emit ContractUpgraded(newAddress, newAddress);
    }
    
    function emergencyWithdraw(address token) external onlyOwner whenPaused {
        require(token != address(0), "Invalid token");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance");
        require(IERC20(token).transfer(owner(), balance), "Transfer failed");
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function approveClaimsManager(address token, uint256 amount) external onlyOwner {
        IERC20(token).approve(address(claimsManager), amount);
    }
}