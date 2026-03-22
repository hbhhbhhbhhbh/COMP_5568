// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./interfaces/IFlashLoanReceiver.sol";
import "./ReceiptToken.sol";
import "./GovernanceToken.sol";

/**
 * @title PCOLBUSDPool
 * @dev 单一 AMM 池：池内只有 COL 和 BUSD。存入时给用户对应 PCOL 或 PBUSD（凭证，不加入池子）。
 *      抵押时 P 币按池内对应币计价；取款时用 P 币 1:1 从池中取回对应币。可互相借取：抵押 PCOL 借 BUSD，抵押 PBUSD 借 COL。
 */
contract PCOLBUSDPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable tokenCOL;
    address public immutable tokenBUSD;
    ReceiptToken public immutable pcolToken;
    ReceiptToken public immutable pbusdToken;
    GovernanceToken public governanceToken;

    mapping(address => uint256) public lockedPCOL;
    mapping(address => uint256) public lockedPBUSD;
    mapping(address => uint256) public scaledDebtBUSD;
    mapping(address => uint256) public scaledDebtCOL;

    uint256 public borrowIndexBUSD = 1e18;
    uint256 public borrowIndexCOL = 1e18;
    uint256 public lastBlockBUSD;
    uint256 public lastBlockCOL;
    uint256 public totalScaledDebtBUSD;
    uint256 public totalScaledDebtCOL;

    uint256 public baseRatePerBlockBUSD = 1e15;
    uint256 public multiplierPerBlockBUSD = 5e16;
    uint256 public reserveFactorBpsBUSD = 1000;
    uint256 public baseRatePerBlockCOL = 1e15;
    uint256 public multiplierPerBlockCOL = 5e16;
    uint256 public reserveFactorBpsCOL = 1000;
    uint256 public liquidationThreshold = 8000;
    uint256 public liquidationBonus = 1000;
    uint256 public flashLoanFeeBps = 9;
    uint256 public rewardPerDeposit = 1e18;
    uint256 public rewardPerBorrow = 1e17;

    uint256 private constant BPS = 10000;
    uint256 private constant PRICE_DECIMALS = 8;
    bool private _flashLoanLock;

    event DepositCOL(address indexed user, uint256 amount, uint256 pcolMinted);
    event DepositBUSD(address indexed user, uint256 amount, uint256 pbusdMinted);
    event WithdrawCOL(address indexed user, uint256 amount, uint256 pcolBurned);
    event WithdrawBUSD(address indexed user, uint256 amount, uint256 pbusdBurned);
    event DepositCollateralPCOL(address indexed user, uint256 amount);
    event WithdrawCollateralPCOL(address indexed user, uint256 amount);
    event DepositCollateralPBUSD(address indexed user, uint256 amount);
    event WithdrawCollateralPBUSD(address indexed user, uint256 amount);
    event BorrowBUSD(address indexed user, uint256 amount);
    event RepayBUSD(address indexed user, uint256 amount);
    event BorrowCOL(address indexed user, uint256 amount);
    event RepayCOL(address indexed user, uint256 amount);
    event LiquidateBUSD(address indexed liquidator, address indexed user, uint256 debtRepaid, uint256 pcolReceived);
    event LiquidateCOL(address indexed liquidator, address indexed user, uint256 debtRepaid, uint256 pbusdReceived);
    event FlashLoan(address indexed receiver, address indexed asset, uint256 amount, uint256 fee);

    constructor(address _tokenCOL, address _tokenBUSD, address _governanceToken) {
        require(_tokenCOL != address(0) && _tokenBUSD != address(0) && _governanceToken != address(0), "PCOLBUSDPool: zero");
        require(_tokenCOL != _tokenBUSD, "PCOLBUSDPool: same token");
        tokenCOL = _tokenCOL;
        tokenBUSD = _tokenBUSD;
        pcolToken = new ReceiptToken("Pool COL", "PCOL", address(this));
        pbusdToken = new ReceiptToken("Pool BUSD", "PBUSD", address(this));
        governanceToken = GovernanceToken(payable(_governanceToken));
        lastBlockBUSD = block.number;
        lastBlockCOL = block.number;
    }

    function _getReserves() internal view returns (uint256 rCOL, uint256 rBUSD) {
        rCOL = IERC20(tokenCOL).balanceOf(address(this));
        rBUSD = IERC20(tokenBUSD).balanceOf(address(this));
    }

    function _priceCOLIn8() internal view returns (uint256) {
        (uint256 rCOL, uint256 rBUSD) = _getReserves();
        if (rCOL == 0) return 0;
        uint8 dCOL = IERC20Metadata(tokenCOL).decimals();
        uint8 dBUSD = IERC20Metadata(tokenBUSD).decimals();
        return (rBUSD * 10 ** (PRICE_DECIMALS + dCOL)) / (rCOL * 10 ** dBUSD);
    }

    function _priceBUSDIn8() internal pure returns (uint256) {
        return 1e8;
    }

    function _getRatePerBlockBUSDWithIndex(uint256 idx) internal view returns (uint256) {
        uint256 poolBUSD = IERC20(tokenBUSD).balanceOf(address(this));
        uint256 totalDebt = (totalScaledDebtBUSD * idx) / 1e18;
        uint256 denom = poolBUSD + totalDebt;
        uint256 u = denom == 0 ? 0 : (totalDebt * 1e18) / denom;
        return baseRatePerBlockBUSD + (multiplierPerBlockBUSD * u) / 1e18;
    }

    function _getRatePerBlockCOLWithIndex(uint256 idx) internal view returns (uint256) {
        uint256 poolCOL = IERC20(tokenCOL).balanceOf(address(this));
        uint256 totalDebt = (totalScaledDebtCOL * idx) / 1e18;
        uint256 denom = poolCOL + totalDebt;
        uint256 u = denom == 0 ? 0 : (totalDebt * 1e18) / denom;
        return baseRatePerBlockCOL + (multiplierPerBlockCOL * u) / 1e18;
    }

    function _accrueBUSD() internal {
        if (block.number <= lastBlockBUSD) return;
        uint256 n = block.number - lastBlockBUSD;
        uint256 rate = _getRatePerBlockBUSDWithIndex(borrowIndexBUSD);
        uint256 factor = 1e18 + rate;
        uint256 growth = 1e18;
        uint256 exp = n;
        uint256 base = factor;
        while (exp > 0) {
            if (exp % 2 == 1) growth = (growth * base) / 1e18;
            base = (base * base) / 1e18;
            exp = exp / 2;
        }
        borrowIndexBUSD = (borrowIndexBUSD * growth) / 1e18;
        lastBlockBUSD = block.number;
    }

    function _accrueCOL() internal {
        if (block.number <= lastBlockCOL) return;
        uint256 n = block.number - lastBlockCOL;
        uint256 rate = _getRatePerBlockCOLWithIndex(borrowIndexCOL);
        uint256 factor = 1e18 + rate;
        uint256 growth = 1e18;
        uint256 exp = n;
        uint256 base = factor;
        while (exp > 0) {
            if (exp % 2 == 1) growth = (growth * base) / 1e18;
            base = (base * base) / 1e18;
            exp = exp / 2;
        }
        borrowIndexCOL = (borrowIndexCOL * growth) / 1e18;
        lastBlockCOL = block.number;
    }

    function getBorrowIndexBUSDView() public view returns (uint256) {
        if (block.number <= lastBlockBUSD) return borrowIndexBUSD;
        uint256 n = block.number - lastBlockBUSD;
        uint256 rate = _getRatePerBlockBUSDWithIndex(borrowIndexBUSD);
        uint256 factor = 1e18 + rate;
        uint256 growth = 1e18;
        uint256 exp = n;
        uint256 base = factor;
        while (exp > 0) {
            if (exp % 2 == 1) growth = (growth * base) / 1e18;
            base = (base * base) / 1e18;
            exp = exp / 2;
        }
        return (borrowIndexBUSD * growth) / 1e18;
    }

    function getBorrowIndexCOLView() public view returns (uint256) {
        if (block.number <= lastBlockCOL) return borrowIndexCOL;
        uint256 n = block.number - lastBlockCOL;
        uint256 rate = _getRatePerBlockCOLWithIndex(borrowIndexCOL);
        uint256 factor = 1e18 + rate;
        uint256 growth = 1e18;
        uint256 exp = n;
        uint256 base = factor;
        while (exp > 0) {
            if (exp % 2 == 1) growth = (growth * base) / 1e18;
            base = (base * base) / 1e18;
            exp = exp / 2;
        }
        return (borrowIndexCOL * growth) / 1e18;
    }

    function getCurrentDebtBUSD(address user) public view returns (uint256) {
        return (scaledDebtBUSD[user] * getBorrowIndexBUSDView()) / 1e18;
    }

    function getCurrentDebtCOL(address user) public view returns (uint256) {
        return (scaledDebtCOL[user] * getBorrowIndexCOLView()) / 1e18;
    }

    function getUtilizationBUSD() public view returns (uint256) {
        uint256 poolBUSD = IERC20(tokenBUSD).balanceOf(address(this));
        uint256 totalDebt = (totalScaledDebtBUSD * getBorrowIndexBUSDView()) / 1e18;
        uint256 denom = poolBUSD + totalDebt;
        return denom == 0 ? 0 : (totalDebt * 1e18) / denom;
    }

    function getUtilizationCOL() public view returns (uint256) {
        uint256 poolCOL = IERC20(tokenCOL).balanceOf(address(this));
        uint256 totalDebt = (totalScaledDebtCOL * getBorrowIndexCOLView()) / 1e18;
        uint256 denom = poolCOL + totalDebt;
        return denom == 0 ? 0 : (totalDebt * 1e18) / denom;
    }

    uint256 private constant BLOCKS_PER_YEAR = 2102400;

    function getBorrowRatePerBlockBUSD() public view returns (uint256) {
        uint256 u = getUtilizationBUSD();
        return baseRatePerBlockBUSD + (multiplierPerBlockBUSD * u) / 1e18;
    }

    function getBorrowRatePerBlockCOL() public view returns (uint256) {
        uint256 u = getUtilizationCOL();
        return baseRatePerBlockCOL + (multiplierPerBlockCOL * u) / 1e18;
    }

    /// @dev APY in 1e18 (e.g. 0.1e18 = 10%). Simple: ratePerBlock * BLOCKS_PER_YEAR.
    function getBorrowAPYBUSD() public view returns (uint256) {
        return getBorrowRatePerBlockBUSD() * BLOCKS_PER_YEAR;
    }

    function getBorrowAPYCOL() public view returns (uint256) {
        return getBorrowRatePerBlockCOL() * BLOCKS_PER_YEAR;
    }

    function getSupplyAPYBUSD() public view returns (uint256) {
        uint256 u = getUtilizationBUSD();
        uint256 borrowAPY = getBorrowAPYBUSD();
        return (borrowAPY * u * (BPS - reserveFactorBpsBUSD)) / (BPS * 1e18);
    }

    function getSupplyAPYCOL() public view returns (uint256) {
        uint256 u = getUtilizationCOL();
        uint256 borrowAPY = getBorrowAPYCOL();
        return (borrowAPY * u * (BPS - reserveFactorBpsCOL)) / (BPS * 1e18);
    }

    function depositCOL(uint256 amount) external nonReentrant {
        require(amount > 0, "PCOLBUSDPool: zero");
        IERC20(tokenCOL).safeTransferFrom(msg.sender, address(this), amount);
        pcolToken.mint(msg.sender, amount);
        if (rewardPerDeposit > 0) governanceToken.mintReward(msg.sender, rewardPerDeposit);
        emit DepositCOL(msg.sender, amount, amount);
    }

    function depositBUSD(uint256 amount) external nonReentrant {
        require(amount > 0, "PCOLBUSDPool: zero");
        IERC20(tokenBUSD).safeTransferFrom(msg.sender, address(this), amount);
        pbusdToken.mint(msg.sender, amount);
        if (rewardPerDeposit > 0) governanceToken.mintReward(msg.sender, rewardPerDeposit);
        emit DepositBUSD(msg.sender, amount, amount);
    }

    function withdrawCOL(uint256 amount) external nonReentrant {
        require(amount > 0, "PCOLBUSDPool: zero");
        require(IERC20(tokenCOL).balanceOf(address(this)) >= amount, "PCOLBUSDPool: insufficient COL");
        pcolToken.burn(msg.sender, amount);
        IERC20(tokenCOL).safeTransfer(msg.sender, amount);
        emit WithdrawCOL(msg.sender, amount, amount);
    }

    function withdrawBUSD(uint256 amount) external nonReentrant {
        require(amount > 0, "PCOLBUSDPool: zero");
        require(IERC20(tokenBUSD).balanceOf(address(this)) >= amount, "PCOLBUSDPool: insufficient BUSD");
        pbusdToken.burn(msg.sender, amount);
        IERC20(tokenBUSD).safeTransfer(msg.sender, amount);
        emit WithdrawBUSD(msg.sender, amount, amount);
    }

    /// @dev 抵押 PCOL = 锁定 P 币（转入合约），不增加池内金额，仅代表 lock 住无法使用。
    function depositCollateralPCOL(uint256 amount) external nonReentrant {
        require(amount > 0, "PCOLBUSDPool: zero");
        IERC20(address(pcolToken)).safeTransferFrom(msg.sender, address(this), amount);
        lockedPCOL[msg.sender] += amount;
        emit DepositCollateralPCOL(msg.sender, amount);
    }

    /// @dev 解除抵押 = 解锁，P 币转回用户。
    function withdrawCollateralPCOL(uint256 amount) external nonReentrant {
        require(amount > 0 && lockedPCOL[msg.sender] >= amount, "PCOLBUSDPool: invalid");
        lockedPCOL[msg.sender] -= amount;
        if (scaledDebtBUSD[msg.sender] > 0) require(getHealthFactorPCOL(msg.sender) >= 1e18, "PCOLBUSDPool: HF");
        IERC20(address(pcolToken)).safeTransfer(msg.sender, amount);
        emit WithdrawCollateralPCOL(msg.sender, amount);
    }

    function _collateralValuePCOLIn8(address user) internal view returns (uint256) {
        uint256 pcol = lockedPCOL[user];
        if (pcol == 0) return 0;
        return pcol * _priceCOLIn8();
    }

    function getHealthFactorPCOL(address user) public view returns (uint256) {
        uint256 d = getCurrentDebtBUSD(user);
        if (d == 0) return type(uint256).max;
        uint256 debtValue8 = d * _priceBUSDIn8();
        uint256 colValue8 = _collateralValuePCOLIn8(user);
        if (debtValue8 == 0) return type(uint256).max;
        return (colValue8 * liquidationThreshold * 1e18) / (debtValue8 * BPS);
    }

    function borrowBUSD(uint256 amount) external nonReentrant {
        _accrueBUSD();
        require(amount > 0, "PCOLBUSDPool: zero");
        require(lockedPCOL[msg.sender] > 0, "PCOLBUSDPool: no PCOL collateral");
        require(IERC20(tokenBUSD).balanceOf(address(this)) >= amount, "PCOLBUSDPool: insufficient BUSD");
        uint256 scaled = (amount * 1e18) / borrowIndexBUSD;
        scaledDebtBUSD[msg.sender] += scaled;
        totalScaledDebtBUSD += scaled;
        require(getHealthFactorPCOL(msg.sender) >= 1e18, "PCOLBUSDPool: HF");
        IERC20(tokenBUSD).safeTransfer(msg.sender, amount);
        if (rewardPerBorrow > 0) governanceToken.mintReward(msg.sender, rewardPerBorrow);
        emit BorrowBUSD(msg.sender, amount);
    }

    function repayBUSD(uint256 amount) external nonReentrant {
        _accrueBUSD();
        require(amount > 0, "PCOLBUSDPool: zero");
        uint256 d = (scaledDebtBUSD[msg.sender] * borrowIndexBUSD) / 1e18;
        uint256 toRepay = amount > d ? d : amount;
        uint256 scaledRepay = (toRepay * 1e18) / borrowIndexBUSD;
        scaledDebtBUSD[msg.sender] -= scaledRepay;
        totalScaledDebtBUSD -= scaledRepay;
        IERC20(tokenBUSD).safeTransferFrom(msg.sender, address(this), toRepay);
        emit RepayBUSD(msg.sender, toRepay);
    }

    /// @dev 清算：清算人还 BUSD，获得该仓位锁定的 PCOL（合约持有的 P 币转给清算人）。
    function liquidateBUSD(address user) external nonReentrant {
        _accrueBUSD();
        require(getHealthFactorPCOL(user) < 1e18, "PCOLBUSDPool: not liquidatable");
        uint256 debtRepay = (scaledDebtBUSD[user] * borrowIndexBUSD) / 1e18;
        require(debtRepay > 0 && lockedPCOL[user] > 0, "PCOLBUSDPool: no pos");
        uint256 scaledRepay = (debtRepay * 1e18) / borrowIndexBUSD;
        scaledDebtBUSD[user] = 0;
        totalScaledDebtBUSD -= scaledRepay;
        uint256 pcolLocked = lockedPCOL[user];
        lockedPCOL[user] = 0;
        uint256 pcolToLiq = (pcolLocked * (BPS + liquidationBonus)) / BPS;
        if (pcolToLiq > pcolLocked) pcolToLiq = pcolLocked;
        uint256 pcolBurn = pcolLocked - pcolToLiq;
        IERC20(tokenBUSD).safeTransferFrom(msg.sender, address(this), debtRepay);
        if (pcolBurn > 0) pcolToken.burn(address(this), pcolBurn);
        IERC20(address(pcolToken)).safeTransfer(msg.sender, pcolToLiq);
        emit LiquidateBUSD(msg.sender, user, debtRepay, pcolToLiq);
    }

    /// @dev 抵押 PBUSD = 锁定 P 币（转入合约），不增加池内金额，仅代表 lock 住无法使用。
    function depositCollateralPBUSD(uint256 amount) external nonReentrant {
        require(amount > 0, "PCOLBUSDPool: zero");
        IERC20(address(pbusdToken)).safeTransferFrom(msg.sender, address(this), amount);
        lockedPBUSD[msg.sender] += amount;
        emit DepositCollateralPBUSD(msg.sender, amount);
    }

    /// @dev 解除抵押 = 解锁，P 币转回用户。
    function withdrawCollateralPBUSD(uint256 amount) external nonReentrant {
        require(amount > 0 && lockedPBUSD[msg.sender] >= amount, "PCOLBUSDPool: invalid");
        lockedPBUSD[msg.sender] -= amount;
        if (scaledDebtCOL[msg.sender] > 0) require(getHealthFactorPBUSD(msg.sender) >= 1e18, "PCOLBUSDPool: HF");
        IERC20(address(pbusdToken)).safeTransfer(msg.sender, amount);
        emit WithdrawCollateralPBUSD(msg.sender, amount);
    }

    function _collateralValuePBUSDIn8(address user) internal view returns (uint256) {
        return lockedPBUSD[user] * _priceBUSDIn8();
    }

    function getHealthFactorPBUSD(address user) public view returns (uint256) {
        uint256 d = getCurrentDebtCOL(user);
        if (d == 0) return type(uint256).max;
        uint256 debtValue8 = d * _priceCOLIn8();
        uint256 colValue8 = _collateralValuePBUSDIn8(user);
        if (debtValue8 == 0) return type(uint256).max;
        return (colValue8 * liquidationThreshold * 1e18) / (debtValue8 * BPS);
    }

    function borrowCOL(uint256 amount) external nonReentrant {
        _accrueCOL();
        require(amount > 0, "PCOLBUSDPool: zero");
        require(lockedPBUSD[msg.sender] > 0, "PCOLBUSDPool: no PBUSD collateral");
        require(IERC20(tokenCOL).balanceOf(address(this)) >= amount, "PCOLBUSDPool: insufficient COL");
        uint256 scaled = (amount * 1e18) / borrowIndexCOL;
        scaledDebtCOL[msg.sender] += scaled;
        totalScaledDebtCOL += scaled;
        require(getHealthFactorPBUSD(msg.sender) >= 1e18, "PCOLBUSDPool: HF");
        IERC20(tokenCOL).safeTransfer(msg.sender, amount);
        if (rewardPerBorrow > 0) governanceToken.mintReward(msg.sender, rewardPerBorrow);
        emit BorrowCOL(msg.sender, amount);
    }

    function repayCOL(uint256 amount) external nonReentrant {
        _accrueCOL();
        require(amount > 0, "PCOLBUSDPool: zero");
        uint256 d = (scaledDebtCOL[msg.sender] * borrowIndexCOL) / 1e18;
        uint256 toRepay = amount > d ? d : amount;
        uint256 scaledRepay = (toRepay * 1e18) / borrowIndexCOL;
        scaledDebtCOL[msg.sender] -= scaledRepay;
        totalScaledDebtCOL -= scaledRepay;
        IERC20(tokenCOL).safeTransferFrom(msg.sender, address(this), toRepay);
        emit RepayCOL(msg.sender, toRepay);
    }

    /// @dev 清算：清算人还 COL，获得该仓位锁定的 PBUSD（合约持有的 P 币转给清算人）。
    function liquidateCOL(address user) external nonReentrant {
        _accrueCOL();
        require(getHealthFactorPBUSD(user) < 1e18, "PCOLBUSDPool: not liquidatable");
        uint256 debtRepay = (scaledDebtCOL[user] * borrowIndexCOL) / 1e18;
        require(debtRepay > 0 && lockedPBUSD[user] > 0, "PCOLBUSDPool: no pos");
        uint256 scaledRepay = (debtRepay * 1e18) / borrowIndexCOL;
        scaledDebtCOL[user] = 0;
        totalScaledDebtCOL -= scaledRepay;
        uint256 pbusdLocked = lockedPBUSD[user];
        lockedPBUSD[user] = 0;
        uint256 pbusdToLiq = (pbusdLocked * (BPS + liquidationBonus)) / BPS;
        if (pbusdToLiq > pbusdLocked) pbusdToLiq = pbusdLocked;
        uint256 pbusdBurn = pbusdLocked - pbusdToLiq;
        IERC20(tokenCOL).safeTransferFrom(msg.sender, address(this), debtRepay);
        if (pbusdBurn > 0) pbusdToken.burn(address(this), pbusdBurn);
        IERC20(address(pbusdToken)).safeTransfer(msg.sender, pbusdToLiq);
        emit LiquidateCOL(msg.sender, user, debtRepay, pbusdToLiq);
    }

    function flashLoan(address receiverAddress, address asset, uint256 amount, bytes calldata params) external nonReentrant {
        require(asset == tokenCOL || asset == tokenBUSD, "PCOLBUSDPool: unsupported");
        require(amount > 0 && !_flashLoanLock, "PCOLBUSDPool: invalid flash");
        uint256 fee = (amount * flashLoanFeeBps) / BPS;
        _flashLoanLock = true;
        uint256 balanceBefore = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransfer(receiverAddress, amount);
        require(IFlashLoanReceiver(receiverAddress).executeOperation(asset, amount, fee, msg.sender, params), "PCOLBUSDPool: flash failed");
        require(IERC20(asset).balanceOf(address(this)) >= balanceBefore + fee, "PCOLBUSDPool: not repaid");
        _flashLoanLock = false;
        emit FlashLoan(receiverAddress, asset, amount, fee);
    }

    function getUserPositionPCOL(address user) external view returns (uint256 collateralPCOL, uint256 debtBUSD_) {
        return (lockedPCOL[user], getCurrentDebtBUSD(user));
    }

    function getUserPositionPBUSD(address user) external view returns (uint256 collateralPBUSD, uint256 debtCOL_) {
        return (lockedPBUSD[user], getCurrentDebtCOL(user));
    }

    function getMaxBorrowBUSD(address user) external view returns (uint256) {
        if (lockedPCOL[user] == 0) return 0;
        uint256 colValue8 = _collateralValuePCOLIn8(user);
        uint256 debtValue8 = getCurrentDebtBUSD(user) * _priceBUSDIn8();
        uint256 maxDebtValue8 = (colValue8 * liquidationThreshold) / BPS;
        if (maxDebtValue8 <= debtValue8) return 0;
        uint256 maxAdditional = (maxDebtValue8 - debtValue8) / _priceBUSDIn8();
        uint256 available = IERC20(tokenBUSD).balanceOf(address(this));
        return maxAdditional > available ? available : maxAdditional;
    }

    function getMaxBorrowCOL(address user) external view returns (uint256) {
        if (lockedPBUSD[user] == 0) return 0;
        uint256 colValue8 = _collateralValuePBUSDIn8(user);
        uint256 debtValue8 = getCurrentDebtCOL(user) * _priceCOLIn8();
        uint256 maxDebtValue8 = (colValue8 * liquidationThreshold) / BPS;
        if (maxDebtValue8 <= debtValue8) return 0;
        uint256 maxAdditional = (maxDebtValue8 - debtValue8) / _priceCOLIn8();
        uint256 available = IERC20(tokenCOL).balanceOf(address(this));
        return maxAdditional > available ? available : maxAdditional;
    }

    function isLiquidatablePCOL(address user) external view returns (bool) {
        return getHealthFactorPCOL(user) < 1e18;
    }

    function isLiquidatablePBUSD(address user) external view returns (bool) {
        return getHealthFactorPBUSD(user) < 1e18;
    }

    function getFlashLoanFee(uint256 amount) external view returns (uint256) {
        return (amount * flashLoanFeeBps) / BPS;
    }

    /// @dev COL price in 8 decimals (USD, from pool ratio). For frontend display.
    function getPriceCOLIn8() external view returns (uint256) {
        return _priceCOLIn8();
    }

    /// @dev BUSD = 1e8 (1 USD).
    function getPriceBUSDIn8() external pure returns (uint256) {
        return _priceBUSDIn8();
    }
}
