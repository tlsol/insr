// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IStakingPool.sol";
import "./interfaces/IClaimsManager.sol";

contract InsuranceStatistics is Ownable {
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
    
    constructor(address _stakingPool, address _claimsManager) {
        stakingPool = IStakingPool(_stakingPool);
        claimsManager = IClaimsManager(_claimsManager);
    }
    
    // Record new policy
    function recordNewPolicy(
        address user,
        address token,
        uint256 amount,
        uint256 duration
    ) external {
        require(msg.sender == address(stakingPool), "Unauthorized");
        
        totalPoliciesIssued++;
        
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
    ) external {
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
} 