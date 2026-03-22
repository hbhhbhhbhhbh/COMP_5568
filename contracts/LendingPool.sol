// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IPriceOracle.sol";
import "./interfaces/IFlashLoanReceiver.sol";
import "./GovernanceToken.sol";

/**
 * @title LendingPool
 * @dev Core lending protocol: deposit collateral, borrow, repay, withdraw, liquidate, flash loan.
 * Tracks user positions, utilization, and health factor. Uses checks-effects-interactions.
 */
contract LendingPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct UserPosition {
        uint256 collateral;
        uint256 debt;
    }

    /// @dev Collateral asset (e.g. WETH or mock token)
    address public immutable collateralAsset;
    /// @dev Borrowable asset (e.g. USDC or mock token)
    address public immutable borrowAsset;

    IPriceOracle public oracle;
    GovernanceToken public governanceToken;

    mapping(address => UserPosition) public positions;

    uint256 public totalCollateral;
    uint256 public totalBorrowed;

    /// @dev Liquidation threshold in basis points (e.g. 8000 = 80%). If HF < 1 (debt value > collateral value * threshold), liquidatable.
    uint256 public liquidationThreshold = 8000; // 80%
    /// @dev Liquidation bonus in basis points (e.g. 1000 = 10%). Liquidator receives collateral at discount.
    uint256 public liquidationBonus = 1000; // 10%
    /// @dev Flash loan fee in basis points (e.g. 9 = 0.09%)
    uint256 public flashLoanFeeBps = 9;

    /// @dev Liquidity mining: reward per deposit (in governance token wei)
    uint256 public rewardPerDeposit = 1e18;
    /// @dev Liquidity mining: reward per borrow (in governance token wei)
    uint256 public rewardPerBorrow = 1e17;

    uint256 private constant BPS = 10000;
    uint256 private constant PRICE_DECIMALS = 8;

    bool private _flashLoanLock;

    event Deposit(address indexed user, address indexed asset, uint256 amount);
    event Withdraw(address indexed user, address indexed asset, uint256 amount);
    event Borrow(address indexed user, address indexed asset, uint256 amount);
    event Repay(address indexed user, address indexed asset, uint256 amount);
    event Liquidate(address indexed liquidator, address indexed user, address collateralAsset, address debtAsset, uint256 debtRepaid, uint256 collateralReceived);
    event FlashLoan(address indexed receiver, address indexed asset, uint256 amount, uint256 fee);

    constructor(
        address _collateralAsset,
        address _borrowAsset,
        address _oracle,
        address _governanceToken
    ) {
        require(_collateralAsset != address(0) && _borrowAsset != address(0), "LendingPool: zero address");
        require(_oracle != address(0) && _governanceToken != address(0), "LendingPool: zero address");
        collateralAsset = _collateralAsset;
        borrowAsset = _borrowAsset;
        oracle = IPriceOracle(_oracle);
        governanceToken = GovernanceToken(payable(_governanceToken));
    }

    /**
     * @dev Deposit collateral. Increases user's collateral and updates total.
     */
    function deposit(address asset, uint256 amount) external nonReentrant {
        require(asset == collateralAsset, "LendingPool: not collateral asset");
        require(amount > 0, "LendingPool: zero amount");

        positions[msg.sender].collateral += amount;
        totalCollateral += amount;

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        if (rewardPerDeposit > 0) {
            governanceToken.mintReward(msg.sender, rewardPerDeposit);
        }

        emit Deposit(msg.sender, asset, amount);
    }

    /**
     * @dev Withdraw collateral. Reverts if health factor would drop below 1.
     */
    function withdraw(address asset, uint256 amount) external nonReentrant {
        require(asset == collateralAsset, "LendingPool: not collateral asset");
        require(amount > 0, "LendingPool: zero amount");

        UserPosition storage pos = positions[msg.sender];
        require(pos.collateral >= amount, "LendingPool: insufficient collateral");

        pos.collateral -= amount;
        totalCollateral -= amount;

        if (pos.debt > 0) {
            require(getHealthFactor(msg.sender) >= 1e18, "LendingPool: health factor would drop below 1");
        }

        IERC20(asset).safeTransfer(msg.sender, amount);

        emit Withdraw(msg.sender, asset, amount);
    }

    /**
     * @dev Borrow asset. Reverts if health factor would drop below 1.
     */
    function borrow(address asset, uint256 amount) external nonReentrant {
        require(asset == borrowAsset, "LendingPool: not borrow asset");
        require(amount > 0, "LendingPool: zero amount");

        UserPosition storage pos = positions[msg.sender];
        require(pos.collateral > 0, "LendingPool: no collateral");

        require(IERC20(asset).balanceOf(address(this)) >= amount, "LendingPool: insufficient liquidity");

        pos.debt += amount;
        totalBorrowed += amount;

        require(getHealthFactor(msg.sender) >= 1e18, "LendingPool: health factor below 1");

        uint256 balanceBefore = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransfer(msg.sender, amount);
        require(IERC20(asset).balanceOf(address(this)) == balanceBefore - amount, "LendingPool: transfer failed");

        if (rewardPerBorrow > 0) {
            governanceToken.mintReward(msg.sender, rewardPerBorrow);
        }

        emit Borrow(msg.sender, asset, amount);
    }

    /**
     * @dev Repay borrowed asset. Can repay more than debt (excess stays in pool).
     */
    function repay(address asset, uint256 amount) external nonReentrant {
        require(asset == borrowAsset, "LendingPool: not borrow asset");
        require(amount > 0, "LendingPool: zero amount");

        UserPosition storage pos = positions[msg.sender];
        uint256 toRepay = amount > pos.debt ? pos.debt : amount;

        pos.debt -= toRepay;
        totalBorrowed -= toRepay;

        IERC20(asset).safeTransferFrom(msg.sender, address(this), toRepay);

        emit Repay(msg.sender, asset, toRepay);
    }

    /**
     * @dev Liquidate an unhealthy position. Liquidator repays user's debt and receives collateral with bonus.
     * @param collateralAsset_ Collateral asset to seize
     * @param debtAsset_ Debt asset to repay
     * @param user The unhealthy position owner
     */
    function liquidate(address collateralAsset_, address debtAsset_, address user) external nonReentrant {
        require(collateralAsset_ == collateralAsset && debtAsset_ == borrowAsset, "LendingPool: wrong assets");
        require(getHealthFactor(user) < 1e18, "LendingPool: position not liquidatable");

        UserPosition storage pos = positions[user];
        uint256 debtRepay = pos.debt; // liquidate full debt for simplicity
        require(debtRepay > 0, "LendingPool: no debt");

        uint256 collateralPrice = oracle.getPrice(collateralAsset_);
        uint256 debtPrice = oracle.getPrice(debtAsset_);
        require(collateralPrice > 0 && debtPrice > 0, "LendingPool: invalid price");

        // Collateral to give = (debtRepay * debtPrice / collateralPrice) * (10000 + bonus) / 10000
        uint256 collateralToSeize = (debtRepay * debtPrice * (BPS + liquidationBonus)) / (collateralPrice * BPS);
        if (collateralToSeize > pos.collateral) collateralToSeize = pos.collateral;

        pos.debt -= debtRepay;
        pos.collateral -= collateralToSeize;
        totalBorrowed -= debtRepay;
        totalCollateral -= collateralToSeize;

        IERC20(debtAsset_).safeTransferFrom(msg.sender, address(this), debtRepay);
        IERC20(collateralAsset_).safeTransfer(msg.sender, collateralToSeize);

        emit Liquidate(msg.sender, user, collateralAsset_, debtAsset_, debtRepay, collateralToSeize);
    }

    /**
     * @dev Flash loan: loan must be returned + fee in the same transaction.
     */
    function flashLoan(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params
    ) external nonReentrant {
        require(asset == collateralAsset || asset == borrowAsset, "LendingPool: unsupported asset");
        require(amount > 0, "LendingPool: zero amount");
        require(!_flashLoanLock, "LendingPool: reentrant flash loan");

        uint256 fee = (amount * flashLoanFeeBps) / BPS;

        _flashLoanLock = true;

        uint256 balanceBefore = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransfer(receiverAddress, amount);

        require(
            IFlashLoanReceiver(receiverAddress).executeOperation(asset, amount, fee, msg.sender, params),
            "LendingPool: flash loan callback failed"
        );

        uint256 balanceAfter = IERC20(asset).balanceOf(address(this));
        require(balanceAfter >= balanceBefore + fee, "LendingPool: flash loan not repaid");

        _flashLoanLock = false;

        emit FlashLoan(receiverAddress, asset, amount, fee);
    }

    /**
     * @dev Get user collateral and debt amounts.
     */
    function getUserPosition(address user) external view returns (uint256 collateral, uint256 debt) {
        UserPosition storage pos = positions[user];
        return (pos.collateral, pos.debt);
    }

    /**
     * @dev Health factor in 18 decimals. HF < 1e18 means liquidatable.
     * healthFactor = (collateralValue * liquidationThreshold) / debtValue (scaled 1e18)
     */
    function getHealthFactor(address user) public view returns (uint256) {
        UserPosition storage pos = positions[user];
        if (pos.debt == 0) return type(uint256).max;

        uint256 collateralValue = (pos.collateral * oracle.getPrice(collateralAsset));
        uint256 debtValue = (pos.debt * oracle.getPrice(borrowAsset));
        return (collateralValue * liquidationThreshold * 1e18) / (debtValue * BPS);
    }

    /**
     * @dev Utilization rate in basis points: totalBorrowed / totalSupply (of borrow asset in pool).
     * totalSupply for borrow asset = balance of this contract.
     */
    function getUtilizationRate() external view returns (uint256) {
        uint256 supply = IERC20(borrowAsset).balanceOf(address(this)) + totalBorrowed;
        if (supply == 0) return 0;
        return (totalBorrowed * BPS) / supply;
    }

    /**
     * @dev Check if a user's position is liquidatable (health factor < 1).
     */
    function isLiquidatable(address user) external view returns (bool) {
        return getHealthFactor(user) < 1e18;
    }

    /**
     * @dev Maximum borrow amount for a user so that health factor stays >= 1.
     * Capped by pool available liquidity. Returns 0 if no collateral or already at limit.
     */
    function getMaxBorrow(address user) external view returns (uint256) {
        UserPosition storage pos = positions[user];
        if (pos.collateral == 0) return 0;

        uint256 colPrice = oracle.getPrice(collateralAsset);
        uint256 debtPrice = oracle.getPrice(borrowAsset);
        if (debtPrice == 0) return 0;

        uint256 collateralValue = pos.collateral * colPrice;
        uint256 debtValue = pos.debt * debtPrice;
        uint256 maxDebtValue = (collateralValue * liquidationThreshold) / BPS;
        if (maxDebtValue <= debtValue) return 0;

        uint256 maxAdditionalDebtValue = maxDebtValue - debtValue;
        uint256 maxBorrowByHF = maxAdditionalDebtValue / debtPrice;

        uint256 available = IERC20(borrowAsset).balanceOf(address(this));
        return maxBorrowByHF > available ? available : maxBorrowByHF;
    }

    /**
     * @dev Get flash loan fee for a given amount.
     */
    function getFlashLoanFee(uint256 amount) external view returns (uint256) {
        return (amount * flashLoanFeeBps) / BPS;
    }
}
