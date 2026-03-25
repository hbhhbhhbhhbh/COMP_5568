import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  getBorrowRatePerBlockBUSD,
  getBorrowRatePerBlockCOL,
  getSupplyAPYBUSD,
  getSupplyAPYCOL,
  BLOCKS_PER_YEAR,
} from '../utils/web3';
import './Page.css';

const BLOCKS_PER_DAY = Math.round(BLOCKS_PER_YEAR / 365);

/** Compound growth: (1 + r)^n, r = per-block rate, n = number of blocks */
function compoundGrowth(rPerBlock, nBlocks) {
  if (nBlocks <= 0) return 1;
  return Math.pow(1 + rPerBlock, nBlocks);
}

export default function InterestRateTest() {
  const [loading, setLoading] = useState(true);
  const [ratePerBlockBUSD, setRatePerBlockBUSD] = useState(0n);
  const [ratePerBlockCOL, setRatePerBlockCOL] = useState(0n);
  const [supplyAPYBUSD, setSupplyAPYBUSD] = useState(0n);
  const [supplyAPYCOL, setSupplyAPYCOL] = useState(0n);

  // Borrow interest simulation
  const [borrowAsset, setBorrowAsset] = useState('BUSD');
  const [borrowAmount, setBorrowAmount] = useState('1000');
  const [borrowBlocks, setBorrowBlocks] = useState(String(BLOCKS_PER_DAY)); // default: 1 day

  // Supply interest simulation
  const [supplyAsset, setSupplyAsset] = useState('BUSD');
  const [supplyAmount, setSupplyAmount] = useState('1000');
  const [supplyBlocks, setSupplyBlocks] = useState(String(BLOCKS_PER_DAY));

  const load = async () => {
    setLoading(true);
    try {
      const [rB, rC, sB, sC] = await Promise.all([
        getBorrowRatePerBlockBUSD(),
        getBorrowRatePerBlockCOL(),
        getSupplyAPYBUSD(),
        getSupplyAPYCOL(),
      ]);
      setRatePerBlockBUSD(rB);
      setRatePerBlockCOL(rC);
      setSupplyAPYBUSD(sB);
      setSupplyAPYCOL(sC);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const dec = 18;
  const borrowAmountWei = (() => {
    try {
      const a = ethers.parseUnits(borrowAmount || '0', dec);
      return Number(a) / 1e18;
    } catch {
      return 0;
    }
  })();
  const supplyAmountWei = (() => {
    try {
      const a = ethers.parseUnits(supplyAmount || '0', dec);
      return Number(a) / 1e18;
    } catch {
      return 0;
    }
  })();
  const nBorrowBlocks = Math.max(0, parseInt(borrowBlocks, 10) || 0);
  const nSupplyBlocks = Math.max(0, parseInt(supplyBlocks, 10) || 0);

  const borrowRateNum = borrowAsset === 'BUSD' ? Number(ratePerBlockBUSD) / 1e18 : Number(ratePerBlockCOL) / 1e18;
  const borrowGrowth = compoundGrowth(borrowRateNum, nBorrowBlocks);
  const debtAfter = borrowAmountWei * borrowGrowth;
  const borrowInterest = debtAfter - borrowAmountWei;

  const supplyAPYWei = supplyAsset === 'BUSD' ? supplyAPYBUSD : supplyAPYCOL;
  const supplyRatePerBlock = Number(supplyAPYWei) / 1e18 / BLOCKS_PER_YEAR;
  const supplyGrowth = compoundGrowth(supplyRatePerBlock, nSupplyBlocks);
  const valueAfter = supplyAmountWei * supplyGrowth;
  const supplyInterest = valueAfter - supplyAmountWei;

  return (
    <div className="page">
      <h1>Rate Test: Debt / Supply Interest</h1>
      <p className="muted">
        Using current on-chain rates, estimate debt growth after N blocks and supply growth after N blocks.
      </p>
      <button type="button" className="submit-btn" onClick={load} disabled={loading} style={{ marginBottom: '1rem' }}>
        {loading ? 'Loading...' : 'Refresh Rates'}
      </button>

      {loading && ratePerBlockBUSD === 0n && <p className="muted">Connecting and loading...</p>}

      <div className="card">
        <h3>Borrow Interest</h3>
        <p className="muted">Debt compounds per block: Debt(n) = Principal x (1 + ratePerBlock)^n</p>
        <div className="form-group">
          <label>Asset</label>
          <select value={borrowAsset} onChange={(e) => setBorrowAsset(e.target.value)} style={{ maxWidth: 120, padding: '0.5rem' }}>
            <option value="BUSD">BUSD</option>
            <option value="COL">COL</option>
          </select>
        </div>
        <div className="form-group">
          <label>Borrow Amount (Initial Debt)</label>
          <input
            type="text"
            value={borrowAmount}
            onChange={(e) => setBorrowAmount(e.target.value)}
            placeholder="1000"
          />
        </div>
        <div className="form-group">
          <label>Number of Blocks ({BLOCKS_PER_DAY} blocks ≈ 1 day)</label>
          <input
            type="text"
            value={borrowBlocks}
            onChange={(e) => setBorrowBlocks(e.target.value)}
            placeholder={String(BLOCKS_PER_DAY)}
          />
        </div>
        <p><strong>Current Borrow Rate per Block:</strong> {(borrowRateNum * 100).toFixed(6)}%</p>
        <p><strong>After {nBorrowBlocks} blocks:</strong></p>
        <p>Debt = <strong>{debtAfter.toFixed(6)}</strong> {borrowAsset} &nbsp;(interest ≈ <strong>{borrowInterest.toFixed(6)}</strong> {borrowAsset})</p>
      </div>

      <div className="card">
        <h3>Supply Interest</h3>
        <p className="muted">Supply value compounds using per-block rate derived from Supply APY</p>
        <div className="form-group">
          <label>Asset</label>
          <select value={supplyAsset} onChange={(e) => setSupplyAsset(e.target.value)} style={{ maxWidth: 120, padding: '0.5rem' }}>
            <option value="BUSD">BUSD</option>
            <option value="COL">COL</option>
          </select>
        </div>
        <div className="form-group">
          <label>Supply Amount</label>
          <input
            type="text"
            value={supplyAmount}
            onChange={(e) => setSupplyAmount(e.target.value)}
            placeholder="1000"
          />
        </div>
        <div className="form-group">
          <label>Number of Blocks</label>
          <input
            type="text"
            value={supplyBlocks}
            onChange={(e) => setSupplyBlocks(e.target.value)}
            placeholder={String(BLOCKS_PER_DAY)}
          />
        </div>
        <p><strong>Current Supply APY:</strong> {(Number(supplyAPYWei) / 1e18 * 100).toFixed(2)}% &nbsp; -> per block ≈ {(supplyRatePerBlock * 100).toFixed(6)}%</p>
        <p><strong>After {nSupplyBlocks} blocks:</strong></p>
        <p>Value = <strong>{valueAfter.toFixed(6)}</strong> {supplyAsset} &nbsp;(interest ≈ <strong>{supplyInterest.toFixed(6)}</strong> {supplyAsset})</p>
      </div>

      <div className="card">
        <h3>Quick Conversion</h3>
        <p>1 day ≈ {BLOCKS_PER_DAY} blocks &nbsp;|&nbsp; 1 year ≈ {BLOCKS_PER_YEAR} blocks</p>
      </div>
    </div>
  );
}
