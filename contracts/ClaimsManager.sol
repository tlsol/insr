// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IInsurancePool.sol";
import "./interfaces/IStatistics.sol";
import "./interfaces/IStakingPool.sol";
import "./interfaces/IFTSOv2.sol";

contract ClaimsManager is Ownable, Pausable, ReentrancyGuard {
    struct Claim {
        uint256 claimId;       // ID of the claim
        address user;          // User who filed the claim
        address stablecoin;    // Stablecoin the policy is in
        uint256 policyId;      // Associated policy ID
        uint256 amount;        // Amount claimed in stablecoin's decimals
        uint256 fee;           // Processing fee in stablecoin's decimals
        uint256 timestamp;     // When claim was filed
        ClaimStatus status;    // Current status of claim
        string rejectReason;    // Reason for rejection
    }
    
    enum ClaimStatus { None, Pending, Approved, Rejected, Paid }
    
    IERC20 public immutable USDC;
    IInsurancePool public insurancePool;
    IStatistics public statistics;
    IStakingPool public stakingPool;
    IFTSOv2 public immutable FTSO;

    uint256 public nextClaimId = 1;
    mapping(uint256 => Claim) public claims;
    
    struct StablecoinConfig {
        bool supported;
        bytes21 priceId;
        uint256 depegThreshold;
        uint256 minFee;
        uint16 feeRate;
    }
    
    mapping(address => StablecoinConfig) public stablecoins;

    mapping(address => bool) public blacklistedUsers;
    uint256 public submissionTimeout;
    uint256 public processingTimeout;

    mapping(address => uint256) public lastPrices;

    event StablecoinConfigured(
        address token,
        bytes21 priceId,
        uint256 depegThreshold,
        uint256 minFee,
        uint16 feeRate
    );
    event ClaimSubmitted(
        uint256 indexed claimId,
        address indexed user,
        address stablecoin,
        uint256 amount
    );
    event ClaimProcessed(uint256 indexed claimId, ClaimStatus status);
    event ClaimPaid(uint256 indexed claimId, address recipient, uint256 amount);
    event PriceFeedSet(address indexed stablecoin, bytes32 priceId);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    event StatisticsUpdated(address statistics);
    event EmergencyClaimProcessed(uint256 indexed claimId, bool approved, string reason);
    event BlacklistUpdated(address indexed user, bool blacklisted);
    event TimeoutsUpdated(uint256 submissionTimeout, uint256 processingTimeout);
    event ClaimApproved(uint256 indexed claimId, uint256 amount);
    event ClaimRejected(uint256 indexed claimId, string reason);

    constructor(
        address _usdc,
        address _insurancePool,
        address _stakingPool,
        address _ftso
    ) {
        require(_usdc != address(0) && _ftso != address(0), "Invalid address");
        _transferOwnership(msg.sender);
        USDC = IERC20(_usdc);
        insurancePool = IInsurancePool(_insurancePool);
        stakingPool = IStakingPool(_stakingPool);
        FTSO = IFTSOv2(_ftso);
        submissionTimeout = 7 days;
        processingTimeout = 3 days;
    }
    
    function setPriceFeed(address stablecoin, bytes32 priceId) external onlyOwner {
        require(stablecoin != address(0), "Invalid stablecoin address");
        require(priceId != bytes32(0), "Invalid price feed ID");
        stablecoins[stablecoin].priceId = bytes21(priceId);
        emit PriceFeedSet(stablecoin, priceId);
    }
    
    function configureStablecoin(
        address token,
        bytes21 priceId,
        uint256 depegThreshold,
        uint256 minFee,
        uint16 feeRate
    ) external onlyOwner {
        require(token != address(0), "Invalid stablecoin");
        require(feeRate <= 1000, "Fee rate too high"); // Max 10%
        
        stablecoins[token] = StablecoinConfig({
            supported: true,
            priceId: priceId,
            depegThreshold: depegThreshold,
            minFee: minFee,
            feeRate: feeRate
        });

        emit StablecoinConfigured(token, priceId, depegThreshold, minFee, feeRate);
    }
    
    function calculateClaimFee(
        address _stablecoin,
        uint256 _amount
    ) public view returns (uint256) {
        StablecoinConfig memory config = stablecoins[_stablecoin];
        require(config.supported, "Unsupported stablecoin");

        uint256 fee = (_amount * config.feeRate) / 10000;
        return fee < config.minFee ? config.minFee : fee;
    }
    
    modifier notBlacklisted() {
        require(!blacklistedUsers[msg.sender], "User blacklisted");
        _;
    }
    
    function submitClaim(
        uint256 _policyId,
        uint256 _amount
    ) external notBlacklisted whenNotPaused returns (uint256) {
        IInsurancePool.Policy memory policy = insurancePool.getPolicy(msg.sender, _policyId);
        require(policy.active && !policy.claimed, "Invalid policy");
        require(block.timestamp <= policy.expiration, "Policy expired");
        
        StablecoinConfig memory config = stablecoins[policy.stablecoin];
        require(config.supported, "Unsupported stablecoin");

        uint256 fee = calculateClaimFee(policy.stablecoin, _amount);
        uint256 claimId = nextClaimId++;
        
        claims[claimId] = Claim({
            claimId: claimId,
            user: msg.sender,
            stablecoin: policy.stablecoin,
            policyId: _policyId,
            amount: _amount,
            fee: fee,
            timestamp: block.timestamp,
            status: ClaimStatus.Pending,
            rejectReason: ""
        });

        emit ClaimSubmitted(claimId, msg.sender, policy.stablecoin, _amount);
        return claimId;
    }
    
    function processClaim(
        uint256 _claimId,
        bool _approved
    ) external onlyOwner {
        Claim storage claim = claims[_claimId];
        require(claim.status == ClaimStatus.Pending, "Invalid claim status");

        if (_approved) {
            _approveClaim(_claimId);
        } else {
            _rejectClaim(_claimId, "");
        }

        emit ClaimProcessed(_claimId, claim.status);
    }
    
    function _processPayout(Claim storage _claim) internal {
        require(_claim.status == ClaimStatus.Approved, "Claim not approved");
        
        // Transfer claim amount to user
        IERC20 token = IERC20(_claim.stablecoin);
        require(
            token.transferFrom(address(insurancePool), _claim.user, _claim.amount),
            "Payout failed"
        );

        _claim.status = ClaimStatus.Paid;
        emit ClaimPaid(_claim.claimId, _claim.user, _claim.amount);

        // Record the claim
        if (address(statistics) != address(0)) {
            statistics.recordClaim(
                _claim.user,
                _claim.stablecoin,
                _claim.amount
            );
        }
    }
    
    function emergencyWithdraw(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyOwner {
        require(_to != address(0), "Invalid address");
        IERC20(_token).transfer(_to, _amount);
        emit EmergencyWithdraw(_token, _amount);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }

    function setStatistics(address _statistics) external onlyOwner {
        require(_statistics != address(0), "Invalid address");
        statistics = IStatistics(_statistics);
        emit StatisticsUpdated(_statistics);
    }

    function _approveClaim(uint256 claimId) internal {
        Claim storage claim = claims[claimId];
        claim.status = ClaimStatus.Approved;
        _processPayout(claim);
        emit ClaimApproved(claimId, claim.amount);
    }

    function _rejectClaim(uint256 claimId, string memory reason) internal {
        Claim storage claim = claims[claimId];
        claim.status = ClaimStatus.Rejected;
        claim.rejectReason = reason;
        emit ClaimRejected(claimId, reason);
    }

    function emergencyProcessClaim(uint256 claimId, bool approved, string memory reason) external onlyOwner {
        require(claims[claimId].status == ClaimStatus.Pending, "Invalid status");
        if (approved) {
            _approveClaim(claimId);
        } else {
            _rejectClaim(claimId, reason);
        }
        emit EmergencyClaimProcessed(claimId, approved, reason);
    }

    function setBlacklist(address user, bool blacklisted) external onlyOwner {
        blacklistedUsers[user] = blacklisted;
        emit BlacklistUpdated(user, blacklisted);
    }

    function updateTimeouts(
        uint256 _submissionTimeout,
        uint256 _processingTimeout
    ) external onlyOwner {
        submissionTimeout = _submissionTimeout;
        processingTimeout = _processingTimeout;
        emit TimeoutsUpdated(_submissionTimeout, _processingTimeout);
    }

    function getTokenPrice(address token) public view returns (uint256) {
        StablecoinConfig memory config = stablecoins[token];
        require(config.supported, "Token not supported");
        
        bytes21[] memory feedIds = new bytes21[](1);
        feedIds[0] = config.priceId;
        
        (uint256[] memory values, int8[] memory decimals, uint256[] memory timestamps) = FTSO.getFeedsById(feedIds);
        require(values.length > 0, "No price data");
        
        // Add staleness check - 1 hour max age
        require(block.timestamp - timestamps[0] <= 1 hours, "Price too old");
        
        // Convert to 18 decimals
        uint8 decimalPlaces = uint8(-decimals[0]);
        uint8 neededDecimals = 18 - decimalPlaces;
        return values[0] * (10 ** neededDecimals);
    }

    function updateAndGetPrice(address token) public returns (uint256) {
        uint256 newPrice = getTokenPrice(token);
        
        // Validate price change
        uint256 oldPrice = lastPrices[token];
        if (oldPrice != 0) {
            uint256 priceChange = oldPrice > newPrice 
                ? ((oldPrice - newPrice) * 100) / oldPrice 
                : ((newPrice - oldPrice) * 100) / oldPrice;
            require(priceChange <= 20, "Price change too large");
        }
        
        // Update state
        lastPrices[token] = newPrice;
        return newPrice;
    }

    function isDepegged(address token) public view returns (bool) {
        StablecoinConfig memory config = stablecoins[token];
        require(config.supported, "Token not supported");
        
        uint256 price = getTokenPrice(token);  // This is in 18 decimals
        uint256 threshold = config.depegThreshold * (10 ** 12);  // Convert 6 decimals to 18
        return price < threshold;
    }
}