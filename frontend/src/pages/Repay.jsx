import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  getAccount,
  addresses,
  getUserPosition,
  getTokenBalance,
  getTokenInfo,
  getTokenAllowance,
  approveToken,
  repay,
} from '../utils/web3';
import './Page.css';

export default function RepayPage() {
  const [user, setUser] = useState(null);
  const [amount, setAmount] = useState('');
  const [position, setPosition] = useState({ collateral: 0n, debt: 0n });
  const [balance, setBalance] = useState(0n);
  const [decimals, setDecimals] = useState(18);
  const [symbol, setSymbol] = useState('USD');
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);

  const asset = addresses.borrowAsset;

  const refresh = () => {
    if (!user || !asset) return;
    getUserPosition(user).then(setPosition);
    getTokenBalance(asset, user).then(setBalance);
    getTokenInfo(asset).then((info) => {
      setDecimals(info.decimals);
      setSymbol(info.symbol);
    });
  };

  useEffect(() => {
    getAccount().then(setUser);
  }, []);

  useEffect(() => {
    refresh();
  }, [user, asset]);

  const maxAmount = () => {
    const debt = position.debt;
    const bal = balance;
    const max = debt < bal ? debt : bal;
    setAmount(ethers.formatUnits(max, decimals));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !user) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      const pool = addresses.lendingPool;
      const allowance = await getTokenAllowance(asset, user, pool);
      if (allowance < amountWei) {
        await (await approveToken(asset, pool, ethers.MaxUint256)).wait();
      }
      const receipt = await repay(asset, amountWei);
      setTx({ status: 'success', hash: receipt.hash });
      setAmount('');
      refresh();
    } catch (err) {
      setTx({ status: 'error', hash: err.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Repay</h1>
      <p className="muted">Repay your borrowed {symbol}. Approve token first if needed.</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && (
        <div className="card">
          <p><strong>Your debt:</strong> {ethers.formatUnits(position.debt, decimals)} {symbol}</p>
          <p><strong>Wallet balance:</strong> {ethers.formatUnits(balance, decimals)} {symbol}</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Amount to repay ({symbol})</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
              <button type="button" className="btn" onClick={maxAmount} style={{ marginTop: 4 }}>Max</button>
            </div>
            <button type="submit" className="submit-btn" disabled={loading || !amount}>
              {loading ? 'Repaying...' : 'Repay'}
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
