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
  const withdrawable = pBalance;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !user) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      if (amountWei > withdrawable) throw new Error('Insufficient withdrawable balance (unlock collateral first)');
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
      <h1>Withdraw</h1>
      <p className="muted">Redeem COL with PCOL 1:1, or redeem BUSD with PBUSD 1:1. Only unlocked P tokens are withdrawable.</p>
      {!user && <p className="muted">Please connect MetaMask first.</p>}
      {user && (
        <div className="card">
          <div className="form-group">
            <label>Asset to Withdraw</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ maxWidth: 320, padding: '0.6rem 0.75rem', borderRadius: 8 }}
            >
              <option value="COL">PCOL -> Withdraw COL</option>
              <option value="BUSD">PBUSD -> Withdraw BUSD</option>
            </select>
          </div>
          <p><strong>Withdrawable {pSymbol}:</strong> {formatWei(withdrawable, decimals)}</p>
          {locked > 0n && (
            <p className="muted">Locked as collateral: {formatWei(locked, decimals)}. Unlock it first on the Borrow page.</p>
          )}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Amount</label>
              <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <button type="submit" className="submit-btn" disabled={loading || !amount}>
              {loading ? 'Withdrawing...' : `Withdraw ${mode === 'COL' ? 'COL' : 'BUSD'}`}
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
