import { ethers } from 'ethers';
import { addresses } from './addresses';
import { POOL_ABI, ERC20_ABI, FLASH_RECEIVER_ABI } from './abis';

export { addresses };

let provider = null;
let signer = null;

export function getProvider() {
  if (provider) return provider;
  if (typeof window !== 'undefined' && window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    return provider;
  }
  return null;
}

export async function connectWallet() {
  const p = getProvider();
  if (!p) throw new Error('MetaMask not found');
  await p.send('eth_requestAccounts', []);
  signer = await p.getSigner();
  return signer;
}

export async function getChainId() {
  const p = getProvider();
  if (!p) return null;
  const n = await p.getNetwork();
  return Number(n?.chainId ?? 0);
}

export async function syncSigner() {
  const p = getProvider();
  if (!p) return null;
  try {
    const accounts = await p.listAccounts();
    if (accounts?.length) signer = await p.getSigner();
    else signer = null;
    return signer;
  } catch {
    signer = null;
    return null;
  }
}

export function getPoolContract() {
  if (!addresses.lendingPool || !signer) return null;
  return new ethers.Contract(addresses.lendingPool, POOL_ABI, signer);
}

export function getPoolContractReadOnly() {
  if (!addresses.lendingPool) return null;
  const p = getProvider();
  if (!p) return null;
  return new ethers.Contract(addresses.lendingPool, POOL_ABI, p);
}

export async function getTokenBalance(tokenAddress, account) {
  if (!tokenAddress || !account) return 0n;
  const p = getProvider();
  if (!p) return 0n;
  const c = new ethers.Contract(tokenAddress, ERC20_ABI, p);
  try {
    return await c.balanceOf(account);
  } catch {
    return 0n;
  }
}

export async function getTokenInfo(tokenAddress) {
  if (!tokenAddress) return { decimals: 18, symbol: '—' };
  const p = getProvider();
  if (!p) return { decimals: 18, symbol: '—' };
  const c = new ethers.Contract(tokenAddress, ERC20_ABI, p);
  try {
    const [decimals, symbol] = await Promise.all([c.decimals(), c.symbol()]);
    return { decimals: Number(decimals), symbol: symbol || '—' };
  } catch {
    return { decimals: 18, symbol: '—' };
  }
}

export async function getTokenAllowance(tokenAddress, owner, spender) {
  if (!tokenAddress || !owner || !spender) return 0n;
  const p = getProvider();
  if (!p) return 0n;
  const c = new ethers.Contract(tokenAddress, ERC20_ABI, p);
  try {
    return await c.allowance(owner, spender);
  } catch {
    return 0n;
  }
}

export async function approveToken(tokenAddress, spender, amount) {
  const contract = getPoolContract();
  if (!contract) throw new Error('Wallet not connected');
  const c = new ethers.Contract(tokenAddress, ERC20_ABI, contract.runner);
  const tx = await c.approve(spender, amount);
  return tx.wait();
}

// ——— Deposit (存入得 PCOL / PBUSD)
export async function depositCOL(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.depositCOL(amountWei);
  return tx.wait();
}

export async function depositBUSD(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.depositBUSD(amountWei);
  return tx.wait();
}

/** 预计存入 amount COL 时收取的管理费（按价格影响：影响 1% 收 0.05%） */
export async function getDepositFeeCOL(amountWei) {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try { return await c.getDepositFeeCOL(amountWei); } catch { return 0n; }
}

/** 预计存入 amount BUSD 时收取的管理费 */
export async function getDepositFeeBUSD(amountWei) {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try { return await c.getDepositFeeBUSD(amountWei); } catch { return 0n; }
}

// ——— Withdraw (用 P 币 1:1 取回)
export async function withdrawCOL(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.withdrawCOL(amountWei);
  return tx.wait();
}

export async function withdrawBUSD(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.withdrawBUSD(amountWei);
  return tx.wait();
}

// ——— 测试用：向池内注入代币（不铸造 P 币），用于调节储备/价格以测试清算
export async function injectCOL(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.injectCOL(amountWei);
  return tx.wait();
}

