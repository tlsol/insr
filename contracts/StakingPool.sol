// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/IVenusPool.sol";
import "./interfaces/IFTSOv2.sol";
import "./interfaces/IContractRegistry.sol";
import "./interfaces/IStatistics.sol";

contract StakingPool is Ownable, Pausable, ReentrancyGuard {
    using Math for uint256;

    struct StableCoin {
        uint256 minStake;
        uint8 decimals;
        bool accepted;
    }
    
    struct Insurer {
        mapping(address => uint256) collateral;    // token => amount
        mapping(address => uint256) lockedCollateral;
        mapping(address => uint256) rewards;       // Track rewards per token
        uint256 lastUpdated;
    }
    
    struct Policy {
        address stablecoin;
        uint256 coverageAmount;
        uint256 expiration;
        address insurer;
        bool active;
    }
    
    mapping(address => StableCoin) public stablecoins;
    mapping(address => Insurer) public insurers;
    mapping(uint256 => Policy) public policies;
    uint256 public nextPolicyId;
    
    mapping(address => uint256) public minStakeAmount;
    mapping(address => uint8) public tokenDecimals;
    
    uint256 public constant MIN_DURATION = 1 days;
    uint256 public constant MAX_DURATION = 365 days;
    uint256 public constant INSURER_SHARE = 80;    // 80% goes to insurer
    uint256 public constant PROTOCOL_SHARE = 20;   // 20% goes to protocol
    uint256 public constant MIN_PREMIUM = 1e6;     // 1 USDC minimum
    
    event StablecoinAdded(address indexed token, uint256 minStake, uint8 decimals);
    event MinStakeUpdated(address indexed token, uint256 newMin);
    event Staked(address indexed insurer, address indexed token, uint256 amount);
    event Withdrawn(address indexed insurer, address indexed token, uint256 amount);
    event PolicyCreated(uint256 indexed policyId, address indexed insurer, address indexed token, uint256 amount, uint256 duration);
    event PolicyExpired(uint256 indexed policyId);
    event RewardPaid(address indexed insurer, address indexed token, uint256 amount);
    event PremiumDistributed(address indexed insurer, address indexed token, uint256 amount);
    event EmergencyWithdrawn(address indexed insurer, address indexed token, uint256 amount);
    event Recovered(address token, uint256 amount);
    event YieldDeposited(address indexed token, uint256 amount);
    event YieldWithdrawn(address indexed token, uint256 amount);
    event VenusToggled(bool enabled);
    event VTokenAdded(address indexed token, address indexed vToken);
    event TokenFeedAdded(address indexed token, bytes21 feedId);
    event VTokenMapped(address indexed token, address indexed vToken);
    event StatisticsUpdated(address statistics);
    
    address public immutable VENUS_POOL;
    bool public useVenus;
    
    // Track vToken balances
    mapping(address => mapping(address => uint256)) public vTokenBalances;
    // Mapping of token to vToken
    mapping(address => address) public vTokens;

    // Add FTSO mapping
    mapping(address => bytes21) public tokenFeeds;

    // Add FTSO Registry
    IContractRegistry public immutable REGISTRY;

    // Add statistics contract
    IStatistics public statistics;

    constructor(
        address _registry,
        address _venusPool
    ) {
        REGISTRY = IContractRegistry(_registry);
        VENUS_POOL = _venusPool;
        useVenus = false;  // Start with Venus disabled
    }
    
    function updateMinStake(address token, uint256 newMin) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(newMin > 0, "Min stake must be > 0");
        require(stablecoins[token].accepted, "Token not added");
        
        stablecoins[token].minStake = newMin;
        minStakeAmount[token] = newMin;
        emit MinStakeUpdated(token, newMin);
    }
    
    function addStablecoin(address token, uint256 minStake, uint8 decimals) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(minStake > 0, "Min stake must be > 0");
        require(!stablecoins[token].accepted, "Token already added");
        
        stablecoins[token] = StableCoin({
            minStake: minStake,
            decimals: decimals,
            accepted: true
        });
        minStakeAmount[token] = minStake;
        tokenDecimals[token] = decimals;
        emit StablecoinAdded(token, minStake, decimals);
    }

    function addVToken(address token, address vToken) external onlyOwner {
        require(token != address(0) && vToken != address(0), "Invalid addresses");
        require(IVToken(vToken).underlying() == token, "Invalid vToken");
        vTokens[token] = vToken;
        emit VTokenAdded(token, vToken);
    }
    
    function stake(address token, uint256 amount) external whenNotPaused nonReentrant {
        require(token != address(0), "Invalid token address");
        require(minStakeAmount[token] > 0, "Token not supported");
        require(amount >= minStakeAmount[token], "Below minimum stake");
        
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        insurers[msg.sender].collateral[token] += amount;
        insurers[msg.sender].lastUpdated = block.timestamp;
        
        if(useVenus && VENUS_POOL != address(0) && vTokens[token] != address(0)) {
            IERC20(token).approve(VENUS_POOL, amount);
            try IVenusPool(VENUS_POOL).mint(vTokens[token], amount) returns (uint256 mintResult) {
                require(mintResult == 0, "Venus mint failed");
                vTokenBalances[msg.sender][token] += amount;
                emit YieldDeposited(token, amount);
            } catch {
                IERC20(token).approve(VENUS_POOL, 0);
            }
        }
        
        emit Staked(msg.sender, token, amount);
    }
    
    function withdraw(address token, uint256 amount) external whenNotPaused nonReentrant {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be > 0");
        
        uint256 availableAmount = insurers[msg.sender].collateral[token] - insurers[msg.sender].lockedCollateral[token];
        require(amount <= availableAmount, "Insufficient free collateral");
        
        insurers[msg.sender].collateral[token] -= amount;
        
        if(useVenus && VENUS_POOL != address(0) && vTokens[token] != address(0)) {
            try IVenusPool(VENUS_POOL).redeem(vTokens[token], amount) returns (uint256 redeemResult) {
                require(redeemResult == 0, "Venus redeem failed");
                vTokenBalances[msg.sender][token] -= amount;
                emit YieldWithdrawn(token, amount);
            } catch {
                // Silently fail Venus integration
            }
        }
        
        require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawn(msg.sender, token, amount);
    }
    
    function createPolicy(
        address token,
        address insurer, 
        uint256 coverageAmount, 
        uint256 duration
    ) external whenNotPaused returns (uint256) {
        require(token != address(0), "Invalid token");
        require(insurer != address(0), "Invalid insurer");
        require(coverageAmount > 0, "Invalid coverage amount");
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "Invalid duration");
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
        
        // Record the new policy
        if (address(statistics) != address(0)) {
            statistics.recordNewPolicy(
                msg.sender,
                token,
                coverageAmount,
                duration
            );
        }
        
        emit PolicyCreated(policyId, insurer, token, coverageAmount, duration);
        return policyId;
    }
    
    function expirePolicy(uint256 policyId) external whenNotPaused {
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
    
    function distributePremium(
        address insurer,
        address token,
        uint256 premium
    ) external onlyOwner {
        require(insurer != address(0) && token != address(0), "Invalid addresses");
        require(premium >= MIN_PREMIUM, "Premium too low");
        
        uint256 insurerShare = premium.mulDiv(INSURER_SHARE, 100);
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
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Emergency withdrawal - ignores locks during crisis
    function emergencyWithdraw(address token) external whenPaused nonReentrant {
        require(token != address(0), "Invalid token address");
        uint256 totalStaked = insurers[msg.sender].collateral[token];
        require(totalStaked > 0, "No balance");

        insurers[msg.sender].collateral[token] = 0;
        insurers[msg.sender].lockedCollateral[token] = 0;
        
        require(IERC20(token).transfer(msg.sender, totalStaked), "Transfer failed");
        emit EmergencyWithdrawn(msg.sender, token, totalStaked);
    }

    // Recover any tokens accidentally sent to contract
    function recoverERC20(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be > 0");
        require(IERC20(token).transfer(owner(), amount), "Transfer failed");
        emit Recovered(token, amount);
    }

    function setUseVenus(bool _useVenus) external onlyOwner {
        useVenus = _useVenus;
        emit VenusToggled(_useVenus);
    }

    // View function to check pending yield
    function getPendingYield(
        address user,
        address token
    ) external view returns (uint256) {
        if (!useVenus || VENUS_POOL == address(0) || vTokens[token] == address(0)) {
            return 0;
        }

        address vToken = vTokens[token];
        uint256 vTokenBalance = vTokenBalances[user][token];
        
        if (vTokenBalance == 0) return 0;

        // Get current exchange rate from vToken
        uint256 currentExRate = IVToken(vToken).exchangeRateStored();
        
        // Calculate current underlying value: (balance * exchangeRate) / 1e18
        uint256 underlyingValue = (vTokenBalance * currentExRate) / 1e18;
        
        // Return difference between current value and original deposit
        if (underlyingValue > vTokenBalance) {
            return underlyingValue - vTokenBalance;
        }
        return 0;
    }

    // Add the missing function
    function addTokenFeed(address token, bytes21 feedId) external onlyOwner {
        require(token != address(0), "Invalid token");
        tokenFeeds[token] = feedId;
        emit TokenFeedAdded(token, feedId);
    }

    function getTokenPrice(address token) public returns (uint256) {
        bytes21 feedId = tokenFeeds[token];
        require(feedId != bytes21(0), "Feed not found");

        bytes21[] memory feedIds = new bytes21[](1);
        feedIds[0] = feedId;

        IFTSOv2 ftso = REGISTRY.getFtsoV2();
        (uint256[] memory values, int8[] memory decimals, ) = ftso.getFeedsById(feedIds);
        
        require(values.length > 0, "No price data");
        
        // Convert to our standard decimals (e.g., 18)
        return values[0] * 10**(18 - uint8(decimals[0]));
    }

    // Add the mapping function
    function mapVToken(address token, address vToken) external onlyOwner {
        require(token != address(0) && vToken != address(0), "Invalid addresses");
        require(IVToken(vToken).underlying() == token, "Invalid vToken");
        vTokens[token] = vToken;
        emit VTokenMapped(token, vToken);
    }

    // Add setter for statistics
    function setStatistics(address _statistics) external onlyOwner {
        require(_statistics != address(0), "Invalid address");
        statistics = IStatistics(_statistics);
        emit StatisticsUpdated(_statistics);
    }
}