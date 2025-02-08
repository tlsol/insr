// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "./interfaces/IInsurancePool.sol";
import "./interfaces/IStatistics.sol";

contract ClaimsManager is Ownable, Pausable {
    struct Claim {
        uint256 claimId;       // ID of the claim
        address user;          // User who filed the claim
        address stablecoin;    // Stablecoin the policy is in
        uint256 policyId;      // Associated policy ID
        uint256 amount;        // Amount claimed in stablecoin's decimals
        uint256 fee;           // Processing fee in stablecoin's decimals
        uint256 timestamp;     // When claim was filed
        ClaimStatus status;    // Current status of claim
    }
    
    enum ClaimStatus { Pending, Approved, Rejected, Paid }
    
    IPyth public pyth;
    IERC20 public immutable USDC;
    IInsurancePool public insurancePool;
    IStatistics public statistics;

    uint256 public nextClaimId = 1;
    mapping(uint256 => Claim) public claims;
    
    struct StablecoinConfig {
        bool supported;
        bytes32 priceId;        // Flare price feed ID
        uint256 depegThreshold; // e.g., 95000000 for $0.95 (8 decimals)
        uint256 minFee;         // Minimum fee in stablecoin's decimals
        uint256 feeRate;        // Fee rate in basis points (1/10000)
    }
    
    mapping(address => StablecoinConfig) public stablecoins;

    event StablecoinConfigured(
        address stablecoin,
        bytes32 priceId,
        uint256 depegThreshold,
        uint256 minFee,
        uint256 feeRate
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
    event PythUpdated(address indexed oldPyth, address indexed newPyth);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    event StatisticsUpdated(address statistics);
    
    constructor(address _pyth, address _usdc, address _insurancePool) {
        require(_pyth != address(0) && _usdc != address(0), "Invalid address");
        _transferOwnership(msg.sender);
        pyth = IPyth(_pyth);
        USDC = IERC20(_usdc);
        insurancePool = IInsurancePool(_insurancePool);
    }
    
    function setPriceFeed(address stablecoin, bytes32 priceId) external onlyOwner {
        require(stablecoin != address(0), "Invalid stablecoin address");
        require(priceId != bytes32(0), "Invalid price feed ID");
        stablecoins[stablecoin].priceId = priceId;
        emit PriceFeedSet(stablecoin, priceId);
    }
    
    function updatePyth(address _pyth) external onlyOwner {
        require(_pyth != address(0), "Invalid Pyth address");
        address oldPyth = address(pyth);
        pyth = IPyth(_pyth);
        emit PythUpdated(oldPyth, _pyth);
    }
    
    function configureStablecoin(
        address _stablecoin,
        bytes32 _priceId,
        uint256 _depegThreshold,
        uint256 _minFee,
        uint256 _feeRate
    ) external onlyOwner {
        require(_stablecoin != address(0), "Invalid stablecoin");
        require(_feeRate <= 1000, "Fee rate too high"); // Max 10%
        
        stablecoins[_stablecoin] = StablecoinConfig({
            supported: true,
            priceId: _priceId,
            depegThreshold: _depegThreshold,
            minFee: _minFee,
            feeRate: _feeRate
        });

        emit StablecoinConfigured(
            _stablecoin,
            _priceId,
            _depegThreshold,
            _minFee,
            _feeRate
        );
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
    
    function submitClaim(
        uint256 _policyId,
        uint256 _amount
    ) external whenNotPaused returns (uint256) {
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
            status: ClaimStatus.Pending
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
            claim.status = ClaimStatus.Approved;
            _processPayout(claim);
        } else {
            claim.status = ClaimStatus.Rejected;
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
}