import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  addresses,
  getTokenBalance,
  getTokenInfo,
  approveToken,
  depositCollateralPCOL,
  depositCollateralPBUSD,
  withdrawCollateralPCOL,
  withdrawCollateralPBUSD,
  borrowBUSD,
  borrowCOL,
  getUserPositionPCOL,
  getUserPositionPBUSD,
  getMaxBorrowBUSD,
  getMaxBorrowCOL,
  getHealthFactorPCOL,
  getHealthFactorPBUSD,
  getPriceCOLIn8,
  getPriceBUSDIn8,
  getPoolParams,
} from '../utils/web3';
import { useWallet } from '../context/WalletContext';
import './Page.css';

function fmt(wei, d) {
  if (wei == null) return '0';
  try {
    return typeof wei === 'bigint' ? ethers.formatUnits(wei, d ?? 18) : String(wei);
  } catch {
    return '0';
  }
}

export default function Borrow() {
  const { user } = useWallet();
  const [mode, setMode] = useState('PCOL');
  const [action, setAction] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState(0n);
  const [position, setPosition] = useState({ col: 0n, debt: 0n });
  const [maxBorrow, setMaxBorrow] = useState(0n);
  const [healthFactor, setHealthFactor] = useState(null);
  const [priceCOL, setPriceCOL] = useState(0n);
  const [priceBUSD, setPriceBUSD] = useState(0n);
  const [poolParams, setPoolParams] = useState({ liquidationThreshold: 8000n, liquidationBonus: 1000n });
  const [dec, setDec] = useState(18);
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);
  const pool = addresses.lendingPool;
  const pcol = addresses.pcolToken;
  const pbusd = addresses.pbusdToken;
  const pToken = mode === 'PCOL' ? pcol : pbusd;
  const borrowAsset = mode === 'PCOL' ? 'BUSD' : 'COL';

  useEffect(() => {
    if (!pToken) return;
    getTokenInfo(pToken).then((d) => setDec(d.decimals));
  }, [pToken]);

  useEffect(() => {
    if (!user || !pcol || !pbusd) return;
    getPriceCOLIn8().then(setPriceCOL);
    getPriceBUSDIn8().then(setPriceBUSD);
    getPoolParams().then(setPoolParams);
    if (mode === 'PCOL') {
      getUserPositionPCOL(user).then((p) => setPosition({ col: p.collateralPCOL, debt: p.debtBUSD }));
      getMaxBorrowBUSD(user).then(setMaxBorrow);
      getHealthFactorPCOL(user).then(setHealthFactor);
      getTokenBalance(pcol, user).then(setBalance);
    } else {
      getUserPositionPBUSD(user).then((p) => setPosition({ col: p.collateralPBUSD, debt: p.debtCOL }));
      getMaxBorrowCOL(user).then(setMaxBorrow);
      getHealthFactorPBUSD(user).then(setHealthFactor);
      getTokenBalance(pbusd, user).then(setBalance);
    }
  }, [user, mode, pcol, pbusd]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !user || !pool) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, dec);
      const { getTokenAllowance } = await import('../utils/web3');
      if (action === 'deposit') {
        if (amountWei > balance) throw new Error('Insufficient balance');
        const allowance = await getTokenAllowance(pToken, user, pool);
        if (allowance < amountWei) await approveToken(pToken, pool, ethers.MaxUint256);
        const receipt = mode === 'PCOL' ? await depositCollateralPCOL(amountWei) : await depositCollateralPBUSD(amountWei);
        setTx({ status: 'success', hash: receipt.hash });
      } else if (action === 'withdraw') {
        if (amountWei > position.col) throw new Error('Exceeds locked');
        const receipt = mode === 'PCOL' ? await withdrawCollateralPCOL(amountWei) : await withdrawCollateralPBUSD(amountWei);
        setTx({ status: 'success', hash: receipt.hash });
      } else {
        if (amountWei > maxBorrow) throw new Error('Exceeds max borrow');
        const receipt = mode === 'PCOL' ? await borrowBUSD(amountWei) : await borrowCOL(amountWei);
        setTx({ status: 'success', hash: receipt.hash });
      }
      setAmount('');
      if (mode === 'PCOL') {
        getUserPositionPCOL(user).then((p) => setPosition({ col: p.collateralPCOL, debt: p.debtBUSD }));
        getMaxBorrowBUSD(user).then(setMaxBorrow);
        getHealthFactorPCOL(user).then(setHealthFactor);
        getTokenBalance(pcol, user).then(setBalance);
      } else {
        getUserPositionPBUSD(user).then((p) => setPosition({ col: p.collateralPBUSD, debt: p.debtCOL }));
        getMaxBorrowCOL(user).then(setMaxBorrow);
        getHealthFactorPBUSD(user).then(setHealthFactor);
        getTokenBalance(pbusd, user).then(setBalance);
      }
    } catch (err) {
      setTx({ status: 'error', hash: err?.message || 'Failed' });
    } finally {
      setLoading(false);
    }
  };

  const colLabel = mode === 'PCOL' ? 'PCOL' : 'PBUSD';
  const priceColUsd = priceCOL > 0n ? Number(priceCOL) / 1e8 : 0;
  const priceBusdUsd = priceBUSD > 0n ? Number(priceBUSD) / 1e8 : 1;
  const lt = Number(poolParams.liquidationThreshold ?? 8000n) / 100;
  const lb = Number(poolParams.liquidationBonus ?? 1000n) / 100;
  const MAX_UINT = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
  const hfNum = healthFactor != null && healthFactor < MAX_UINT
    ? Number(healthFactor) / 1e18
    : null;
  const colValueUsd = mode === 'PCOL' && priceCOL > 0n ? (Number(position.col) * priceColUsd) / 1e18 : (mode === 'PBUSD' && priceBusdUsd ? (Number(position.col) * priceBusdUsd) / 1e18 : 0);
  const debtValueUsd = mode === 'PCOL' ? (Number(position.debt) * priceBusdUsd) / 1e18 : (Number(position.debt) * priceColUsd) / 1e18;

  return (
    <div className="page">
      <h1>Borrow</h1>
      <p className="muted">Collateral PCOL to borrow BUSD, or collateral PBUSD to borrow COL.</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>价格 (池内)</h3>
          <p><strong>COL:</strong> ${priceColUsd.toFixed(4)} &nbsp; <strong>BUSD:</strong> ${priceBusdUsd.toFixed(4)}</p>
          <h3>参数</h3>
          <p><strong>清算阈值:</strong> {lt}% &nbsp; <strong>清算奖励:</strong> {lb}%</p>
          <h3>当前仓位</h3>
          <p><strong>持有 {colLabel}:</strong> {fmt(balance, dec)} &nbsp; <strong>已锁定:</strong> {fmt(position.col, dec)} &nbsp; <strong>债务 {borrowAsset}:</strong> {fmt(position.debt, dec)}</p>
          <p><strong>抵押价值 (USD):</strong> ${colValueUsd.toFixed(2)} &nbsp; <strong>债务价值 (USD):</strong> ${debtValueUsd.toFixed(2)}</p>
          <p><strong>健康系数:</strong> {hfNum != null ? hfNum.toFixed(2) : '—'} {hfNum != null && hfNum < 1 && <span className="danger">(可清算)</span>}</p>
          <p><strong>抵押物最高可借 {borrowAsset}:</strong> {fmt(maxBorrow, dec)}</p>
          <div className="form-group">
            <label>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ maxWidth: 320, padding: '0.6rem 0.75rem', borderRadius: 8 }}>
              <option value="PCOL">Collateral PCOL / Borrow BUSD</option>
              <option value="PBUSD">Collateral PBUSD / Borrow COL</option>
            </select>
          </div>
          <div className="form-group">
            <label>Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value)} style={{ maxWidth: 320, padding: '0.6rem 0.75rem', borderRadius: 8 }}>
              <option value="deposit">Lock collateral</option>
              <option value="withdraw">Unlock collateral</option>
              <option value="borrow">Borrow {borrowAsset}</option>
            </select>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Amount</label>
              <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <button type="submit" className="submit-btn" disabled={loading || !amount}>
              {loading ? '...' : action === 'borrow' ? 'Borrow ' + borrowAsset : action === 'deposit' ? 'Lock ' + colLabel : 'Unlock ' + colLabel}
            </button>
          </form>
          {tx.status && <p className={tx.status === 'success' ? 'success' : 'danger'} style={{ marginTop: '1rem' }}>{tx.status === 'success' ? 'Tx: ' + tx.hash : tx.hash}</p>}
        </div>
      )}
    </div>
  );
}
