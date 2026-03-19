import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  getAccount,
  addresses,
  getLendingPoolContract,
  getHealthFactor,
  getUserPosition,
  getTokenBalance,
  getTokenInfo,
  getTokenAllowance,
  approveToken,
  liquidate,
} from '../utils/web3';
import './Page.css';

export default function LiquidatePage() {
  const [user, setUser] = useState(null);
  const [targetAddress, setTargetAddress] = useState('');
  const [targetPosition, setTargetPosition] = useState({ collateral: 0n, debt: 0n });
  const [targetLiquidatable, setTargetLiquidatable] = useState(false);
  const [targetHf, setTargetHf] = useState(null);
  const [myDebtBalance, setMyDebtBalance] = useState(0n);
  const [decimalsCol, setDecimalsCol] = useState(18);
  const [decimalsDebt, setDecimalsDebt] = useState(18);
  const [symbolCol, setSymbolCol] = useState('COL');
  const [symbolDebt, setSymbolDebt] = useState('USD');
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAccount().then(setUser);
  }, []);

  useEffect(() => {
    if (!addresses.collateralAsset || !addresses.borrowAsset) return;
    getTokenInfo(addresses.collateralAsset).then((i) => {
      setDecimalsCol(i.decimals);
      setSymbolCol(i.symbol);
    });
    getTokenInfo(addresses.borrowAsset).then((i) => {
      setDecimalsDebt(i.decimals);
      setSymbolDebt(i.symbol);
    });
  }, []);

  useEffect(() => {
    if (!targetAddress || !ethers.isAddress(targetAddress)) {
      setTargetPosition({ collateral: 0n, debt: 0n });
      setTargetLiquidatable(false);
      setTargetHf(null);
      return;
    }
    const pool = getLendingPoolContract(false);
    const liqPromise = pool ? pool.isLiquidatable(targetAddress) : Promise.resolve(false);
    Promise.all([
      getUserPosition(targetAddress),
      getHealthFactor(targetAddress),
      liqPromise,
    ]).then(([pos, hf, liq]) => {
      setTargetPosition(pos);
      setTargetHf(hf);
      setTargetLiquidatable(liq ?? false);
    });
  }, [targetAddress]);

  useEffect(() => {
    if (!user || !addresses.borrowAsset) return;
    getTokenBalance(addresses.borrowAsset, user).then(setMyDebtBalance);
  }, [user]);

  const handleLiquidate = async (e) => {
    e.preventDefault();
    if (!targetAddress || !targetLiquidatable || !user) return;
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const receipt = await liquidate(
        addresses.collateralAsset,
        addresses.borrowAsset,
        targetAddress
      );
      setTx({ status: 'success', hash: receipt.hash });
      const pool2 = getLendingPoolContract(false);
      const liqPromise2 = pool2 ? pool2.isLiquidatable(targetAddress) : Promise.resolve(false);
      const [pos, hf, liq] = await Promise.all([
        getUserPosition(targetAddress),
        getHealthFactor(targetAddress),
        liqPromise2,
      ]);
      setTargetPosition(pos);
      setTargetHf(hf);
      setTargetLiquidatable(liq ?? false);
      getTokenBalance(addresses.borrowAsset, user).then(setMyDebtBalance);
    } catch (err) {
      setTx({ status: 'error', hash: err.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  const hfDisplay = targetHf != null ? Number(ethers.formatUnits(targetHf, 18)).toFixed(2) : '—';
  const needsApproval = targetPosition.debt > 0n;
  const handleApprove = async () => {
    if (!user) return;
    await approveToken(addresses.borrowAsset, addresses.lendingPool, ethers.MaxUint256);
    const bal = await getTokenBalance(addresses.borrowAsset, user);
    setMyDebtBalance(bal);
  };

  return (
    <div className="page">
      <h1>Liquidate</h1>
      <p className="muted">Liquidate unhealthy positions (health factor &lt; 1). You repay their debt and receive collateral at a 10% bonus.</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && (
        <div className="card">
          <p><strong>Your {symbolDebt} balance:</strong> {ethers.formatUnits(myDebtBalance, decimalsDebt)} (need this to repay target&apos;s debt)</p>
          <form onSubmit={(e) => { e.preventDefault(); }}>
            <div className="form-group">
              <label>Target address (unhealthy position)</label>
              <input
                type="text"
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                placeholder="0x..."
              />
            </div>
          </form>
          {targetAddress && ethers.isAddress(targetAddress) && (
            <div className="list-item" style={{ marginTop: '1rem' }}>
              <div>
                <p><strong>Target collateral:</strong> {ethers.formatUnits(targetPosition.collateral, decimalsCol)} {symbolCol}</p>
                <p><strong>Target debt:</strong> {ethers.formatUnits(targetPosition.debt, decimalsDebt)} {symbolDebt}</p>
                <p><strong>Health factor:</strong> {hfDisplay}</p>
                <p className={targetLiquidatable ? 'danger' : 'success'}>
                  {targetLiquidatable ? 'Liquidatable' : 'Not liquidatable'}
                </p>
              </div>
              <div>
                {needsApproval && (
                  <button type="button" className="btn" onClick={handleApprove} style={{ marginRight: 8 }}>
                    Approve {symbolDebt}
                  </button>
                )}
                <button
                  type="button"
                  className="submit-btn"
                  disabled={loading || !targetLiquidatable || myDebtBalance < targetPosition.debt}
                  onClick={handleLiquidate}
                >
                  {loading ? 'Liquidating...' : 'Liquidate'}
                </button>
              </div>
            </div>
          )}
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
