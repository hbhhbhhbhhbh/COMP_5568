import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  getAccount,
  addresses,
  getTokenBalance,
  getTokenInfo,
  approveToken,
  deposit,
} from '../utils/web3';
import './Page.css';

export default function DepositPage() {
  const [user, setUser] = useState(null);
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState(0n);
  const [decimals, setDecimals] = useState(18);
  const [symbol, setSymbol] = useState('COL');
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);

  const asset = addresses.collateralAsset;

  useEffect(() => {
    getAccount().then(setUser);
  }, []);

  useEffect(() => {
    if (!asset) return;
    getTokenInfo(asset).then((info) => {
      setDecimals(info.decimals);
      setSymbol(info.symbol);
    });
  }, [asset]);

  useEffect(() => {
    if (!user || !asset) return;
    getTokenBalance(asset, user).then(setBalance);
  }, [user, asset]);

  const maxAmount = () => setAmount(ethers.formatUnits(balance, decimals));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !user || !addresses.lendingPool) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      if (amountWei > balance) throw new Error('Insufficient balance');
      const pool = addresses.lendingPool;
      const { getERC20Contract, getTokenAllowance } = await import('../utils/web3');
      const token = getERC20Contract(asset, false);
      const allowance = await getTokenAllowance(asset, user, pool);
      if (allowance < amountWei) {
        const approveTx = await approveToken(asset, pool, ethers.MaxUint256);
        await approveTx.wait();
      }
      const receipt = await deposit(asset, amountWei);
      setTx({ status: 'success', hash: receipt.hash });
      setAmount('');
      const newBal = await getTokenBalance(asset, user);
      setBalance(newBal);
    } catch (err) {
      setTx({ status: 'error', hash: err.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Deposit collateral</h1>
      <p className="muted">Deposit collateral to borrow against. Uses {symbol} as collateral asset.</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && (
        <div className="card">
          <p><strong>Wallet balance:</strong> {ethers.formatUnits(balance, decimals)} {symbol}</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Amount ({symbol})</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
              <button type="button" className="btn" onClick={maxAmount} style={{ marginTop: 4 }}>Max</button>
            </div>
            <button type="submit" className="submit-btn" disabled={loading || !amount}>
              {loading ? 'Depositing...' : 'Deposit'}
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
