import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  addresses,
  getTokenBalance,
  getTokenInfo,
  approveToken,
  repayBUSD,
  repayCOL,
  getUserPositionPCOL,
  getUserPositionPBUSD,
} from '../utils/web3';
import { useWallet } from '../context/WalletContext';
import './Page.css';

function fmt(wei, d = 18) {
  if (wei == null) return '0';
  try {
    return typeof wei === 'bigint' ? ethers.formatUnits(wei, d) : String(wei);
  } catch {
    return '0';
  }
}

export default function Repay() {
  const { user } = useWallet();
  const [mode, setMode] = useState('BUSD');
  const [amount, setAmount] = useState('');
  const [debt, setDebt] = useState(0n);
  const [balance, setBalance] = useState(0n);
  const [dec, setDec] = useState(18);
  const [symbol, setSymbol] = useState('BUSD');
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);
  const pool = addresses.lendingPool;
  const col = addresses.collateralAsset;
  const busd = addresses.borrowAsset;
  const asset = mode === 'BUSD' ? busd : col;

  useEffect(() => {
    if (!asset) return;
    getTokenInfo(asset).then((d) => { setDec(d.decimals); setSymbol(d.symbol); });
  }, [asset]);

  useEffect(() => {
    if (!user || !asset) return;
    if (mode === 'BUSD') getUserPositionPCOL(user).then((p) => setDebt(p.debtBUSD));
    else getUserPositionPBUSD(user).then((p) => setDebt(p.debtCOL));
    getTokenBalance(asset, user).then(setBalance);
  }, [user, mode, asset]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !user || !pool) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, dec);
      if (amountWei > balance) throw new Error('Insufficient balance');
      const { getTokenAllowance } = await import('../utils/web3');
      const allowance = await getTokenAllowance(asset, user, pool);
      if (allowance < amountWei) await approveToken(asset, pool, ethers.MaxUint256);
      const receipt = mode === 'BUSD' ? await repayBUSD(amountWei) : await repayCOL(amountWei);
      setTx({ status: 'success', hash: receipt.hash });
      setAmount('');
      if (mode === 'BUSD') getUserPositionPCOL(user).then((p) => setDebt(p.debtBUSD));
      else getUserPositionPBUSD(user).then((p) => setDebt(p.debtCOL));
      getTokenBalance(asset, user).then(setBalance);
    } catch (err) {
      setTx({ status: 'error', hash: err?.message || 'Failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Repay</h1>
      <p className="muted">Repay BUSD debt (PCOL position) or COL debt (PBUSD position).</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && (
        <div className="card">
          <div className="form-group">
            <label>Debt type</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ maxWidth: 320, padding: '0.6rem 0.75rem', borderRadius: 8 }}>
              <option value="BUSD">Repay BUSD</option>
              <option value="COL">Repay COL</option>
            </select>
          </div>
          <p>Debt: {fmt(debt, dec)} {symbol} | Wallet: {fmt(balance, dec)}</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Amount</label>
              <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <button type="submit" className="submit-btn" disabled={loading || !amount || debt === 0n}>
              {loading ? '...' : `Repay ${symbol}`}
            </button>
          </form>
          {tx.status && <p className={tx.status === 'success' ? 'success' : 'danger'} style={{ marginTop: '1rem' }}>{tx.status === 'success' ? `Tx: ${tx.hash}` : tx.hash}</p>}
        </div>
      )}
    </div>
  );
}
