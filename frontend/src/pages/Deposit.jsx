import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  addresses,
  getTokenBalance,
  getTokenInfo,
  approveToken,
  depositCOL,
  depositBUSD,
  getDepositFeeCOL,
  getDepositFeeBUSD,
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
  const [estimatedFee, setEstimatedFee] = useState(0n);

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

  useEffect(() => {
    if (!amount || !pool) {
      setEstimatedFee(0n);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const amountWei = ethers.parseUnits(amount, decimals);
        const fee = mode === 'COL' ? await getDepositFeeCOL(amountWei) : await getDepositFeeBUSD(amountWei);
        if (!cancelled) setEstimatedFee(fee);
      } catch {
        if (!cancelled) setEstimatedFee(0n);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [amount, mode, decimals, pool]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !user || !pool || !asset) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      if (amountWei > balance) throw new Error('Insufficient balance');
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
      <h1>Deposit</h1>
      <p className="muted">Deposit COL to receive PCOL, or deposit BUSD to receive PBUSD. P tokens are pool receipts and can be redeemed 1:1 on withdrawal. Management fee uses a sublinear price-impact curve (impact^0.25), so fee growth is slower for large deposits; around 1% impact is charged about ~0.05%, and fees remain in the pool. The first deposit uses a fixed 0.05% fee.</p>
      {!user && <p className="muted">Please connect MetaMask first.</p>}
      {user && (
        <div className="card">
          <div className="form-group">
            <label>Asset</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ maxWidth: 320, padding: '0.6rem 0.75rem', borderRadius: 8 }}
            >
              <option value="COL">COL -> Receive PCOL</option>
              <option value="BUSD">BUSD -> Receive PBUSD</option>
            </select>
          </div>
          <p><strong>Wallet {symbol}:</strong> {formatWei(balance, decimals)}</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Amount</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            {amount && (() => {
              try {
                const amountWei = ethers.parseUnits(amount, decimals);
                const net = amountWei - estimatedFee;
                const feeRateBps = amountWei === 0n ? 0 : Number((estimatedFee * 10000n) / amountWei);
                const feeRatePct = (feeRateBps / 100).toFixed(2);
                return (
                  <p className="muted" style={{ marginBottom: '0.75rem' }}>
                    Estimated management fee: <strong>{formatWei(estimatedFee, decimals)}</strong> {symbol}
                    &nbsp;(fee rate <strong>{feeRatePct}%</strong>)
                    &nbsp;·&nbsp;
                    You receive: <strong>{formatWei(net < 0n ? 0n : net, decimals)}</strong> {mode === 'COL' ? 'PCOL' : 'PBUSD'}
                  </p>
                );
              } catch {
                return null;
              }
            })()}
            <button type="submit" className="submit-btn" disabled={loading || !amount}>
              {loading ? 'Depositing...' : `Deposit ${symbol}`}
            </button>
          </form>
          {tx.status && (
            <p className={tx.status === 'success' ? 'success' : 'danger'} style={{ marginTop: '1rem' }}>
              {tx.status === 'success' ? `Success. Tx: ${tx.hash}` : tx.hash}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
