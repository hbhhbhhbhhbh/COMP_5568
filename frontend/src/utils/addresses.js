/**
 * Contract addresses from env (PCOLBUSDPool: 单一池 COL+BUSD，PCOL/PBUSD 凭证).
 */
const chainId = import.meta.env.VITE_CHAIN_ID || '31337';

export const addresses = {
  chainId,
  lendingPool: import.meta.env.VITE_LENDING_POOL || '',
  governanceToken: import.meta.env.VITE_GOVERNANCE_TOKEN || '',
  collateralAsset: import.meta.env.VITE_COLLATERAL_ASSET || '', // COL
  borrowAsset: import.meta.env.VITE_BORROW_ASSET || '',           // BUSD
  pcolToken: import.meta.env.VITE_PCOL_TOKEN || '',
  pbusdToken: import.meta.env.VITE_PBUSD_TOKEN || '',
  flashLoanReceiver: import.meta.env.VITE_FLASH_LOAN_RECEIVER || '',
};
