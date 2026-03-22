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

    /// @dev 拐点利率模型 (Kinked): u <= U_opt 时 rate = base + slope1*u；u > U_opt 时 rate = rateAtOpt + slope2*(u - U_opt)
    ///      BUSD 稳定币：U_opt 约 85%；COL 波动资产：U_opt 约 55%
    uint256 public baseRatePerBlockBUSD = 1e10;
    uint256 public slope1PerBlockBUSD = 1e11;
    uint256 public slope2PerBlockBUSD = 2e12;
    uint256 public optimalUtilizationBUSD = 85e16; // 85%, 1e18
    uint256 public baseRatePerBlockCOL = 1e10;
    uint256 public slope1PerBlockCOL = 2e11;
    uint256 public slope2PerBlockCOL = 3e12;
    uint256 public optimalUtilizationCOL = 55e16; // 55%, 1e18
    uint256 public reserveFactorBpsBUSD = 1000;
    uint256 public reserveFactorBpsCOL = 1000;
    /// @dev 清算阈值 bps：PCOL 抵押借 BUSD 用较低阈值(65%)，PBUSD 抵押借 COL 用较高(85%)
    uint256 public liquidationThresholdPCOL = 6500;
    uint256 public liquidationThresholdPBUSD = 8500;
    uint256 public liquidationBonus = 1000;
    uint256 public flashLoanFeeBps = 9;
    /// @dev 存款管理费：池为空时用此固定费率（bps）
    uint256 public depositFeeBps = 5;
    /// @dev 次线性收费倍数（影响^0.25）：impact 1% 时约收 0.005%，impactFeeMultiplierBps=2。fee = amount * impact^0.25 * impactFeeMultiplierBps / BPS
    uint256 public impactFeeMultiplierBps = 2;
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
    event InjectCOL(address indexed from_, uint256 amount);
    event InjectBUSD(address indexed from_, uint256 amount);

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

    /// @dev 池内 1 COL 的 USD 价格，8 位小数（与 BUSD 1:1 一致）
    function _priceCOLIn8() internal view returns (uint256) {
        (uint256 rCOL, uint256 rBUSD) = _getReserves();
        if (rCOL == 0) return 0;
        uint8 dCOL = IERC20Metadata(tokenCOL).decimals();
        uint8 dBUSD = IERC20Metadata(tokenBUSD).decimals();
        return (rBUSD * 10 ** (PRICE_DECIMALS + dCOL)) / (rCOL * 10 ** dBUSD);
    }

    /// @dev BUSD 固定 1 USD，8 位小数
    function _priceBUSDIn8() internal pure returns (uint256) {
        return 1e8;
    }

    /// @dev 拐点模型：u <= U_opt 时 rate = base + slope1*u；u > U_opt 时 rate = rateAtOpt + slope2*(u - U_opt)
    function _getRatePerBlockBUSDWithIndex(uint256 idx) internal view returns (uint256) {
        uint256 poolBUSD = IERC20(tokenBUSD).balanceOf(address(this));
        uint256 totalDebt = (totalScaledDebtBUSD * idx) / 1e18;
        uint256 denom = poolBUSD + totalDebt;
        uint256 u = denom == 0 ? 0 : (totalDebt * 1e18) / denom;
        uint256 U_opt = optimalUtilizationBUSD;
        if (u <= U_opt) {
            return baseRatePerBlockBUSD + (slope1PerBlockBUSD * u) / 1e18;
        }
        uint256 rateAtOpt = baseRatePerBlockBUSD + (slope1PerBlockBUSD * U_opt) / 1e18;
        return rateAtOpt + (slope2PerBlockBUSD * (u - U_opt)) / 1e18;
    }

    function _getRatePerBlockCOLWithIndex(uint256 idx) internal view returns (uint256) {
        uint256 poolCOL = IERC20(tokenCOL).balanceOf(address(this));
        uint256 totalDebt = (totalScaledDebtCOL * idx) / 1e18;
        uint256 denom = poolCOL + totalDebt;
        uint256 u = denom == 0 ? 0 : (totalDebt * 1e18) / denom;
        uint256 U_opt = optimalUtilizationCOL;
        if (u <= U_opt) {
            return baseRatePerBlockCOL + (slope1PerBlockCOL * u) / 1e18;
        }
        uint256 rateAtOpt = baseRatePerBlockCOL + (slope1PerBlockCOL * U_opt) / 1e18;
        return rateAtOpt + (slope2PerBlockCOL * (u - U_opt)) / 1e18;
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
        uint256 U_opt = optimalUtilizationBUSD;
        if (u <= U_opt) {
            return baseRatePerBlockBUSD + (slope1PerBlockBUSD * u) / 1e18;
        }
        uint256 rateAtOpt = baseRatePerBlockBUSD + (slope1PerBlockBUSD * U_opt) / 1e18;
        return rateAtOpt + (slope2PerBlockBUSD * (u - U_opt)) / 1e18;
    }

    function getBorrowRatePerBlockCOL() public view returns (uint256) {
        uint256 u = getUtilizationCOL();
        uint256 U_opt = optimalUtilizationCOL;
        if (u <= U_opt) {
            return baseRatePerBlockCOL + (slope1PerBlockCOL * u) / 1e18;
        }
        uint256 rateAtOpt = baseRatePerBlockCOL + (slope1PerBlockCOL * U_opt) / 1e18;
        return rateAtOpt + (slope2PerBlockCOL * (u - U_opt)) / 1e18;
    }

    /// @dev APY 单利年化，合约返回值满足 (apyWei/1e18)*100 = 显示的百分比。例如 0.1e18 → 10%。
    ///      ratePerBlock 为每 block 利率(1e18)，一年 BLOCKS_PER_YEAR 块，故 APY = ratePerBlock * BLOCKS_PER_YEAR。
    function getBorrowAPYBUSD() public view returns (uint256) {
        return getBorrowRatePerBlockBUSD() * BLOCKS_PER_YEAR;
    }

    function getBorrowAPYCOL() public view returns (uint256) {
        return getBorrowRatePerBlockCOL() * BLOCKS_PER_YEAR;
    }

    /// @dev Supply APY = borrow APY * utilization * (1 - reserveFactor). In 1e18.
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

    /// @dev 存入 COL 对价格的影响：池 COL 增加，COL 价格下降。impact = amount/(poolCOL+amount)。按影响收费：影响 1% 收存入量 0.05%（20 倍），费留池内。
    function depositCOL(uint256 amount) external nonReentrant {
        require(amount > 0, "PCOLBUSDPool: zero");
        IERC20(tokenCOL).safeTransferFrom(msg.sender, address(this), amount);
        uint256 poolCOLNow = IERC20(tokenCOL).balanceOf(address(this));
        uint256 fee = _depositFeeByImpact(amount, poolCOLNow);
        uint256 toMint = amount - fee;
        pcolToken.mint(msg.sender, toMint);
        if (rewardPerDeposit > 0) governanceToken.mintReward(msg.sender, rewardPerDeposit);
        emit DepositCOL(msg.sender, amount, toMint);
    }

    /// @dev 存入 BUSD 对价格的影响：池 BUSD 增加，COL 价格上升（以 BUSD 计即 BUSD 相对贬值）。impact = amount/(poolBUSD+amount)。按影响收费，费留池内。
    function depositBUSD(uint256 amount) external nonReentrant {
        require(amount > 0, "PCOLBUSDPool: zero");
        IERC20(tokenBUSD).safeTransferFrom(msg.sender, address(this), amount);
        uint256 poolBUSDNow = IERC20(tokenBUSD).balanceOf(address(this));
        uint256 fee = _depositFeeByImpact(amount, poolBUSDNow);
        uint256 toMint = amount - fee;
        pbusdToken.mint(msg.sender, toMint);
        if (rewardPerDeposit > 0) governanceToken.mintReward(msg.sender, rewardPerDeposit);
        emit DepositBUSD(msg.sender, amount, toMint);
    }

    /// @dev 次线性：impact = amount/(poolReserve+amount)，fee = amount * impact^0.25 * impactFeeMultiplierBps / BPS。池为空时用固定 depositFeeBps。
    function _depositFeeByImpact(uint256 amount, uint256 poolReserveAfterDeposit) internal view returns (uint256 fee) {
        uint256 poolBefore = poolReserveAfterDeposit - amount;
        if (poolBefore == 0) return (amount * depositFeeBps) / BPS;
        uint256 sum = poolReserveAfterDeposit;
        uint256 impact18 = (amount * 1e18) / sum;
        uint256 impact025 = _impactPow025(impact18);
        fee = (amount * impact025 * impactFeeMultiplierBps) / (1e18 * BPS);
        if (fee > amount) fee = amount;
    }

    /// @dev impact^0.25 in 1e18 scale. impact18 in 1e18 (0..1e18). s2 = sqrt(sqrt(impact18)*1e9) = impact^0.25 * 1e9, so impact025_18 = s2 * 1e9.
    function _impactPow025(uint256 impact18) internal pure returns (uint256) {
        if (impact18 == 0) return 0;
        uint256 s1 = _sqrt(impact18);
        uint256 s2 = _sqrt(s1 * 1e9);
        return s2 * 1e9;
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
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
        return (colValue8 * liquidationThresholdPCOL * 1e18) / (debtValue8 * BPS);
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
        // 借出的 BUSD 转给用户，离开池子
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
        return (colValue8 * liquidationThresholdPBUSD * 1e18) / (debtValue8 * BPS);
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
        // 借出的 COL 转给用户，离开池子
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

    /// @dev 测试用：向池内注入 COL，不铸造 PCOL，用于调节池储备从而改变 COL 价格（测试清算等）
    function injectCOL(uint256 amount) external nonReentrant {
        if (amount == 0) return;
        IERC20(tokenCOL).safeTransferFrom(msg.sender, address(this), amount);
        emit InjectCOL(msg.sender, amount);
    }

    /// @dev 测试用：向池内注入 BUSD，不铸造 PBUSD，用于调节池储备从而改变 COL 价格（测试清算等）
    function injectBUSD(uint256 amount) external nonReentrant {
        if (amount == 0) return;
        IERC20(tokenBUSD).safeTransferFrom(msg.sender, address(this), amount);
        emit InjectBUSD(msg.sender, amount);
    }

    function getUserPositionPCOL(address user) external view returns (uint256 collateralPCOL, uint256 debtBUSD_) {
        return (lockedPCOL[user], getCurrentDebtBUSD(user));
    }

    function getUserPositionPBUSD(address user) external view returns (uint256 collateralPBUSD, uint256 debtCOL_) {
        return (lockedPBUSD[user], getCurrentDebtCOL(user));
    }

    /// @dev 假设池子 BUSD=rBUSD、COL=rCOL 时，1 COL 价格（8 位小数），与 _priceCOLIn8 同一套整数舍入
    function _priceCOLIn8Hypothetical(uint256 rBUSD, uint256 rCOL) internal view returns (uint256) {
        if (rCOL == 0) return 0;
        uint8 dCOL = IERC20Metadata(tokenCOL).decimals();
        uint8 dBUSD = IERC20Metadata(tokenBUSD).decimals();
        return (rBUSD * 10 ** (PRICE_DECIMALS + dCOL)) / (rCOL * 10 ** dBUSD);
    }

    /// @dev 假设用户再借 addBorrowBUSD 后，用与 getHealthFactorPCOL 相同的整数运算得到的 HF（1e18）
    function _getHealthFactorPCOLAfterBorrowBUSD(address user, uint256 addBorrowBUSD) internal view returns (uint256) {
        uint256 L = lockedPCOL[user];
        if (L == 0) return 0;
        uint256 P = IERC20(tokenBUSD).balanceOf(address(this));
        uint256 Q = IERC20(tokenCOL).balanceOf(address(this));
        if (Q == 0 || addBorrowBUSD > P) return 0;
        uint256 debtAfter = getCurrentDebtBUSD(user) + addBorrowBUSD;
        if (debtAfter == 0) return type(uint256).max;
        uint256 poolBUSDAfter = P - addBorrowBUSD;
        uint256 colValue8 = L * _priceCOLIn8Hypothetical(poolBUSDAfter, Q);
        uint256 debtValue8 = debtAfter * _priceBUSDIn8();
        if (debtValue8 == 0) return type(uint256).max;
        return (colValue8 * liquidationThresholdPCOL * 1e18) / (debtValue8 * BPS);
    }

    /// @dev 假设用户再借 addBorrowCOL 后，用与 getHealthFactorPBUSD 相同的整数运算得到的 HF（1e18）
    function _getHealthFactorPBUSDAfterBorrowCOL(address user, uint256 addBorrowCOL) internal view returns (uint256) {
        uint256 L = lockedPBUSD[user];
        if (L == 0) return 0;
        uint256 P = IERC20(tokenBUSD).balanceOf(address(this));
        uint256 Q = IERC20(tokenCOL).balanceOf(address(this));
        if (P == 0 || addBorrowCOL > Q) return 0;
        uint256 debtAfter = getCurrentDebtCOL(user) + addBorrowCOL;
        if (debtAfter == 0) return type(uint256).max;
        uint256 poolCOLAfter = Q - addBorrowCOL;
        uint256 priceCOLAfter = _priceCOLIn8Hypothetical(P, poolCOLAfter);
        uint256 colValue8 = L * _priceBUSDIn8();
        uint256 debtValue8 = debtAfter * priceCOLAfter;
        if (debtValue8 == 0) return type(uint256).max;
        return (colValue8 * liquidationThresholdPBUSD * 1e18) / (debtValue8 * BPS);
    }

    /// @dev 考虑借款后池子变化与整数舍入：二分查找满足借后 HF >= 1e18 的最大可借 BUSD。
    function getMaxBorrowBUSD(address user) external view returns (uint256) {
        uint256 L = lockedPCOL[user];
        if (L == 0) return 0;
        uint256 P = IERC20(tokenBUSD).balanceOf(address(this));
        uint256 Q = IERC20(tokenCOL).balanceOf(address(this));
        if (Q == 0) return 0;
        uint256 D = getCurrentDebtBUSD(user);
        uint256 T = liquidationThresholdPCOL;
        uint256 num = L * P * T;
        uint256 denomCol = D * Q * BPS;
        if (num <= denomCol) return 0;
        uint256 xUpper = (num - denomCol) / (L * T + Q * BPS);
        if (xUpper > P) xUpper = P;
        if (xUpper == 0) return 0;
        uint256 low = 0;
        uint256 high = xUpper;
        while (low < high) {
            uint256 mid = (low + high + 1) / 2;
            if (_getHealthFactorPCOLAfterBorrowBUSD(user, mid) >= 1e18) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        return low;
    }

    /// @dev 考虑借款后池子变化与整数舍入：二分查找满足借后 HF >= 1e18 的最大可借 COL。
    function getMaxBorrowCOL(address user) external view returns (uint256) {
        uint256 L = lockedPBUSD[user];
        if (L == 0) return 0;
        uint256 P = IERC20(tokenBUSD).balanceOf(address(this));
        uint256 Q = IERC20(tokenCOL).balanceOf(address(this));
        if (P == 0) return 0;
        uint256 D = getCurrentDebtCOL(user);
        uint256 T = liquidationThresholdPBUSD;
        uint256 num = L * T * Q;
        uint256 denomCol = D * P * BPS;
        if (num <= denomCol) return 0;
        uint256 xUpper = (num - denomCol) / (L * T + P * BPS);
        if (xUpper > Q) xUpper = Q;
        if (xUpper == 0) return 0;
        uint256 low = 0;
        uint256 high = xUpper;
        while (low < high) {
            uint256 mid = (low + high + 1) / 2;
            if (_getHealthFactorPBUSDAfterBorrowCOL(user, mid) >= 1e18) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        return low;
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

    /// @dev 存入 amount COL 时预计收取的管理费（按价格影响，影响 1% 收 0.05%）
    function getDepositFeeCOL(uint256 amount) external view returns (uint256) {
        uint256 poolAfter = IERC20(tokenCOL).balanceOf(address(this)) + amount;
        return _depositFeeByImpact(amount, poolAfter);
    }

    /// @dev 存入 amount BUSD 时预计收取的管理费
    function getDepositFeeBUSD(uint256 amount) external view returns (uint256) {
        uint256 poolAfter = IERC20(tokenBUSD).balanceOf(address(this)) + amount;
        return _depositFeeByImpact(amount, poolAfter);
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
