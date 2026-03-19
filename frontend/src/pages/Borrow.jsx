import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  getAccount,
  addresses,
  getUserPosition,
  getHealthFactor,
  getTokenBalance,
  getTokenInfo,
  borrow,
} from '../utils/web3';
import './Page.css';

export default function BorrowPage() {
  const [user, setUser] = useState(null);
  const [amount, setAmount] = useState('');
  const [position, setPosition] = useState({ collateral: 0n, debt: 0n });
  const [healthFactor, setHealthFactor] = useState(null);
  const [decimals, setDecimals] = useState(18);
  const [symbol, setSymbol] = useState('USD');
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);

  const asset = addresses.borrowAsset;

  useEffect(() => {
    getAccount().then(setUser);
  }, []);

  useEffect(() => {
    if (!user || !asset) return;
    getUserPosition(user).then(setPosition);
    getHealthFactor(user).then(setHealthFactor);
    getTokenInfo(asset).then((info) => {
      setDecimals(info.decimals);
      setSymbol(info.symbol);
    });
  }, [user, asset]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !user) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      const receipt = await borrow(asset, amountWei);
      setTx({ status: 'success', hash: receipt.hash });
      setAmount('');
      const [pos, hf] = await Promise.all([getUserPosition(user), getHealthFactor(user)]);
      setPosition(pos);
      setHealthFactor(hf);
    } catch (err) {
      setTx({ status: 'error', hash: err.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  const hfDisplay = healthFactor != null ? Number(ethers.formatUnits(healthFactor, 18)).toFixed(2) : '—';

  return (
    <div className="page">
      <h1>Borrow</h1>
      <p className="muted">Borrow {symbol} against your collateral. Health factor must stay ≥ 1.</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && (
        <div className="card">
          <p><strong>Your collateral:</strong> {ethers.formatUnits(position.collateral, 18)} (collateral asset)</p>
          <p><strong>Current debt:</strong> {ethers.formatUnits(position.debt, decimals)} {symbol}</p>
          <p><strong>Health factor:</strong> {hfDisplay}</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Amount to borrow ({symbol})</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <button type="submit" className="submit-btn" disabled={loading || !amount}>
              {loading ? 'Borrowing...' : 'Borrow'}
            </button>
          </form>
          {tx.status && (
            <p className={tx.status === 'success' ? 'success' : 'danger'} style={{ marginTop: '1rem' }}>
              {tx.status === 'success' ? `Done. Tx: ${tx.hash}` : tx.hash}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
