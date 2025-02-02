// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract ClaimsManager is Ownable {
    IPyth public pyth;
    IERC20 public immutable USDC;
    
    uint256 public constant MIN_CLAIM_FEE = 1e6;  // 1 USDC
    uint256 public constant CLAIM_FEE_PERCENT = 1;  // 1% of coverage
    uint256 public constant DEPEG_THRESHOLD = 95_000_000; // 95% of peg (0.95 * 1e8)
    uint256 public constant CLAIM_WINDOW = 7 days;
    
    struct Claim {
        uint256 policyId;
        uint256 amount;
        uint256 timestamp;
        uint256 claimFee;
        ClaimStatus status;
    }
    
    enum ClaimStatus { Pending, Approved, Rejected, Paid }
    
    mapping(uint256 => Claim) public claims;
    mapping(address => bytes32) public priceFeeds;
    
    event ClaimSubmitted(uint256 indexed claimId, uint256 indexed policyId);
    event ClaimProcessed(uint256 indexed claimId, ClaimStatus status);
    
    constructor(address _pyth, address _usdc) {
        _transferOwnership(msg.sender);
        pyth = IPyth(_pyth);
        USDC = IERC20(_usdc);
    }
    
    function setPriceFeed(address stablecoin, bytes32 priceId) external onlyOwner {
        priceFeeds[stablecoin] = priceId;
    }
    
    function calculateClaimFee(uint256 premium) public pure returns (uint256) {
        uint256 percentFee = (premium * CLAIM_FEE_PERCENT) / 10000;
        return percentFee > MIN_CLAIM_FEE ? percentFee : MIN_CLAIM_FEE;
    }
    
    function submitClaim(
        uint256 policyId,
        uint256 amount,
        uint256 premium,
        bytes[] calldata priceUpdateData
    ) external payable returns (uint256) {
        uint256 claimFee = calculateClaimFee(premium);
        require(USDC.transferFrom(msg.sender, address(this), claimFee), "Fee transfer failed");
        
        pyth.updatePriceFeeds{value: msg.value}(priceUpdateData);
        
        uint256 claimId = uint256(keccak256(abi.encodePacked(block.timestamp, policyId)));
        claims[claimId] = Claim({
            policyId: policyId,
            amount: amount,
            timestamp: block.timestamp,
            claimFee: claimFee,
            status: ClaimStatus.Pending
        });
        
        emit ClaimSubmitted(claimId, policyId);
        return claimId;
    }
    
    function processClaim(uint256 claimId, address stablecoin) external {
        Claim storage claim = claims[claimId];
        require(claim.timestamp != 0, "Claim does not exist");
        require(claim.status == ClaimStatus.Pending, "Claim already processed");
        
        bytes32 priceId = priceFeeds[stablecoin];
        PythStructs.Price memory currentPrice = pyth.getPriceNoOlderThan(priceId, block.timestamp - 60);
        
        if (uint64(currentPrice.price) < DEPEG_THRESHOLD) {
            claim.status = ClaimStatus.Approved;
            require(USDC.transfer(msg.sender, claim.claimFee), "Fee refund failed");
        } else {
            claim.status = ClaimStatus.Rejected;
        }
        
        emit ClaimProcessed(claimId, claim.status);
    }
}