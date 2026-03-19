import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  getAccount,
  addresses,
  getUserPosition,
  getHealthFactor,
  getTokenInfo,
  withdraw,
} from '../utils/web3';
import './Page.css';

export default function WithdrawPage() {
  const [user, setUser] = useState(null);
  const [amount, setAmount] = useState('');
  const [position, setPosition] = useState({ collateral: 0n, debt: 0n });
  const [healthFactor, setHealthFactor] = useState(null);
  const [decimals, setDecimals] = useState(18);
  const [symbol, setSymbol] = useState('COL');
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);

  const asset = addresses.collateralAsset;

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

  const maxAmount = () => setAmount(ethers.formatUnits(position.collateral, decimals));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !user) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      if (amountWei > position.collateral) throw new Error('Insufficient collateral');
      const receipt = await withdraw(asset, amountWei);
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
      <h1>Withdraw collateral</h1>
      <p className="muted">Withdraw collateral. Health factor must remain ≥ 1 after withdraw.</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && (
        <div className="card">
          <p><strong>Deposited collateral:</strong> {ethers.formatUnits(position.collateral, decimals)} {symbol}</p>
          <p><strong>Health factor:</strong> {hfDisplay}</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Amount to withdraw ({symbol})</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
              <button type="button" className="btn" onClick={maxAmount} style={{ marginTop: 4 }}>Max</button>
            </div>
            <button type="submit" className="submit-btn" disabled={loading || !amount}>
              {loading ? 'Withdrawing...' : 'Withdraw'}
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
