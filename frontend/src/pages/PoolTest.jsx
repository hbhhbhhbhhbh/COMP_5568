import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  addresses,
  getTokenBalance,
  getTokenInfo,
  mintTokenTo,
  getPoolContractReadOnly,
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

export default function PoolTest() {
  const { user } = useWallet();
  const pool = addresses.lendingPool;
  const col = addresses.collateralAsset;
  const busd = addresses.borrowAsset;

  const [poolCOL, setPoolCOL] = useState(0n);
  const [poolBUSD, setPoolBUSD] = useState(0n);
  const [priceCOLIn8, setPriceCOLIn8] = useState(0n);
  const [colDecimals, setColDecimals] = useState(18);
  const [busdDecimals, setBusdDecimals] = useState(18);
  const [addColAmount, setAddColAmount] = useState('');
  const [addBusdAmount, setAddBusdAmount] = useState('');
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!pool || !col || !busd) return;
    const poolRead = getPoolContractReadOnly();
    const [pCol, pBusd, price, colD, busdD] = await Promise.all([
      getTokenBalance(col, pool),
      getTokenBalance(busd, pool),
      poolRead ? poolRead.getPriceCOLIn8() : 0n,
      getTokenInfo(col).then((d) => d.decimals),
      getTokenInfo(busd).then((d) => d.decimals),
    ]);
    setPoolCOL(pCol);
    setPoolBUSD(pBusd);
    setPriceCOLIn8(price);
    setColDecimals(colD);
    setBusdDecimals(busdD);
  }, [pool, col, busd]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const handleAddCOL = async (e) => {
    e.preventDefault();
    if (!addColAmount || !user || !pool || !col) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(addColAmount, colDecimals);
      if (amountWei <= 0n) throw new Error('Please enter an amount greater than 0');
      const receipt = await mintTokenTo(col, pool, amountWei);
      setTx({ status: 'success', hash: receipt.hash });
      setAddColAmount('');
      await refresh();
    } catch (err) {
      setTx({ status: 'error', hash: err?.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddBUSD = async (e) => {
    e.preventDefault();
    if (!addBusdAmount || !user || !pool || !busd) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(addBusdAmount, busdDecimals);
      if (amountWei <= 0n) throw new Error('Please enter an amount greater than 0');
      const receipt = await mintTokenTo(busd, pool, amountWei);
      setTx({ status: 'success', hash: receipt.hash });
      setAddBusdAmount('');
      await refresh();
    } catch (err) {
      setTx({ status: 'error', hash: err?.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  const priceCOLDisplay = priceCOLIn8 ? Number(priceCOLIn8) / 1e8 : '0';

  return (
    <div className="page">
      <h1>Pool Reserve Adjustment (Test)</h1>
      <p className="muted">
        Directly increase pool COL or BUSD by minting test tokens to the pool address, without spending your wallet balance, to change COL price (price = pool BUSD / pool COL).
        For example, increasing pool COL can push COL price down, which may drop HF below 1 for PCOL->BUSD positions. Then you can test liquidation on the Liquidate page. Available only for local/testnet Mock tokens.
      </p>

      <div className="card">
        <h3>Current Pool Reserves & Price</h3>
        <p><strong>Pool COL:</strong> {formatWei(poolCOL, colDecimals)}</p>
        <p><strong>Pool BUSD:</strong> {formatWei(poolBUSD, busdDecimals)}</p>
        <p><strong>COL Price (USD, 8 decimals):</strong> {priceCOLDisplay}</p>
      </div>

      {!user && <p className="muted">Please connect MetaMask first.</p>}

      {user && (
        <>
          <div className="card">
            <h3>Add Pool COL (Lower COL Price)</h3>
            <p className="muted">Mint COL directly to the pool without spending your wallet balance.</p>
            <form onSubmit={handleAddCOL}>
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="text"
                  value={addColAmount}
                  onChange={(e) => setAddColAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <button type="submit" className="submit-btn" disabled={loading || !addColAmount}>
                {loading ? 'Submitting...' : 'Add Pool COL'}
              </button>
            </form>
          </div>

          <div className="card">
            <h3>Add Pool BUSD (Raise COL Price)</h3>
            <p className="muted">Mint BUSD directly to the pool without spending your wallet balance.</p>
            <form onSubmit={handleAddBUSD}>
              <div className="form-group">
                <label>Amount</label>
                <input
                  type="text"
                  value={addBusdAmount}
                  onChange={(e) => setAddBusdAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <button type="submit" className="submit-btn" disabled={loading || !addBusdAmount}>
                {loading ? 'Submitting...' : 'Add Pool BUSD'}
              </button>
            </form>
          </div>

          {tx.status && (
            <p className={tx.status === 'success' ? 'success' : 'danger'} style={{ marginTop: '1rem' }}>
              {tx.status === 'success' ? `Success. Tx: ${tx.hash}` : tx.hash}
            </p>
          )}
        </>
      )}

      <p className="muted" style={{ marginTop: '1.5rem' }}>
        Data auto-refreshes every 15 seconds and after successful transactions.
      </p>
    </div>
  );
}
