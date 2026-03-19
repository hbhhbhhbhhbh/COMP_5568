/**
 * Minimal ABIs for frontend. Replace with full ABIs from artifacts after compile if needed.
 */

export const LENDING_POOL_ABI = [
  'function deposit(address asset, uint256 amount)',
  'function withdraw(address asset, uint256 amount)',
  'function borrow(address asset, uint256 amount)',
  'function repay(address asset, uint256 amount)',
  'function liquidate(address collateralAsset, address debtAsset, address user)',
  'function flashLoan(address receiverAddress, address asset, uint256 amount, bytes calldata params)',
  'function getUserPosition(address user) view returns (uint256 collateral, uint256 debt)',
  'function getHealthFactor(address user) view returns (uint256)',
  'function getUtilizationRate() view returns (uint256)',
  'function getFlashLoanFee(uint256 amount) view returns (uint256)',
  'function isLiquidatable(address user) view returns (bool)',
  'function collateralAsset() view returns (address)',
  'function borrowAsset() view returns (address)',
  'function totalCollateral() view returns (uint256)',
  'function totalBorrowed() view returns (uint256)',
  'event Deposit(address indexed user, address indexed asset, uint256 amount)',
  'event Withdraw(address indexed user, address indexed asset, uint256 amount)',
  'event Borrow(address indexed user, address indexed asset, uint256 amount)',
  'event Repay(address indexed user, address indexed asset, uint256 amount)',
  'event Liquidate(address indexed liquidator, address indexed user, address collateralAsset, address debtAsset, uint256 debtRepaid, uint256 collateralReceived)',
  'event FlashLoan(address indexed receiver, address indexed asset, uint256 amount, uint256 fee)',
];

export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
];

export const PRICE_ORACLE_ABI = [
  'function getPrice(address asset) view returns (uint256)',
  'function setPriceFeed(address asset, address feed)',
  'function setFallbackPrice(address asset, uint256 price)',
];

export const GOVERNANCE_TOKEN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function rewardRatePerSecond() view returns (uint256)',
];
