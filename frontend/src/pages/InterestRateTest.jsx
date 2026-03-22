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

/** 复利：(1 + r)^n，r 为每 block 利率（小数），n 为 block 数 */
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

  // 借款利息测试
  const [borrowAsset, setBorrowAsset] = useState('BUSD');
  const [borrowAmount, setBorrowAmount] = useState('1000');
  const [borrowBlocks, setBorrowBlocks] = useState(String(BLOCKS_PER_DAY)); // 默认 1 天

  // 存款利息测试
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
      <h1>利率测试：债务 / 存款利息</h1>
      <p className="muted">
        用当前链上利率，计算「借入一笔钱经过 N 个 block 后应付多少利息」和「存入一笔钱经过 N 个 block 后能拿多少利息」。
      </p>
      <button type="button" className="submit-btn" onClick={load} disabled={loading} style={{ marginBottom: '1rem' }}>
        {loading ? '加载中...' : '刷新利率'}
      </button>

      {loading && ratePerBlockBUSD === 0n && <p className="muted">连接并加载中…</p>}

      <div className="card">
        <h3>借款利息</h3>
        <p className="muted">债务按每 block 复利：债务(n) = 初始 × (1 + ratePerBlock)^n</p>
        <div className="form-group">
          <label>资产</label>
          <select value={borrowAsset} onChange={(e) => setBorrowAsset(e.target.value)} style={{ maxWidth: 120, padding: '0.5rem' }}>
            <option value="BUSD">BUSD</option>
            <option value="COL">COL</option>
          </select>
        </div>
        <div className="form-group">
          <label>借款金额（初始债务）</label>
          <input
            type="text"
            value={borrowAmount}
            onChange={(e) => setBorrowAmount(e.target.value)}
            placeholder="1000"
          />
        </div>
        <div className="form-group">
          <label>经过 block 数（约 {BLOCKS_PER_DAY} block ≈ 1 天）</label>
          <input
            type="text"
            value={borrowBlocks}
            onChange={(e) => setBorrowBlocks(e.target.value)}
            placeholder={String(BLOCKS_PER_DAY)}
          />
        </div>
        <p><strong>当前每 block 借款利率：</strong> {(borrowRateNum * 100).toFixed(6)}%</p>
        <p><strong>经过 {nBorrowBlocks} block 后：</strong></p>
        <p>债务 = <strong>{debtAfter.toFixed(6)}</strong> {borrowAsset} &nbsp;（利息 ≈ <strong>{borrowInterest.toFixed(6)}</strong> {borrowAsset}）</p>
      </div>

      <div className="card">
        <h3>存款利息</h3>
        <p className="muted">存款价值按 Supply APY 折算成每 block 利率后复利增长</p>
        <div className="form-group">
          <label>资产</label>
          <select value={supplyAsset} onChange={(e) => setSupplyAsset(e.target.value)} style={{ maxWidth: 120, padding: '0.5rem' }}>
            <option value="BUSD">BUSD</option>
            <option value="COL">COL</option>
          </select>
        </div>
        <div className="form-group">
          <label>存款金额</label>
          <input
            type="text"
            value={supplyAmount}
            onChange={(e) => setSupplyAmount(e.target.value)}
            placeholder="1000"
          />
        </div>
        <div className="form-group">
          <label>经过 block 数</label>
          <input
            type="text"
            value={supplyBlocks}
            onChange={(e) => setSupplyBlocks(e.target.value)}
            placeholder={String(BLOCKS_PER_DAY)}
          />
        </div>
        <p><strong>当前 Supply APY：</strong> {(Number(supplyAPYWei) / 1e18 * 100).toFixed(2)}% &nbsp; → 每 block ≈ {(supplyRatePerBlock * 100).toFixed(6)}%</p>
        <p><strong>经过 {nSupplyBlocks} block 后：</strong></p>
        <p>价值 = <strong>{valueAfter.toFixed(6)}</strong> {supplyAsset} &nbsp;（利息 ≈ <strong>{supplyInterest.toFixed(6)}</strong> {supplyAsset}）</p>
      </div>

      <div className="card">
        <h3>快捷：按天数换算 block</h3>
        <p>1 天 ≈ {BLOCKS_PER_DAY} blocks &nbsp;|&nbsp; 1 年 ≈ {BLOCKS_PER_YEAR} blocks</p>
      </div>
    </div>
  );
}
