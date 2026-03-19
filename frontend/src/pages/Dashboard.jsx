import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';
import {
  getAccount,
  getUserPosition,
  getHealthFactor,
  getUtilizationRate,
  getTokenBalance,
  getTokenInfo,
  getPrice,
  addresses,
} from '../utils/web3';
import './Page.css';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [position, setPosition] = useState({ collateral: 0n, debt: 0n });
  const [healthFactor, setHealthFactor] = useState(null);
  const [utilization, setUtilization] = useState(null);
  const [collateralBalance, setCollateralBalance] = useState(0n);
  const [borrowBalance, setBorrowBalance] = useState(0n);
  const [collateralInfo, setCollateralInfo] = useState({ decimals: 18, symbol: 'COL' });
  const [borrowInfo, setBorrowInfo] = useState({ decimals: 18, symbol: 'USD' });
  const [collateralPrice, setCollateralPrice] = useState(null);
  const [borrowPrice, setBorrowPrice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const acc = await getAccount();
      if (cancelled) return;
      setUser(acc);
      if (!acc || !addresses.lendingPool) {
        setLoading(false);
        return;
      }
      try {
        const [pos, hf, util, colBal, borBal, colInfo, borInfo, colPr, borPr] = await Promise.all([
          getUserPosition(acc),
          getHealthFactor(acc),
          getUtilizationRate(),
          getTokenBalance(addresses.collateralAsset, acc),
          getTokenBalance(addresses.borrowAsset, acc),
          getTokenInfo(addresses.collateralAsset),
          getTokenInfo(addresses.borrowAsset),
          addresses.collateralAsset ? getPrice(addresses.collateralAsset) : null,
          addresses.borrowAsset ? getPrice(addresses.borrowAsset) : null,
        ]);
        if (cancelled) return;
        setPosition(pos);
        setHealthFactor(hf);
        setUtilization(util);
        setCollateralBalance(colBal);
        setBorrowBalance(borBal);
        setCollateralInfo(colInfo);
        setBorrowInfo(borInfo);
        setCollateralPrice(colPr);
        setBorrowPrice(borPr);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const formatToken = (wei, decimals) => (decimals !== undefined ? ethers.formatUnits(wei, decimals) : ethers.formatEther(wei));
  const hfDisplay = healthFactor != null ? (Number(ethers.formatUnits(healthFactor, 18))).toFixed(2) : '—';
  const utilDisplay = utilization != null ? (Number(utilization) / 100).toFixed(2) + '%' : '—';
  const collateralValue = position.collateral && collateralPrice
    ? Number(ethers.formatUnits(position.collateral * collateralPrice, collateralInfo.decimals + 8))
    : 0;
  const debtValue = position.debt && borrowPrice
    ? Number(ethers.formatUnits(position.debt * borrowPrice, borrowInfo.decimals + 8))
    : 0;
  const isLiquidatable = healthFactor != null && healthFactor < ethers.parseUnits('1', 18);

  if (loading) {
    return <div className="page"><p className="muted">Loading...</p></div>;
  }

  return (
    <div className="page">
      <h1>Dashboard</h1>
      {!user && (
        <p className="muted">Connect MetaMask to see your position and take action.</p>
      )}
      {user && (
        <>
          <section className="card grid-2">
            <div>
              <h3>Your position</h3>
              <p><strong>Collateral:</strong> {formatToken(position.collateral, collateralInfo.decimals)} {collateralInfo.symbol}</p>
              <p><strong>Debt:</strong> {formatToken(position.debt, borrowInfo.decimals)} {borrowInfo.symbol}</p>
              <p><strong>Collateral value (USD):</strong> ${collateralValue.toFixed(2)}</p>
              <p><strong>Debt value (USD):</strong> ${debtValue.toFixed(2)}</p>
            </div>
            <div>
              <h3>Health factor</h3>
              <p className={isLiquidatable ? 'danger' : 'success'}>
                Health factor: {hfDisplay} {isLiquidatable && '(Liquidatable)'}
              </p>
              <p className="muted">Utilization rate: {utilDisplay}</p>
            </div>
          </section>
          <section className="card">
            <h3>Wallet balances</h3>
            <p><strong>{collateralInfo.symbol}:</strong> {formatToken(collateralBalance, collateralInfo.decimals)}</p>
            <p><strong>{borrowInfo.symbol}:</strong> {formatToken(borrowBalance, borrowInfo.decimals)}</p>
          </section>
          <div className="actions">
            <Link to="/deposit" className="btn btn-primary">Deposit</Link>
            <Link to="/borrow" className="btn">Borrow</Link>
            <Link to="/repay" className="btn">Repay</Link>
            <Link to="/withdraw" className="btn">Withdraw</Link>
            <Link to="/flash-loan" className="btn">Flash Loan</Link>
            <Link to="/liquidate" className="btn">Liquidate</Link>
          </div>
        </>
      )}
    </div>
  );
}
