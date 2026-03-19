/**
 * Contract addresses. Update after deployment (Remix or Hardhat).
 * Use env or default to local / Sepolia.
 */
const chainId = parseInt(import.meta.env.VITE_CHAIN_ID || '31337', 10);

// Defaults for Hardhat local (deploy script will output these)
const LOCAL = {
  lendingPool: import.meta.env.VITE_LENDING_POOL || '',
  priceOracle: import.meta.env.VITE_PRICE_ORACLE || '',
  governanceToken: import.meta.env.VITE_GOVERNANCE_TOKEN || '',
  collateralAsset: import.meta.env.VITE_COLLATERAL_ASSET || '',
  borrowAsset: import.meta.env.VITE_BORROW_ASSET || '',
  flashLoanReceiver: import.meta.env.VITE_FLASH_LOAN_RECEIVER || '',
};

const SEPOLIA = {
  lendingPool: import.meta.env.VITE_LENDING_POOL || '',
  priceOracle: import.meta.env.VITE_PRICE_ORACLE || '',
  governanceToken: import.meta.env.VITE_GOVERNANCE_TOKEN || '',
  collateralAsset: import.meta.env.VITE_COLLATERAL_ASSET || '',
  borrowAsset: import.meta.env.VITE_BORROW_ASSET || '',
  flashLoanReceiver: import.meta.env.VITE_FLASH_LOAN_RECEIVER || '',
};

export const addresses = chainId === 11155111 ? SEPOLIA : LOCAL;
export const isLocal = chainId === 31337;
