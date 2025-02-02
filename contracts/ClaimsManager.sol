// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract ClaimsManager is Ownable, Pausable {
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
        address claimant;
        ClaimStatus status;
    }
    
    enum ClaimStatus { Pending, Approved, Rejected, Paid }
    
    mapping(uint256 => Claim) public claims;
    mapping(address => bytes32) public priceFeeds;
    
    event ClaimSubmitted(uint256 indexed claimId, uint256 indexed policyId, address indexed claimant);
    event ClaimProcessed(uint256 indexed claimId, ClaimStatus status);
    event PriceFeedSet(address indexed stablecoin, bytes32 priceId);
    event PythUpdated(address indexed oldPyth, address indexed newPyth);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    
    constructor(address _pyth, address _usdc) {
        require(_pyth != address(0) && _usdc != address(0), "Invalid address");
        _transferOwnership(msg.sender);
        pyth = IPyth(_pyth);
        USDC = IERC20(_usdc);
    }
    
    function setPriceFeed(address stablecoin, bytes32 priceId) external onlyOwner {
        require(stablecoin != address(0), "Invalid stablecoin address");
        require(priceId != bytes32(0), "Invalid price feed ID");
        priceFeeds[stablecoin] = priceId;
        emit PriceFeedSet(stablecoin, priceId);
    }
    
    function updatePyth(address _pyth) external onlyOwner {
        require(_pyth != address(0), "Invalid Pyth address");
        address oldPyth = address(pyth);
        pyth = IPyth(_pyth);
        emit PythUpdated(oldPyth, _pyth);
    }
    
    function calculateClaimFee(uint256 premium) public pure returns (uint256) {
        uint256 percentFee = (premium * CLAIM_FEE_PERCENT) / 100;
        return percentFee > MIN_CLAIM_FEE ? percentFee : MIN_CLAIM_FEE;
    }
    
    function submitClaim(
        uint256 policyId,
        uint256 amount,
        uint256 premium,
        bytes[] calldata priceUpdateData
    ) external payable whenNotPaused returns (uint256) {
        require(amount > 0, "Invalid amount");
        require(priceUpdateData.length > 0, "No price data");
        
        uint256 claimFee = calculateClaimFee(premium);
        require(USDC.transferFrom(msg.sender, address(this), claimFee), "Fee transfer failed");
        
        pyth.updatePriceFeeds{value: msg.value}(priceUpdateData);
        
        uint256 claimId = uint256(keccak256(abi.encodePacked(
            block.timestamp, 
            policyId, 
            msg.sender
        )));
        
        claims[claimId] = Claim({
            policyId: policyId,
            amount: amount,
            timestamp: block.timestamp,
            claimFee: claimFee,
            claimant: msg.sender,
            status: ClaimStatus.Pending
        });
        
        emit ClaimSubmitted(claimId, policyId, msg.sender);
        return claimId;
    }
    
    function processClaim(uint256 claimId, address stablecoin) external whenNotPaused {
        require(stablecoin != address(0), "Invalid stablecoin address");
        
        Claim storage claim = claims[claimId];
        require(claim.timestamp != 0, "Claim does not exist");
        require(claim.status == ClaimStatus.Pending, "Claim already processed");
        require(block.timestamp <= claim.timestamp + CLAIM_WINDOW, "Claim window expired");
        
        bytes32 priceId = priceFeeds[stablecoin];
        require(priceId != bytes32(0), "Price feed not set");
        
        PythStructs.Price memory currentPrice = pyth.getPriceNoOlderThan(priceId, 60);
        require(currentPrice.price != 0, "Invalid price data");
        
        if (uint64(currentPrice.price) < DEPEG_THRESHOLD) {
            claim.status = ClaimStatus.Approved;
            require(USDC.transfer(claim.claimant, claim.claimFee), "Fee refund failed");
        } else {
            claim.status = ClaimStatus.Rejected;
        }
        
        emit ClaimProcessed(claimId, claim.status);
    }
    
    function emergencyWithdraw(address token) external onlyOwner whenPaused {
        require(token != address(0), "Invalid token address");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");
        require(IERC20(token).transfer(owner(), balance), "Transfer failed");
        emit EmergencyWithdraw(token, balance);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
}