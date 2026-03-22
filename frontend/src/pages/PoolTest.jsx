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
      if (amountWei <= 0n) throw new Error('请输入大于 0 的数量');
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
      if (amountWei <= 0n) throw new Error('请输入大于 0 的数量');
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
      <h1>池储备调节（测试）</h1>
      <p className="muted">
        直接让池内 COL 或 BUSD 数量增加（调用测试代币的 mint 到池地址），不消耗你的余额，用于改变 COL 价格（价格 = 池 BUSD / 池 COL）。
        例如：增加大量池内 COL 会使 COL 价格下跌，抵押 PCOL 借 BUSD 的仓位健康因子可能降至 1 以下，即可在「Liquidate」页进行清算测试。仅测试网/本地 Mock 代币可用。
      </p>

      <div className="card">
        <h3>当前池储备与价格</h3>
        <p><strong>池内 COL:</strong> {formatWei(poolCOL, colDecimals)}</p>
        <p><strong>池内 BUSD:</strong> {formatWei(poolBUSD, busdDecimals)}</p>
        <p><strong>COL 价格 (USD, 8 位):</strong> {priceCOLDisplay}</p>
      </div>

      {!user && <p className="muted">请先连接 MetaMask 后再操作。</p>}

      {user && (
        <>
          <div className="card">
            <h3>增加池内 COL（降低 COL 价格）</h3>
            <p className="muted">直接向池子铸造 COL，不消耗你的余额。</p>
            <form onSubmit={handleAddCOL}>
              <div className="form-group">
                <label>数量</label>
                <input
                  type="text"
                  value={addColAmount}
                  onChange={(e) => setAddColAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <button type="submit" className="submit-btn" disabled={loading || !addColAmount}>
                {loading ? '提交中...' : '增加池内 COL'}
              </button>
            </form>
          </div>

          <div className="card">
            <h3>增加池内 BUSD（提高 COL 价格）</h3>
            <p className="muted">直接向池子铸造 BUSD，不消耗你的余额。</p>
            <form onSubmit={handleAddBUSD}>
              <div className="form-group">
                <label>数量</label>
                <input
                  type="text"
                  value={addBusdAmount}
                  onChange={(e) => setAddBusdAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <button type="submit" className="submit-btn" disabled={loading || !addBusdAmount}>
                {loading ? '提交中...' : '增加池内 BUSD'}
              </button>
            </form>
          </div>

          {tx.status && (
            <p className={tx.status === 'success' ? 'success' : 'danger'} style={{ marginTop: '1rem' }}>
              {tx.status === 'success' ? `成功。Tx: ${tx.hash}` : tx.hash}
            </p>
          )}
        </>
      )}

      <p className="muted" style={{ marginTop: '1.5rem' }}>
        数据每 15 秒自动刷新，或提交交易成功后会自动刷新。
      </p>
    </div>
  );
}
