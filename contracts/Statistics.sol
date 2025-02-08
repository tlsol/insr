// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IStakingPool.sol";
import "./interfaces/IClaimsManager.sol";

contract InsuranceStatistics is Ownable, Pausable, ReentrancyGuard {
    using Math for uint256;

    IStakingPool public immutable stakingPool;
    IClaimsManager public immutable claimsManager;
    
    // Global stats
    uint256 public totalPoliciesIssued;
    uint256 public totalPremiumsCollected;
    uint256 public totalClaimsPaid;
    uint256 public totalValueLocked;
    
    // Recent events for feed
    uint256 public constant MAX_RECENT_EVENTS = 100;
    
    struct InsuranceEvent {
        address user;
        address token;
        uint256 amount;
        uint256 duration;
        EventType eventType;
        uint256 timestamp;
    }
    
    enum EventType { POLICY_BOUGHT, CLAIM_PAID }
    
    InsuranceEvent[] public recentEvents;
    
    event NewInsuranceEvent(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 duration,
        EventType eventType,
        uint256 timestamp
    );
    
    // Structs for different metric categories
    struct RiskMetrics {
        uint256 averageClaimSize;
        uint256 claimFrequency;        // claims per month (scaled by 1e18)
        uint256 largestClaim;
        uint256 riskScore;             // 0-100, scaled by 1e18
    }

    struct UserMetrics {
        uint256 totalUniqueInsurers;
        uint256 totalUniquePolicyHolders;
        uint256 repeatCustomerRate;    // percentage scaled by 1e18
        uint256 averagePolicySize;
        uint256 averagePolicyDuration;
    }

    struct FinancialMetrics {
        uint256 totalRevenueGenerated;
        uint256 netProfitLoss;
        uint256 averageAPY;           // scaled by 1e18
        uint256 utilizationRate;      // scaled by 1e18
        uint256 premiumToClaimRatio;  // scaled by 1e18
    }

    struct TimeMetrics {
        uint256 dailyActiveUsers;
        uint256 weeklyNewPolicies;
        uint256 monthlyClaimVolume;
        uint256 averageTimeToExpiry;
    }

    struct ProtocolMetrics {
        uint256 successfulClaims;
        uint256 rejectedClaims;
        uint256 averageProcessingTime;
        uint256 totalGasSpent;
    }

    // Storage for metrics
    RiskMetrics public riskMetrics;
    UserMetrics public userMetrics;
    FinancialMetrics public financialMetrics;
    TimeMetrics public timeMetrics;
    ProtocolMetrics public protocolMetrics;

    // Mappings for detailed tracking
    mapping(address => bool) public isInsurer;
    mapping(address => bool) public isPolicyHolder;
    mapping(address => uint256) public userPolicyCount;
    mapping(address => uint256) public tokenLiquidity;
    mapping(address => uint256) public tokenSpecificRisk;
    mapping(uint256 => uint256) public dailyVolume;
    mapping(address => bool) public blacklistedUsers;

    // Time-based tracking
    uint256 public lastUpdateTimestamp;
    uint256 public constant UPDATE_INTERVAL = 1 days;
    
    // Events for tracking
    event MetricsUpdated(uint256 timestamp);
    event BlacklistUpdated(address user, bool blacklisted);
    event RiskScoreUpdated(address token, uint256 score);

    constructor(address _stakingPool, address _claimsManager) {
        stakingPool = IStakingPool(_stakingPool);
        claimsManager = IClaimsManager(_claimsManager);
        lastUpdateTimestamp = block.timestamp;
    }
    
    // Record new policy
    function recordNewPolicy(
        address user,
        address token,
        uint256 amount,
        uint256 duration
    ) external whenNotPaused {
        require(!blacklistedUsers[user], "User blacklisted");
        require(msg.sender == address(stakingPool), "Unauthorized");
        
        totalPoliciesIssued++;
        totalPremiumsCollected += amount;
        
        _addEvent(
            InsuranceEvent({
                user: user,
                token: token,
                amount: amount,
                duration: duration,
                eventType: EventType.POLICY_BOUGHT,
                timestamp: block.timestamp
            })
        );
    }
    
    // Record claim paid
    function recordClaim(
        address user,
        address token,
        uint256 amount
    ) external whenNotPaused {
        require(!blacklistedUsers[user], "User blacklisted");
        require(msg.sender == address(claimsManager), "Unauthorized");
        
        totalClaimsPaid += amount;
        
        _addEvent(
            InsuranceEvent({
                user: user,
                token: token,
                amount: amount,
                duration: 0,
                eventType: EventType.CLAIM_PAID,
                timestamp: block.timestamp
            })
        );
    }
    
    function _addEvent(InsuranceEvent memory event_) private {
        if (recentEvents.length >= MAX_RECENT_EVENTS) {
            // Remove oldest event
            for (uint i = 0; i < recentEvents.length - 1; i++) {
                recentEvents[i] = recentEvents[i + 1];
            }
            recentEvents.pop();
        }
        recentEvents.push(event_);
        
        emit NewInsuranceEvent(
            event_.user,
            event_.token,
            event_.amount,
            event_.duration,
            event_.eventType,
            event_.timestamp
        );
    }
    
    // View functions for dashboard
    function getSystemHealth() external view returns (
        uint256 tvl,
        uint256 activePolicies,
        uint256 averageYield,
        uint256 ltv
    ) {
        // Implementation depends on your specific metrics
        tvl = totalValueLocked;
        // ... calculate other metrics
    }
    
    function getRecentEvents(uint256 count) external view returns (InsuranceEvent[] memory) {
        uint256 resultCount = count > recentEvents.length ? recentEvents.length : count;
        InsuranceEvent[] memory results = new InsuranceEvent[](resultCount);
        
        for (uint i = 0; i < resultCount; i++) {
            results[i] = recentEvents[recentEvents.length - resultCount + i];
        }
        
        return results;
    }

    // Main update function
    function updateMetrics() external whenNotPaused nonReentrant {
        require(block.timestamp >= lastUpdateTimestamp + UPDATE_INTERVAL, "Too soon");
        
        _updateRiskMetrics();
        _updateUserMetrics();
        _updateFinancialMetrics();
        _updateTimeMetrics();
        _updateProtocolMetrics();

        // Circuit breaker check
        if (riskMetrics.riskScore > riskThreshold) {
            emit HighRiskDetected(riskMetrics.riskScore);
            _pause(); // Auto-pause if risk is too high
        }

        lastUpdateTimestamp = block.timestamp;
        emit MetricsUpdated(block.timestamp);
    }

    // Individual metric updates
    function _updateRiskMetrics() internal {
        uint256 timeframe = 30 days;
        uint256 claimCount = protocolMetrics.successfulClaims;
        
        // Avoid division by zero
        if (claimCount > 0) {
            riskMetrics.averageClaimSize = totalClaimsPaid / claimCount;
            riskMetrics.claimFrequency = (claimCount * 1e18) / timeframe;
        } else {
            riskMetrics.averageClaimSize = 0;
            riskMetrics.claimFrequency = 0;
        }

        // Update largest claim if current claim is larger
        if (totalClaimsPaid > riskMetrics.largestClaim) {
            riskMetrics.largestClaim = totalClaimsPaid;
        }

        // Risk score calculation based on multiple factors
        riskMetrics.riskScore = _calculateRiskScore();
    }

    function _updateUserMetrics() internal {
        userMetrics.repeatCustomerRate = userPolicyCount[msg.sender] > 1 ? 
            ((userPolicyCount[msg.sender] - 1) * 1e18) / userPolicyCount[msg.sender] : 0;
            
        userMetrics.averagePolicyDuration = totalPoliciesIssued > 0 ? 
            _calculateAverageDuration() : 0;
    }

    function _updateFinancialMetrics() internal {
        financialMetrics.netProfitLoss = totalPremiumsCollected - totalClaimsPaid;
        financialMetrics.utilizationRate = totalValueLocked > 0 ? 
            (totalClaimsPaid * 1e18) / totalValueLocked : 0;
        financialMetrics.premiumToClaimRatio = totalClaimsPaid > 0 ? 
            (totalPremiumsCollected * 1e18) / totalClaimsPaid : 0;
    }

    function _updateTimeMetrics() internal {
        timeMetrics.dailyActiveUsers = _countDailyActiveUsers();
        timeMetrics.weeklyNewPolicies = _countWeeklyPolicies();
        timeMetrics.monthlyClaimVolume = _countMonthlyClaimVolume();
    }

    function _updateProtocolMetrics() internal {
        protocolMetrics.averageProcessingTime = _calculateAverageProcessingTime();
    }

    // Helper functions
    function _calculateRiskScore() internal view returns (uint256) {
        uint256 CLAIM_WEIGHT = 40;     // 40% weight for claim metrics
        uint256 FINANCE_WEIGHT = 30;    // 30% weight for financial metrics
        uint256 TIME_WEIGHT = 30;       // 30% weight for time-based metrics
        
        // Initialize base risk at 50%
        uint256 baseRisk = 50 * 1e18;
        
        // Only adjust risk if we have data
        if (riskMetrics.claimFrequency > 0) {
            // Claim risk (higher claims = higher risk)
            uint256 claimRisk = (riskMetrics.averageClaimSize * riskMetrics.claimFrequency) / 1e18;
            
            // Financial risk (lower ratio = higher risk)
            uint256 financialRisk = financialMetrics.premiumToClaimRatio > 0 ?
                (1e36 / financialMetrics.premiumToClaimRatio) : baseRisk;
                
            // Time risk (shorter average duration = higher risk)
            uint256 timeRisk = userMetrics.averagePolicyDuration > 0 ?
                (365 days * 1e18) / userMetrics.averagePolicyDuration : baseRisk;
                
            // Combine weighted risks (result 0-100 scaled by 1e18)
            return (
                (claimRisk * CLAIM_WEIGHT) +
                (financialRisk * FINANCE_WEIGHT) +
                (timeRisk * TIME_WEIGHT)
            ) / 100;
        }
        
        return baseRisk; // Return base risk if no claim data
    }

    function _calculateAverageDuration() internal view returns (uint256) {
        InsuranceEvent[] memory events = recentEvents;
        if (events.length == 0) return 0;
        
        uint256 totalDuration = 0;
        uint256 policyCount = 0;
        
        for (uint i = 0; i < events.length; i++) {
            if (events[i].eventType == EventType.POLICY_BOUGHT) {
                totalDuration += events[i].duration;
                policyCount++;
            }
        }
        
        return policyCount > 0 ? totalDuration / policyCount : 0;
    }

    function _countDailyActiveUsers() internal view returns (uint256) {
        InsuranceEvent[] memory events = recentEvents;
        address[] memory processedUsers = new address[](events.length);
        uint256 userCount = 0;
        uint256 oneDayAgo = block.timestamp - 1 days;
        
        for (uint i = 0; i < events.length; i++) {
            if (events[i].timestamp >= oneDayAgo) {
                bool isNewUser = true;
                
                // Check if we've seen this user already
                for (uint j = 0; j < userCount; j++) {
                    if (processedUsers[j] == events[i].user) {
                        isNewUser = false;
                        break;
                    }
                }
                
                if (isNewUser) {
                    processedUsers[userCount] = events[i].user;
                    userCount++;
                }
            }
        }
        
        return userCount;
    }

    function _countWeeklyPolicies() internal view returns (uint256) {
        InsuranceEvent[] memory events = recentEvents;
        uint256 count = 0;
        uint256 oneWeekAgo = block.timestamp - 7 days;
        
        for (uint i = 0; i < events.length; i++) {
            if (events[i].timestamp >= oneWeekAgo && 
                events[i].eventType == EventType.POLICY_BOUGHT) {
                count++;
            }
        }
        
        return count;
    }

    function _countMonthlyClaimVolume() internal view returns (uint256) {
        InsuranceEvent[] memory events = recentEvents;
        uint256 volume = 0;
        uint256 thirtyDaysAgo = block.timestamp - 30 days;
        
        for (uint i = 0; i < events.length; i++) {
            if (events[i].timestamp >= thirtyDaysAgo && 
                events[i].eventType == EventType.CLAIM_PAID) {
                volume += events[i].amount;
            }
        }
        
        return volume;
    }

    function _calculateAverageProcessingTime() internal view returns (uint256) {
        // We'll need to track claim submission time and completion time
        // This is a placeholder until we add that tracking
        return protocolMetrics.averageProcessingTime;
    }

    // Add tracking for claim processing
    mapping(uint256 => uint256) public claimSubmissionTimes;
    
    function recordClaimSubmission(uint256 claimId) external {
        require(msg.sender == address(claimsManager), "Unauthorized");
        claimSubmissionTimes[claimId] = block.timestamp;
    }
    
    function recordClaimCompletion(uint256 claimId) external {
        require(msg.sender == address(claimsManager), "Unauthorized");
        uint256 submissionTime = claimSubmissionTimes[claimId];
        require(submissionTime > 0, "Claim not found");
        
        uint256 processingTime = block.timestamp - submissionTime;
        protocolMetrics.averageProcessingTime = 
            (protocolMetrics.averageProcessingTime * protocolMetrics.successfulClaims + processingTime) /
            (protocolMetrics.successfulClaims + 1);
    }

    // View functions for dashboard
    function getAllMetrics() external view returns (
        RiskMetrics memory,
        UserMetrics memory,
        FinancialMetrics memory,
        TimeMetrics memory,
        ProtocolMetrics memory
    ) {
        return (
            riskMetrics,
            userMetrics,
            financialMetrics,
            timeMetrics,
            protocolMetrics
        );
    }

    // Emergency functions
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Emergency data correction
    function correctMetrics(
        uint256 _totalPoliciesIssued,
        uint256 _totalPremiumsCollected,
        uint256 _totalClaimsPaid,
        uint256 _totalValueLocked
    ) external onlyOwner {
        totalPoliciesIssued = _totalPoliciesIssued;
        totalPremiumsCollected = _totalPremiumsCollected;
        totalClaimsPaid = _totalClaimsPaid;
        totalValueLocked = _totalValueLocked;
        emit MetricsCorrected();
    }

    // Emergency blacklist for malicious users
    function setBlacklist(address user, bool blacklisted) external onlyOwner {
        blacklistedUsers[user] = blacklisted;
        emit BlacklistUpdated(user, blacklisted);
    }

    // Emergency clear recent events if something goes wrong
    function clearRecentEvents() external onlyOwner {
        delete recentEvents;
        emit EventsCleared();
    }

    // Emergency withdraw any stuck tokens
    function rescueToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
        emit TokenRescued(token, amount);
    }

    // Emergency withdraw any stuck ETH
    function rescueETH() external onlyOwner {
        (bool success, ) = owner().call{value: address(this).balance}("");
        require(success, "ETH rescue failed");
        emit ETHRescued(address(this).balance);
    }

    // Circuit breaker for extreme market conditions
    uint256 public riskThreshold = 80 * 1e18; // 80% risk threshold
    
    function setRiskThreshold(uint256 _threshold) external onlyOwner {
        require(_threshold <= 100 * 1e18, "Invalid threshold");
        riskThreshold = _threshold;
        emit RiskThresholdUpdated(_threshold);
    }

    // Events
    event MetricsCorrected();
    event EventsCleared();
    event TokenRescued(address token, uint256 amount);
    event ETHRescued(uint256 amount);
    event RiskThresholdUpdated(uint256 newThreshold);
    event HighRiskDetected(uint256 riskScore);
} 