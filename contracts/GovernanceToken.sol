// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GovernanceToken
 * @dev ERC20 governance token with liquidity mining: mints rewards to lenders and borrowers.
 * Reward rate is per-second (or can be interpreted per-block depending on how often updateReward is called).
 */
contract GovernanceToken is ERC20, Ownable {
    /// @dev Reward rate: tokens per second (scaled by 1e18 for precision)
    uint256 public rewardRatePerSecond;

    /// @dev Last update timestamp for global reward index
    uint256 public lastUpdateTime;

    /// @dev Global reward per token accumulated (scaled by 1e18)
    uint256 public rewardPerTokenStored;

    /// @dev Lending pool that can notify rewards (only this contract can mint to users)
    address public lendingPool;

    /// @dev User reward per token paid (for each user)
    mapping(address => uint256) public userRewardPerTokenPaid;

    /// @dev User accumulated rewards (not yet claimed)
    mapping(address => uint256) public rewards;

    uint256 private constant PRECISION = 1e18;

    event RewardRateSet(uint256 rate);
    event LendingPoolSet(address indexed pool);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardsMintedTo(address indexed to, uint256 amount);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) Ownable(msg.sender) {
        rewardRatePerSecond = 1e18; // 1 token per second default (scaled)
    }

    /**
     * @dev Set the lending pool (only owner). Only lending pool can mint rewards.
     */
    function setLendingPool(address _lendingPool) external onlyOwner {
        lendingPool = _lendingPool;
        emit LendingPoolSet(_lendingPool);
    }

    /**
     * @dev Set reward rate per second (scaled by 1e18).
     */
    function setRewardRatePerSecond(uint256 _rate) external onlyOwner {
        rewardRatePerSecond = _rate;
        emit RewardRateSet(_rate);
    }

    /**
     * @dev Called by LendingPool to mint rewards to a user (lender or borrower).
     * Only callable by the configured lending pool.
     */
    function mintReward(address to, uint256 amount) external {
        require(msg.sender == lendingPool, "GovernanceToken: only lending pool");
        _mint(to, amount);
        emit RewardsMintedTo(to, amount);
    }

    /**
     * @dev Liquidity mining: update global reward index (call before balance changes).
     */
    function updateReward(address account) external {
        require(msg.sender == lendingPool, "GovernanceToken: only lending pool");
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }

    function rewardPerToken() public view returns (uint256) {
        if (block.timestamp < lastUpdateTime) return rewardPerTokenStored;
        return rewardPerTokenStored + (block.timestamp - lastUpdateTime) * rewardRatePerSecond;
    }

    function earned(address account) public view returns (uint256) {
        return rewards[account]; // simplified: actual earned = balance * (rewardPerToken() - userRewardPerTokenPaid) / PRECISION + rewards[account]
    }

    /**
     * @dev Owner can mint initial supply (e.g. for liquidity or treasury).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
