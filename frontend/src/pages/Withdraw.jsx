import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  addresses,
  getTokenBalance,
  getTokenInfo,
  withdrawCOL,
  withdrawBUSD,
  getUserPositionPCOL,
  getUserPositionPBUSD,
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

export default function Withdraw() {
  const { user } = useWallet();
  const [mode, setMode] = useState('COL'); // 'COL' | 'BUSD'
  const [amount, setAmount] = useState('');
  const [pBalance, setPBalance] = useState(0n);
  const [decimals, setDecimals] = useState(18);
  const [pSymbol, setPSymbol] = useState('PCOL');
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);
  const [posPCOL, setPosPCOL] = useState({ collateralPCOL: 0n, debtBUSD: 0n });
  const [posPBUSD, setPosPBUSD] = useState({ collateralPBUSD: 0n, debtCOL: 0n });

  const pcol = addresses.pcolToken;
  const pbusd = addresses.pbusdToken;
  const pToken = mode === 'COL' ? pcol : pbusd;

  useEffect(() => {
    if (!pToken) return;
    getTokenInfo(pToken).then((d) => {
      setDecimals(d.decimals);
      setPSymbol(d.symbol);
    });
  }, [pToken]);

  useEffect(() => {
    if (!user || !pcol || !pbusd) return;
    Promise.all([
      getTokenBalance(pcol, user),
      getTokenBalance(pbusd, user),
      getUserPositionPCOL(user),
      getUserPositionPBUSD(user),
    ]).then(([pc, pb, posP, posB]) => {
      setPosPCOL(posP);
      setPosPBUSD(posB);
      setPBalance(mode === 'COL' ? pc : pb);
    });
  }, [user, pcol, pbusd, mode]);

  useEffect(() => {
    if (!user || !pToken) return;
    getTokenBalance(pToken, user).then(setPBalance);
  }, [user, pToken]);

  const locked = mode === 'COL' ? posPCOL.collateralPCOL : posPBUSD.collateralPBUSD;
  const withdrawable = pBalance; // 未锁定的 P 币可提取

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !user) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      if (amountWei > withdrawable) throw new Error('可提取余额不足（先解除抵押）');
      const receipt = mode === 'COL' ? await withdrawCOL(amountWei) : await withdrawBUSD(amountWei);
      setTx({ status: 'success', hash: receipt.hash });
      setAmount('');
      const [pc, pb] = await Promise.all([getTokenBalance(pcol, user), getTokenBalance(pbusd, user)]);
      setPBalance(mode === 'COL' ? pc : pb);
    } catch (err) {
      setTx({ status: 'error', hash: err?.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Withdraw 取回</h1>
      <p className="muted">用 PCOL 1:1 取回 COL，用 PBUSD 1:1 取回 BUSD。仅未锁定的 P 币可提取。</p>
      {!user && <p className="muted">请先连接 MetaMask。</p>}
      {user && (
        <div className="card">
          <div className="form-group">
            <label>取回资产</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ maxWidth: 320, padding: '0.6rem 0.75rem', borderRadius: 8 }}
            >
              <option value="COL">PCOL → 取回 COL</option>
              <option value="BUSD">PBUSD → 取回 BUSD</option>
            </select>
          </div>
          <p><strong>可提取 {pSymbol}:</strong> {formatWei(withdrawable, decimals)}</p>
          {locked > 0n && (
            <p className="muted">已锁定（抵押中）: {formatWei(locked, decimals)}。需在 Borrow 页先解除抵押。</p>
          )}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>数量</label>
              <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <button type="submit" className="submit-btn" disabled={loading || !amount}>
              {loading ? '取回中...' : `取回 ${mode === 'COL' ? 'COL' : 'BUSD'}`}
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
