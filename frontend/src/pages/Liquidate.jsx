import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  addresses,
  getTokenBalance,
  getTokenInfo,
  approveToken,
  liquidateBUSD,
  liquidateCOL,
  getPoolContractReadOnly,
  getTokenAllowance,
} from '../utils/web3';
import { useWallet } from '../context/WalletContext';
import './Page.css';

function formatWei(wei, decimals) {
  if (wei === undefined || wei === null) return '0';
  try {
    return typeof wei === 'bigint' ? ethers.formatUnits(wei, decimals ?? 18) : String(wei);
  } catch {
    return '0';
  }
}

export default function Liquidate() {
  const { user } = useWallet();
  const [mode, setMode] = useState('BUSD'); // liquidate PCOL position (repay BUSD) | 'COL' (repay COL)
  const [targetUser, setTargetUser] = useState('');
  const [decimals, setDecimals] = useState(18);
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);

  const pool = addresses.lendingPool;
  const col = addresses.collateralAsset;
  const busd = addresses.borrowAsset;
  const repayAsset = mode === 'BUSD' ? busd : col;

  useEffect(() => {
    if (!col || !busd) return;
    getTokenInfo(busd).then((d) => setDecimals(d.decimals));
  }, [col, busd]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetUser || !user || !pool) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const contract = getPoolContractReadOnly();
      let debtWei = 0n;
      if (contract) {
        if (mode === 'BUSD') {
          const pos = await contract.getUserPositionPCOL(targetUser);
          debtWei = pos[1];
        } else {
          const pos = await contract.getUserPositionPBUSD(targetUser);
          debtWei = pos[1];
        }
      }
      if (debtWei > 0n) {
        const allow = await getTokenAllowance(repayAsset, user, pool);
        if (allow < debtWei) await approveToken(repayAsset, pool, ethers.MaxUint256);
      }
      const receipt = mode === 'BUSD' ? await liquidateBUSD(targetUser) : await liquidateCOL(targetUser);
      setTx({ status: 'success', hash: receipt.hash });
      setTargetUser('');
    } catch (err) {
      setTx({ status: 'error', hash: err?.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Liquidate 清算</h1>
      <p className="muted">健康因子 &lt; 1 的仓位可被清算。偿还其债务并获取抵押物（含奖励）。</p>
      {!user && <p className="muted">请先连接 MetaMask。</p>}
      {user && (
        <div className="card">
          <div className="form-group">
            <label>清算类型</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ maxWidth: 320, padding: '0.6rem 0.75rem', borderRadius: 8 }}
            >
              <option value="BUSD">清算 PCOL 仓位（你还 BUSD，得 PCOL）</option>
              <option value="COL">清算 PBUSD 仓位（你还 COL，得 PBUSD）</option>
            </select>
          </div>
          <p><strong>需用资产:</strong> {mode === 'BUSD' ? 'BUSD' : 'COL'}</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>被清算地址</label>
              <input
                type="text"
                value={targetUser}
                onChange={(e) => setTargetUser(e.target.value)}
                placeholder="0x..."
              />
            </div>
            <button type="submit" className="submit-btn" disabled={loading || !targetUser}>
              {loading ? '清算中...' : '执行清算'}
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
