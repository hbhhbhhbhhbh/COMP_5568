import { ethers } from 'ethers';
import { addresses } from './addresses';
import { LENDING_POOL_ABI, ERC20_ABI, PRICE_ORACLE_ABI, GOVERNANCE_TOKEN_ABI } from './abis';

let provider = null;
let signer = null;

/**
 * Connect to MetaMask and return provider + signer.
 */
export async function connectWallet() {
  if (!window.ethereum) throw new Error('MetaMask not installed');
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

/**
 * Get current account (no prompt).
 */
export async function getAccount() {
  if (!window.ethereum) return null;
  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
  return accounts[0] || null;
}

/**
 * Get chain ID.
 */
export async function getChainId() {
  if (!window.ethereum) return null;
  const hex = await window.ethereum.request({ method: 'eth_chainId' });
  return parseInt(hex, 16);
}

/**
 * Get provider (read-only). Uses window.ethereum if no provider set.
 */
export function getProvider() {
  if (provider) return provider;
  if (window.ethereum) return new ethers.BrowserProvider(window.ethereum);
  return null;
}

/**
 * Get signer for transactions.
 */
export function getSigner() {
  return signer;
}

// --- Contract instances (read) ---

export function getLendingPoolContract(useSigner = false) {
  const addr = addresses.lendingPool;
  if (!addr) return null;
  const p = getProvider();
  if (!p) return null;
  return new ethers.Contract(addr, LENDING_POOL_ABI, useSigner && signer ? signer : p);
}

export function getERC20Contract(tokenAddress, useSigner = false) {
  if (!tokenAddress) return null;
  const p = getProvider();
  if (!p) return null;
  return new ethers.Contract(tokenAddress, ERC20_ABI, useSigner && signer ? signer : p);
}

export function getOracleContract(useSigner = false) {
  const addr = addresses.priceOracle;
  if (!addr) return null;
  const p = getProvider();
  if (!p) return null;
  return new ethers.Contract(addr, PRICE_ORACLE_ABI, useSigner && signer ? signer : p);
}

export function getGovernanceTokenContract(useSigner = false) {
  const addr = addresses.governanceToken;
  if (!addr) return null;
  const p = getProvider();
  if (!p) return null;
  return new ethers.Contract(addr, GOVERNANCE_TOKEN_ABI, useSigner && signer ? signer : p);
}

// --- Protocol actions ---

export async function deposit(asset, amountWei) {
  const contract = getLendingPoolContract(true);
  if (!contract) throw new Error('LendingPool not configured');
  const tx = await contract.deposit(asset, amountWei);
  return tx.wait();
}

export async function withdraw(asset, amountWei) {
  const contract = getLendingPoolContract(true);
  if (!contract) throw new Error('LendingPool not configured');
  const tx = await contract.withdraw(asset, amountWei);
  return tx.wait();
}

export async function borrow(asset, amountWei) {
  const contract = getLendingPoolContract(true);
  if (!contract) throw new Error('LendingPool not configured');
  const tx = await contract.borrow(asset, amountWei);
  return tx.wait();
}

export async function repay(asset, amountWei) {
  const contract = getLendingPoolContract(true);
  if (!contract) throw new Error('LendingPool not configured');
  const tx = await contract.repay(asset, amountWei);
  return tx.wait();
}

export async function liquidate(collateralAsset, debtAsset, user) {
  const contract = getLendingPoolContract(true);
  if (!contract) throw new Error('LendingPool not configured');
  const tx = await contract.liquidate(collateralAsset, debtAsset, user);
  return tx.wait();
}

export async function flashLoan(receiverAddress, asset, amountWei, params = '0x') {
  const contract = getLendingPoolContract(true);
  if (!contract) throw new Error('LendingPool not configured');
  const tx = await contract.flashLoan(receiverAddress, asset, amountWei, params);
  return tx.wait();
}

// --- Approve ERC20 ---

export async function approveToken(tokenAddress, spender, amountWei) {
  const contract = getERC20Contract(tokenAddress, true);
  if (!contract) throw new Error('Token not configured');
  const tx = await contract.approve(spender, amountWei);
  return tx.wait();
}

// --- Read helpers ---

export async function getUserPosition(userAddress) {
  const contract = getLendingPoolContract(false);
  if (!contract || !addresses.lendingPool) return { collateral: 0n, debt: 0n };
  try {
    const [collateral, debt] = await contract.getUserPosition(userAddress);
    return { collateral, debt };
  } catch {
    return { collateral: 0n, debt: 0n };
  }
}

export async function getHealthFactor(userAddress) {
  const contract = getLendingPoolContract(false);
  if (!contract) return null;
  try {
    const hf = await contract.getHealthFactor(userAddress);
    return hf;
  } catch {
    return null;
  }
}

export async function getUtilizationRate() {
  const contract = getLendingPoolContract(false);
  if (!contract) return null;
  try {
    return await contract.getUtilizationRate();
  } catch {
    return null;
  }
}

export async function getFlashLoanFee(amountWei) {
  const contract = getLendingPoolContract(false);
  if (!contract) return null;
  try {
    return await contract.getFlashLoanFee(amountWei);
  } catch {
    return null;
  }
}

export async function isLiquidatable(userAddress) {
  const contract = getLendingPoolContract(false);
  if (!contract) return false;
  try {
    return await contract.isLiquidatable(userAddress);
  } catch {
    return false;
  }
}

export async function getTokenBalance(tokenAddress, userAddress) {
  const contract = getERC20Contract(tokenAddress, false);
  if (!contract) return 0n;
  try {
    return await contract.balanceOf(userAddress);
  } catch {
    return 0n;
  }
}

export async function getTokenAllowance(tokenAddress, owner, spender) {
  const contract = getERC20Contract(tokenAddress, false);
  if (!contract) return 0n;
  try {
    return await contract.allowance(owner, spender);
  } catch {
    return 0n;
  }
}

export async function getPrice(asset) {
  const contract = getOracleContract(false);
  if (!contract) return null;
  try {
    return await contract.getPrice(asset);
  } catch {
    return null;
  }
}

export async function getTokenInfo(tokenAddress) {
  const contract = getERC20Contract(tokenAddress, false);
  if (!contract) return { decimals: 18, symbol: '?' };
  try {
    const [decimals, symbol] = await Promise.all([contract.decimals(), contract.symbol()]);
    return { decimals: Number(decimals), symbol };
  } catch {
    return { decimals: 18, symbol: '?' };
  }
}

export { addresses };
