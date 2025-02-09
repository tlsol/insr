// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IStatistics.sol";
import "./interfaces/IVenusPool.sol";

contract StakingPool is Ownable {
    struct StablecoinConfig {
        bool supported;
        uint256 minStake;
        uint8 decimals;
        bool venusEnabled;  // Track if Venus is enabled for this token
    }

    mapping(address => StablecoinConfig) public stablecoins;
    mapping(address => mapping(address => uint256)) public stakedBalances;
    IStatistics public statistics;
    IVenusPool public venusPool;
    address public insurancePool;
    uint256 public nextPolicyId = 1;

    event StablecoinAdded(address token, uint256 minStake, uint8 decimals);
    event Staked(address indexed staker, address indexed token, uint256 amount);
    event Withdrawn(address indexed staker, address indexed token, uint256 amount);
    event VenusEnabled(address indexed token);
    event VenusDisabled(address indexed token);

    constructor(address _venusPool) {
        require(_venusPool != address(0), "Invalid Venus pool");
        venusPool = IVenusPool(_venusPool);
    }

    function addStablecoin(
        address token,
        uint256 minStake,
        uint8 decimals
    ) external onlyOwner {
        require(!stablecoins[token].supported, "Already supported");
        stablecoins[token] = StablecoinConfig({
            supported: true,
            minStake: minStake,
            decimals: decimals,
            venusEnabled: false
        });
        emit StablecoinAdded(token, minStake, decimals);
    }

    function enableVenus(address token) external onlyOwner {
        StablecoinConfig storage config = stablecoins[token];
        require(config.supported, "Token not supported");
        require(!config.venusEnabled, "Venus already enabled");
        
        // Approve Venus pool to spend this token
        IERC20(token).approve(address(venusPool), type(uint256).max);
        config.venusEnabled = true;
        
        // Deposit current balance if any
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            venusPool.deposit(token, balance);
        }
        
        emit VenusEnabled(token);
    }

    function disableVenus(address token) external onlyOwner {
        StablecoinConfig storage config = stablecoins[token];
        require(config.supported, "Token not supported");
        require(config.venusEnabled, "Venus not enabled");
        
        // Withdraw all funds from Venus
        venusPool.withdrawAll(token);
        
        // Remove approval
        IERC20(token).approve(address(venusPool), 0);
        config.venusEnabled = false;
        
        emit VenusDisabled(token);
    }

    function stake(address token, uint256 amount) external {
        StablecoinConfig memory config = stablecoins[token];
        require(config.supported, "Token not supported");
        require(amount >= config.minStake, "Below minimum stake");

        IERC20(token).transferFrom(msg.sender, address(this), amount);
        stakedBalances[token][msg.sender] += amount;
        
        // If Venus is enabled, deposit the staked amount
        if (config.venusEnabled) {
            venusPool.deposit(token, amount);
        }
        
        if (address(statistics) != address(0)) {
            statistics.recordStake(msg.sender, token, amount);
        }
        
        emit Staked(msg.sender, token, amount);
    }

    function withdraw(address token, uint256 amount) external {
        require(stakedBalances[token][msg.sender] >= amount, "Insufficient balance");
        
        StablecoinConfig memory config = stablecoins[token];
        stakedBalances[token][msg.sender] -= amount;
        
        // If Venus is enabled, withdraw from Venus first
        if (config.venusEnabled) {
            venusPool.withdraw(token, amount);
        }
        
        IERC20(token).transfer(msg.sender, amount);
        
        if (address(statistics) != address(0)) {
            statistics.recordWithdrawal(msg.sender, token, amount);
        }
        
        emit Withdrawn(msg.sender, token, amount);
    }

    function getStakedBalance(address token, address staker) external view returns (uint256) {
        uint256 rawBalance = stakedBalances[token][staker];
        if (!stablecoins[token].venusEnabled) {
            return rawBalance;
        }
        
        // Get Venus exchange rate and apply it
        uint256 exchangeRate = venusPool.getExchangeRate(token);
        return (rawBalance * exchangeRate) / 1e18;
    }

    function getPendingYield(address token, address staker) external view returns (uint256) {
        if (!stablecoins[token].venusEnabled) {
            return 0;
        }
        
        uint256 rawBalance = stakedBalances[token][staker];
        if (rawBalance == 0) {
            return 0;
        }
        
        uint256 exchangeRate = venusPool.getExchangeRate(token);
        uint256 currentBalance = (rawBalance * exchangeRate) / 1e18;
        return currentBalance - rawBalance;
    }

    function setStatistics(address _statistics) external onlyOwner {
        require(_statistics != address(0), "Invalid address");
        statistics = IStatistics(_statistics);
    }

    function setInsurancePool(address _insurancePool) external onlyOwner {
        require(_insurancePool != address(0), "Invalid address");
        insurancePool = _insurancePool;
    }

    function distributePremium(address stablecoin, uint256 amount) external {
        require(msg.sender == insurancePool, "Only insurance pool");
        IERC20(stablecoin).transferFrom(msg.sender, address(this), amount);
    }

    function createPolicy(
        address token,
        address insurer,
        uint256 coverageAmount,
        uint256 duration
    ) external returns (uint256) {
        require(msg.sender == insurancePool, "Only insurance pool");
        // Add actual implementation logic here
        return nextPolicyId++;
    }
}