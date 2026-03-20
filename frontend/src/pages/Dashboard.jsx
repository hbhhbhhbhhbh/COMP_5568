import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  addresses,
  getTokenBalance,
  getTokenInfo,
  getUserPositionPCOL,
  getUserPositionPBUSD,
  getHealthFactorPCOL,
  getHealthFactorPBUSD,
  getPriceCOLIn8,
  getPriceBUSDIn8,
  getUtilizationBUSD,
  getUtilizationCOL,
  getBorrowAPYBUSD,
  getBorrowAPYCOL,
  getSupplyAPYBUSD,
  getSupplyAPYCOL,
} from '../utils/web3';
import { useWallet } from '../context/WalletContext';
import './Page.css';

function fmt(wei, d = 18) {
  if (wei == null) return '0';
  try {
    return typeof wei === 'bigint' ? ethers.formatUnits(wei, d) : String(wei);
  } catch {
    return '0';
  }
}

function fmtPct(wei) {
  if (wei == null || wei === 0n) return '0%';
  const n = Number(wei) / 1e18;
  return (n * 100).toFixed(2) + '%';
}

const MAX_UINT = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;

export default function Dashboard() {
  const { user } = useWallet();
  const [colBal, setColBal] = useState(0n);
  const [busdBal, setBusdBal] = useState(0n);
  const [pcolBal, setPcolBal] = useState(0n);
  const [pbusdBal, setPbusdBal] = useState(0n);
  const [posPCOL, setPosPCOL] = useState({ collateralPCOL: 0n, debtBUSD: 0n });
  const [posPBUSD, setPosPBUSD] = useState({ collateralPBUSD: 0n, debtCOL: 0n });
  const [hfPCOL, setHfPCOL] = useState(null);
  const [hfPBUSD, setHfPBUSD] = useState(null);
  const [priceCOL, setPriceCOL] = useState(0n);
  const [priceBUSD, setPriceBUSD] = useState(0n);
  const [utilBUSD, setUtilBUSD] = useState(0n);
  const [utilCOL, setUtilCOL] = useState(0n);
  const [supplyAPYBUSD, setSupplyAPYBUSD] = useState(0n);
  const [supplyAPYCOL, setSupplyAPYCOL] = useState(0n);
  const [borrowAPYBUSD, setBorrowAPYBUSD] = useState(0n);
  const [borrowAPYCOL, setBorrowAPYCOL] = useState(0n);
  const [dec, setDec] = useState(18);
  const col = addresses.collateralAsset;
  const busd = addresses.borrowAsset;
  const pcol = addresses.pcolToken;
  const pbusd = addresses.pbusdToken;

  useEffect(() => {
    if (!user || !col) return;
    getTokenInfo(col).then((d) => setDec(d.decimals));
  }, [user, col]);

  useEffect(() => {
    if (!user || !col || !busd || !pcol || !pbusd) return;
    Promise.all([
      getTokenBalance(col, user),
      getTokenBalance(busd, user),
      getTokenBalance(pcol, user),
      getTokenBalance(pbusd, user),
      getUserPositionPCOL(user),
      getUserPositionPBUSD(user),
      getHealthFactorPCOL(user),
      getHealthFactorPBUSD(user),
      getPriceCOLIn8(),
      getPriceBUSDIn8(),
      getUtilizationBUSD(),
      getUtilizationCOL(),
      getSupplyAPYBUSD(),
      getSupplyAPYCOL(),
      getBorrowAPYBUSD(),
      getBorrowAPYCOL(),
    ]).then(([c, b, pc, pb, pP, pB, hfP, hfB, prCol, prBusd, uB, uC, sB, sC, brB, brC]) => {
      setColBal(c);
      setBusdBal(b);
      setPcolBal(pc);
      setPbusdBal(pb);
      setPosPCOL(pP);
      setPosPBUSD(pB);
      setHfPCOL(hfP);
      setHfPBUSD(hfB);
      setPriceCOL(prCol);
      setPriceBUSD(prBusd);
      setUtilBUSD(uB);
      setUtilCOL(uC);
      setSupplyAPYBUSD(sB);
      setSupplyAPYCOL(sC);
      setBorrowAPYBUSD(brB);
      setBorrowAPYCOL(brC);
    });
  }, [user, col, busd, pcol, pbusd]);

  const priceColNum = priceCOL > 0n ? Number(priceCOL) / 1e8 : 0;
  const priceBusdNum = priceBUSD > 0n ? Number(priceBUSD) / 1e8 : 1;
  const totalCollateralUsd =
    (Number(posPCOL.collateralPCOL) * priceColNum) / 1e18 +
    (Number(posPBUSD.collateralPBUSD) * priceBusdNum) / 1e18;
  const totalDebtUsd =
    (Number(posPCOL.debtBUSD) * priceBusdNum) / 1e18 +
    (Number(posPBUSD.debtCOL) * priceColNum) / 1e18;
  const hfPCOLNum = hfPCOL != null && hfPCOL < MAX_UINT ? Number(hfPCOL) / 1e18 : null;
  const hfPBUSDNum = hfPBUSD != null && hfPBUSD < MAX_UINT ? Number(hfPBUSD) / 1e18 : null;

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="muted">Pool COL/BUSD. PCOL/PBUSD are pool receipts. Interest accrues per block; rates depend on utilization.</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && (
        <>
          <div className="card">
            <h3>Pool rates</h3>
            <p><strong>Utilization:</strong> BUSD {fmtPct(utilBUSD)} | COL {fmtPct(utilCOL)}</p>
            <p><strong>Supply APY:</strong> BUSD {fmtPct(supplyAPYBUSD)} | COL {fmtPct(supplyAPYCOL)}</p>
            <p><strong>Borrow APY:</strong> BUSD {fmtPct(borrowAPYBUSD)} | COL {fmtPct(borrowAPYCOL)}</p>
          </div>
          <div className="card">
            <h3>Your position</h3>
            <p><strong>Total Collateral (USD):</strong> ${totalCollateralUsd.toFixed(2)}</p>
            <p><strong>Total Debt (USD):</strong> ${totalDebtUsd.toFixed(2)}</p>
            <p><strong>Health Factor:</strong> PCOL→BUSD {hfPCOLNum != null ? hfPCOLNum.toFixed(2) : '—'} {hfPCOLNum != null && hfPCOLNum < 1 && <span className="danger">(liquidatable)</span>} | PBUSD→COL {hfPBUSDNum != null ? hfPBUSDNum.toFixed(2) : '—'} {hfPBUSDNum != null && hfPBUSDNum < 1 && <span className="danger">(liquidatable)</span>}</p>
          </div>
          <div className="card">
            <h3>Wallet</h3>
            <p>COL: {fmt(colBal, dec)} | BUSD: {fmt(busdBal, dec)} | PCOL: {fmt(pcolBal, dec)} | PBUSD: {fmt(pbusdBal, dec)}</p>
          </div>
          {(posPCOL.collateralPCOL > 0n || posPCOL.debtBUSD > 0n) && (
            <div className="card">
              <h3>Position: PCOL / BUSD debt</h3>
              <p>Locked PCOL: {fmt(posPCOL.collateralPCOL, dec)} | Debt BUSD: {fmt(posPCOL.debtBUSD, dec)} | Borrow APY: {fmtPct(borrowAPYBUSD)}</p>
            </div>
          )}
          {(posPBUSD.collateralPBUSD > 0n || posPBUSD.debtCOL > 0n) && (
            <div className="card">
              <h3>Position: PBUSD / COL debt</h3>
              <p>Locked PBUSD: {fmt(posPBUSD.collateralPBUSD, dec)} | Debt COL: {fmt(posPBUSD.debtCOL, dec)} | Borrow APY: {fmtPct(borrowAPYCOL)}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