export async function injectBUSD(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.injectBUSD(amountWei);
  return tx.wait();
}

/** 测试用：直接向目标地址铸造代币（MockERC20.mint），不消耗用户余额。仅测试网/本地可用。 */
export async function mintTokenTo(tokenAddress, toAddress, amountWei) {
  const pool = getPoolContract();
  if (!pool?.runner) throw new Error('Wallet not connected');
  const { MOCK_ERC20_MINT_ABI } = await import('./abis');
  const c = new ethers.Contract(tokenAddress, MOCK_ERC20_MINT_ABI, pool.runner);
  const tx = await c.mint(toAddress, amountWei);
  return tx.wait();
}

// ——— Collateral & Borrow
export async function depositCollateralPCOL(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.depositCollateralPCOL(amountWei);
  return tx.wait();
}

export async function withdrawCollateralPCOL(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.withdrawCollateralPCOL(amountWei);
  return tx.wait();
}

export async function depositCollateralPBUSD(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.depositCollateralPBUSD(amountWei);
  return tx.wait();
}

export async function withdrawCollateralPBUSD(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.withdrawCollateralPBUSD(amountWei);
  return tx.wait();
}

export async function borrowBUSD(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.borrowBUSD(amountWei);
  return tx.wait();
}

export async function repayBUSD(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.repayBUSD(amountWei);
  return tx.wait();
}

export async function borrowCOL(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.borrowCOL(amountWei);
  return tx.wait();
}

export async function repayCOL(amountWei) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.repayCOL(amountWei);
  return tx.wait();
}

// ——— Liquidate
export async function liquidateBUSD(userAddress) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.liquidateBUSD(userAddress);
  return tx.wait();
}

export async function liquidateCOL(userAddress) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.liquidateCOL(userAddress);
  return tx.wait();
}

// ——— View (read-only)
export async function getUserPositionPCOL(user) {
  const c = getPoolContractReadOnly();
  if (!c || !user) return { collateralPCOL: 0n, debtBUSD: 0n };
  try {
    const [collateralPCOL, debtBUSD_] = await c.getUserPositionPCOL(user);
    return { collateralPCOL, debtBUSD: debtBUSD_ };
  } catch {
    return { collateralPCOL: 0n, debtBUSD: 0n };
  }
}

export async function getUserPositionPBUSD(user) {
  const c = getPoolContractReadOnly();
  if (!c || !user) return { collateralPBUSD: 0n, debtCOL: 0n };
  try {
    const [collateralPBUSD, debtCOL_] = await c.getUserPositionPBUSD(user);
    return { collateralPBUSD, debtCOL: debtCOL_ };
  } catch {
    return { collateralPBUSD: 0n, debtCOL: 0n };
  }
}

export async function getMaxBorrowBUSD(user) {
  const c = getPoolContractReadOnly();
  if (!c || !user) return 0n;
  try {
    return await c.getMaxBorrowBUSD(user);
  } catch {
    return 0n;
  }
}

export async function getMaxBorrowCOL(user) {
  const c = getPoolContractReadOnly();
  if (!c || !user) return 0n;
  try {
    return await c.getMaxBorrowCOL(user);
  } catch {
    return 0n;
  }
}

export async function getFlashLoanFee(amountWei) {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try {
    return await c.getFlashLoanFee(amountWei);
  } catch {
    return 0n;
  }
}

export async function getHealthFactorPCOL(user) {
  const c = getPoolContractReadOnly();
  if (!c || !user) return null;
  try {
    return await c.getHealthFactorPCOL(user);
  } catch {
    return null;
  }
}

export async function getHealthFactorPBUSD(user) {
  const c = getPoolContractReadOnly();
  if (!c || !user) return null;
  try {
    return await c.getHealthFactorPBUSD(user);
  } catch {
    return null;
  }
}

export async function getPriceCOLIn8() {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try {
    return await c.getPriceCOLIn8();
  } catch {
    return 0n;
  }
}

export async function getPriceBUSDIn8() {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try {
    return await c.getPriceBUSDIn8();
  } catch {
    return 0n;
  }
}

