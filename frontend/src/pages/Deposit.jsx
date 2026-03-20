import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  addresses,
  getTokenBalance,
  getTokenInfo,
  approveToken,
  depositCOL,
  depositBUSD,
} from '../utils/web3';
import { useWallet } from '../context/WalletContext';
import './Page.css';

function formatWei(wei, decimals = 18) {
  if (wei === undefined || wei === null) return '0';
  try {
    return typeof wei === 'bigint' ? ethers.formatUnits(wei, decimals) : String(wei);
  } catch {
    return '0';
  }
}

export default function Deposit() {
  const { user } = useWallet();
  const [mode, setMode] = useState('COL'); // 'COL' | 'BUSD'
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState(0n);
  const [decimals, setDecimals] = useState(18);
  const [symbol, setSymbol] = useState('COL');
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);

  const pool = addresses.lendingPool;
  const col = addresses.collateralAsset;
  const busd = addresses.borrowAsset;
  const asset = mode === 'COL' ? col : busd;

  useEffect(() => {
    if (!asset) return;
    getTokenInfo(asset).then((d) => {
      setDecimals(d.decimals);
      setSymbol(d.symbol);
    });
  }, [asset]);

  useEffect(() => {
    if (!user || !asset) return;
    getTokenBalance(asset, user).then(setBalance);
  }, [user, asset]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !user || !pool || !asset) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      if (amountWei > balance) throw new Error('余额不足');
      const { getTokenAllowance } = await import('../utils/web3');
      const allowance = await getTokenAllowance(asset, user, pool);
      if (allowance < amountWei) await approveToken(asset, pool, ethers.MaxUint256);
      const receipt = mode === 'COL' ? await depositCOL(amountWei) : await depositBUSD(amountWei);
      setTx({ status: 'success', hash: receipt.hash });
      setAmount('');
      const newBal = await getTokenBalance(asset, user);
      setBalance(newBal);
    } catch (err) {
      setTx({ status: 'error', hash: err?.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Deposit 存入</h1>
      <p className="muted">存入 COL 获得 PCOL，存入 BUSD 获得 PBUSD。P 币为池内凭证，取款时 1:1 取回。</p>
      {!user && <p className="muted">请先连接 MetaMask。</p>}
      {user && (
        <div className="card">
          <div className="form-group">
            <label>存入资产</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ maxWidth: 320, padding: '0.6rem 0.75rem', borderRadius: 8 }}
            >
              <option value="COL">COL → 获得 PCOL</option>
              <option value="BUSD">BUSD → 获得 PBUSD</option>
            </select>
          </div>
          <p><strong>钱包 {symbol}:</strong> {formatWei(balance, decimals)}</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>数量</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <button type="submit" className="submit-btn" disabled={loading || !amount}>
              {loading ? '存入中...' : `存入 ${symbol}`}
            </button>
          </form>
          {tx.status && (
            <p className={tx.status === 'success' ? 'success' : 'danger'} style={{ marginTop: '1rem' }}>
              {tx.status === 'success' ? `成功。Tx: ${tx.hash}` : tx.hash}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
