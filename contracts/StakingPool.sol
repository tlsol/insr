// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

struct ReserveData {
    address aTokenAddress;
    // ... other fields we don't need
}

interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function getReserveData(address asset) external view returns (ReserveData memory);
}

contract StakingPool is Ownable {
    struct Stablecoin {
        bool accepted;
        uint256 minStake;
        uint8 decimals;
    }
    
    struct Insurer {
        mapping(address => uint256) collateral;    // token => amount
        mapping(address => uint256) lockedCollateral;
        mapping(address => uint256) rewards;       // NEW: Track rewards per token
        uint256 lastUpdated;
    }
    
    struct Policy {
        address stablecoin;
        uint256 coverageAmount;
        uint256 expiration;
        address insurer;
        bool active;
    }
    
    mapping(address => Stablecoin) public stablecoins;
    mapping(address => Insurer) public insurers;
    mapping(uint256 => Policy) public policies;
    uint256 public nextPolicyId;
    
    uint256 public constant INSURER_SHARE = 80;    // 80% goes to insurer
    uint256 public constant PROTOCOL_SHARE = 20;   // 20% goes to protocol
    
    event StablecoinAdded(address indexed token, uint256 minStake, uint8 decimals);
    event Staked(address indexed insurer, address indexed token, uint256 amount);
    event Withdrawn(address indexed insurer, address indexed token, uint256 amount);
    event PolicyCreated(uint256 indexed policyId, address indexed insurer, address indexed token, uint256 coverageAmount);
    event PolicyExpired(uint256 indexed policyId);
    event RewardPaid(address indexed insurer, address indexed token, uint256 amount);
    event PremiumDistributed(address indexed insurer, address indexed token, uint256 amount);
    event EmergencyWithdrawn(address indexed insurer, address indexed token, uint256 amount);
    event Recovered(address token, uint256 amount);
    event YieldDeposited(address indexed token, uint256 amount);
    event YieldWithdrawn(address indexed token, uint256 amount);
    
    bool public paused;
    
    event Paused();
    event Unpaused();

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier nonReentrant() {
        require(!_entered, "Reentrant call");
        _entered = true;
        _;
        _entered = false;
    }

    bool private _entered;

    IPool public immutable AAVE_POOL;
    bool public immutable useAave;
    
    // Track aToken balances
    mapping(address => mapping(address => uint256)) public aTokenBalances;

    constructor(address _aavePool) {
        AAVE_POOL = IPool(_aavePool);
        useAave = _aavePool != address(0);
        _transferOwnership(msg.sender);
    }
    
    function addStablecoin(address token, uint256 minStake, uint8 decimals) external onlyOwner {
        require(!stablecoins[token].accepted, "Already added");
        stablecoins[token] = Stablecoin({
            accepted: true,
            minStake: minStake,
            decimals: decimals
        });
        emit StablecoinAdded(token, minStake, decimals);
    }
    
    function stake(address token, uint256 amount) external whenNotPaused nonReentrant {
        require(stablecoins[token].accepted, "Token not accepted");
        require(amount >= stablecoins[token].minStake, "Below minimum stake");
        
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        insurers[msg.sender].collateral[token] += amount;
        insurers[msg.sender].lastUpdated = block.timestamp;
        
        // Only use Aave if enabled
        if(useAave) {
            IERC20(token).approve(address(AAVE_POOL), amount);
            ReserveData memory reserveData = AAVE_POOL.getReserveData(token);
            uint256 oldBalance = IERC20(reserveData.aTokenAddress).balanceOf(address(this));
            AAVE_POOL.supply(token, amount, address(this), 0);
            uint256 newBalance = IERC20(reserveData.aTokenAddress).balanceOf(address(this));
            aTokenBalances[msg.sender][token] += newBalance - oldBalance;
            emit YieldDeposited(token, amount);
        }
        
        emit Staked(msg.sender, token, amount);
    }
    
    function createPolicy(
        address token,
        address insurer, 
        uint256 coverageAmount, 
        uint256 duration
    ) external returns (uint256) {
        require(stablecoins[token].accepted, "Token not accepted");
        require(insurers[insurer].collateral[token] >= coverageAmount, "Insufficient collateral");
        require(getAvailableCollateral(insurer, token) >= coverageAmount, "Insufficient free collateral");
        
        uint256 policyId = nextPolicyId++;
        policies[policyId] = Policy({
            stablecoin: token,
            coverageAmount: coverageAmount,
            expiration: block.timestamp + duration,
            insurer: insurer,
            active: true
        });
        
        insurers[insurer].lockedCollateral[token] += coverageAmount;
        
        emit PolicyCreated(policyId, insurer, token, coverageAmount);
        return policyId;
    }
    
    function expirePolicy(uint256 policyId) external {
        Policy storage policy = policies[policyId];
        require(policy.active, "Policy not active");
        require(block.timestamp > policy.expiration, "Policy not expired");
        
        policy.active = false;
        insurers[policy.insurer].lockedCollateral[policy.stablecoin] -= policy.coverageAmount;
        
        emit PolicyExpired(policyId);
    }
    
    function getLockedCollateral(address insurer, address token) public view returns (uint256) {
        return insurers[insurer].lockedCollateral[token];
    }
    
    function getAvailableCollateral(address insurer, address token) public view returns (uint256) {
        return insurers[insurer].collateral[token] - insurers[insurer].lockedCollateral[token];
    }
    
    function withdraw(address token, uint256 amount) external whenNotPaused nonReentrant {
        require(amount <= insurers[msg.sender].collateral[token] - insurers[msg.sender].lockedCollateral[token], "Insufficient free collateral");
        
        if(useAave) {
            AAVE_POOL.withdraw(token, amount, address(this));
            emit YieldWithdrawn(token, amount);
        }
        
        insurers[msg.sender].collateral[token] -= amount;
        insurers[msg.sender].lockedCollateral[token] = 0;
        require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");
        
        emit Withdrawn(msg.sender, token, amount);
    }
    
    function distributePremium(
        address insurer,
        address token,
        uint256 premium
    ) external {
        require(msg.sender == owner(), "Only owner can distribute premiums");
        
        uint256 insurerShare = (premium * INSURER_SHARE) / 100;
        insurers[insurer].rewards[token] += insurerShare;
        
        emit PremiumDistributed(insurer, token, insurerShare);
    }
    
    function claimRewards(address token) external {
        uint256 reward = insurers[msg.sender].rewards[token];
        require(reward > 0, "No rewards to claim");
        
        insurers[msg.sender].rewards[token] = 0;
        require(IERC20(token).transfer(msg.sender, reward), "Reward transfer failed");
        
        emit RewardPaid(msg.sender, token, reward);
    }
    
    function getRewards(address insurer, address token) external view returns (uint256) {
        return insurers[insurer].rewards[token];
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    // Emergency withdrawal - ignores locks during crisis
    function emergencyWithdraw(address token) external nonReentrant {
        uint256 totalStaked = insurers[msg.sender].collateral[token];
        require(totalStaked > 0, "Nothing to withdraw");

        insurers[msg.sender].collateral[token] = 0;
        insurers[msg.sender].lockedCollateral[token] = 0;
        require(IERC20(token).transfer(msg.sender, totalStaked), "Transfer failed");

        emit EmergencyWithdrawn(msg.sender, token, totalStaked);
    }

    // Recover any tokens accidentally sent to contract
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner(), amount), "Transfer failed");
        emit Recovered(token, amount);
    }

    // View function to check pending yield
    function getPendingYield(address user, address token) external view returns (uint256) {
        ReserveData memory reserveData = AAVE_POOL.getReserveData(token);
        address aToken = reserveData.aTokenAddress;
        uint256 currentATokenBalance = IERC20(aToken).balanceOf(address(this));
        return currentATokenBalance - aTokenBalances[user][token];
    }
} 