export async function getPoolParams() {
  const c = getPoolContractReadOnly();
  if (!c) return { liquidationThresholdPCOL: 6500n, liquidationThresholdPBUSD: 8500n, liquidationBonus: 1000n };
  try {
    const [ltPCOL, ltPBUSD, lb] = await Promise.all([
      c.liquidationThresholdPCOL(),
      c.liquidationThresholdPBUSD(),
      c.liquidationBonus(),
    ]);
    return { liquidationThresholdPCOL: ltPCOL, liquidationThresholdPBUSD: ltPBUSD, liquidationBonus: lb };
  } catch {
    return { liquidationThresholdPCOL: 6500n, liquidationThresholdPBUSD: 8500n, liquidationBonus: 1000n };
  }
}

export async function getUtilizationBUSD() {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try { return await c.getUtilizationBUSD(); } catch { return 0n; }
}

export async function getUtilizationCOL() {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try { return await c.getUtilizationCOL(); } catch { return 0n; }
}

export async function getBorrowAPYBUSD() {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try { return await c.getBorrowAPYBUSD(); } catch { return 0n; }
}

export async function getBorrowAPYCOL() {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try { return await c.getBorrowAPYCOL(); } catch { return 0n; }
}

export async function getSupplyAPYBUSD() {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try { return await c.getSupplyAPYBUSD(); } catch { return 0n; }
}

export async function getSupplyAPYCOL() {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try { return await c.getSupplyAPYCOL(); } catch { return 0n; }
}

/** 与合约一致，用于前端利率模拟 */
export const BLOCKS_PER_YEAR = 2102400;

export async function getBorrowRatePerBlockBUSD() {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try { return await c.getBorrowRatePerBlockBUSD(); } catch { return 0n; }
}

export async function getBorrowRatePerBlockCOL() {
  const c = getPoolContractReadOnly();
  if (!c) return 0n;
  try { return await c.getBorrowRatePerBlockCOL(); } catch { return 0n; }
}

/** 获取利率模型参数（拐点模型：U_opt, slope1, slope2，用于测试页模拟） */
export async function getRateParams() {
  const c = getPoolContractReadOnly();
  if (!c) return null;
  try {
    const [
      bBase, bS1, bS2, bOpt, bRes,
      cBase, cS1, cS2, cOpt, cRes,
    ] = await Promise.all([
      c.baseRatePerBlockBUSD(),
      c.slope1PerBlockBUSD(),
      c.slope2PerBlockBUSD(),
      c.optimalUtilizationBUSD(),
      c.reserveFactorBpsBUSD(),
      c.baseRatePerBlockCOL(),
      c.slope1PerBlockCOL(),
      c.slope2PerBlockCOL(),
      c.optimalUtilizationCOL(),
      c.reserveFactorBpsCOL(),
    ]);
    return {
      baseRatePerBlockBUSD: bBase,
      slope1PerBlockBUSD: bS1,
      slope2PerBlockBUSD: bS2,
      optimalUtilizationBUSD: bOpt,
      reserveFactorBpsBUSD: bRes,
      baseRatePerBlockCOL: cBase,
      slope1PerBlockCOL: cS1,
      slope2PerBlockCOL: cS2,
      optimalUtilizationCOL: cOpt,
      reserveFactorBpsCOL: cRes,
    };
  } catch {
    return null;
  }
}

export async function flashLoan(receiverAddress, asset, amountWei, params) {
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const tx = await c.flashLoan(receiverAddress, asset, amountWei, params || '0x');
  return tx.wait();
}

/** 通过示例合约发起闪电贷：用户需先向 receiver 授权手续费，再调用 receiver.requestFlashLoan(asset, amount) */
export async function requestFlashLoanViaReceiver(receiverAddress, asset, amountWei) {
  if (!receiverAddress) throw new Error('Flash loan receiver not configured');
  const c = getPoolContract();
  if (!c) throw new Error('Wallet not connected');
  const receiver = new ethers.Contract(receiverAddress, FLASH_RECEIVER_ABI, c.runner);
  const tx = await receiver.requestFlashLoan(asset, amountWei);
  return tx.wait();
}
