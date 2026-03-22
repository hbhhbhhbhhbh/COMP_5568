import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  addresses,
  getTokenInfo,
  getTokenBalance,
  approveToken,
  liquidateBUSD,
  liquidateCOL,
  getPoolContractReadOnly,
  getTokenAllowance,
  getPoolParams,
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

const MAX_UINT = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;

export default function Liquidate() {
  const { user } = useWallet();
  const [list, setList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [decimals, setDecimals] = useState(18);
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [liquidating, setLiquidating] = useState(null);
  const [balanceBUSD, setBalanceBUSD] = useState(0n);
  const [balanceCOL, setBalanceCOL] = useState(0n);

  const pool = addresses.lendingPool;
  const col = addresses.collateralAsset;
  const busd = addresses.borrowAsset;

  const fetchLiquidatable = useCallback(async () => {
    if (!pool) return;
    setLoadingList(true);
    setList([]);
    try {
      const contract = getPoolContractReadOnly();
      if (!contract) {
        setLoadingList(false);
        return;
      }
      const [eventsPCOL, eventsPBUSD] = await Promise.all([
        contract.queryFilter(contract.filters.DepositCollateralPCOL()),
        contract.queryFilter(contract.filters.DepositCollateralPBUSD()),
      ]);
      const users = new Set();
      eventsPCOL.forEach((e) => { if (e.args?.user) users.add(e.args.user); });
      eventsPBUSD.forEach((e) => { if (e.args?.user) users.add(e.args.user); });

      const params = await getPoolParams();
      const bonusPct = params.liquidationBonus ? Number(params.liquidationBonus) / 100 : 10;

      const rows = [];
      for (const targetUser of users) {
        const [liqPCOL, liqPBUSD, posPCOL, posPBUSD, hfPCOL, hfPBUSD] = await Promise.all([
          contract.isLiquidatablePCOL(targetUser),
          contract.isLiquidatablePBUSD(targetUser),
          contract.getUserPositionPCOL(targetUser),
          contract.getUserPositionPBUSD(targetUser),
          contract.getHealthFactorPCOL(targetUser),
          contract.getHealthFactorPBUSD(targetUser),
        ]);
        const hfPCOLNum = hfPCOL != null && hfPCOL < MAX_UINT ? Number(hfPCOL) / 1e18 : null;
        const hfPBUSDNum = hfPBUSD != null && hfPBUSD < MAX_UINT ? Number(hfPBUSD) / 1e18 : null;

        if (liqPCOL && posPCOL[1] > 0n) {
          rows.push({
            targetUser,
            type: 'BUSD',
            debt: posPCOL[1],
            collateral: posPCOL[0],
            healthFactor: hfPCOLNum,
            liquidationBonusPct: bonusPct,
            repayAsset: busd,
            repaySymbol: 'BUSD',
          });
        }
        if (liqPBUSD && posPBUSD[1] > 0n) {
          rows.push({
            targetUser,
            type: 'COL',
            debt: posPBUSD[1],
            collateral: posPBUSD[0],
            healthFactor: hfPBUSDNum,
            liquidationBonusPct: bonusPct,
            repayAsset: col,
            repaySymbol: 'COL',
          });
        }
      }
      setList(rows);
    } catch (err) {
      console.warn('fetchLiquidatable', err);
      setList([]);
    } finally {
      setLoadingList(false);
    }
  }, [pool, busd, col]);

  useEffect(() => {
    fetchLiquidatable();
  }, [fetchLiquidatable]);

  useEffect(() => {
    if (!busd) return;
    getTokenInfo(busd).then((d) => setDecimals(d.decimals));
  }, [busd]);

  useEffect(() => {
    if (!user || !busd || !col) return;
    getTokenBalance(busd, user).then(setBalanceBUSD);
    getTokenBalance(col, user).then(setBalanceCOL);
  }, [user, busd, col]);

  const handleLiquidate = async (row) => {
    if (!user || !pool) return;
    setLiquidating(row.targetUser + row.type);
    setTx({ status: '', hash: '' });
    try {
      const debtWei = row.debt;
      const allow = await getTokenAllowance(row.repayAsset, user, pool);
      if (allow < debtWei) await approveToken(row.repayAsset, pool, ethers.MaxUint256);
      const receipt = row.type === 'BUSD' ? await liquidateBUSD(row.targetUser) : await liquidateCOL(row.targetUser);
      setTx({ status: 'success', hash: receipt.hash });
      fetchLiquidatable();
    } catch (err) {
      setTx({ status: 'error', hash: err?.message || 'Transaction failed' });
    } finally {
      setLiquidating(null);
    }
  };

  return (
    <div className="page">
      <h1>Liquidate 清算</h1>
      <p className="muted">
        健康系数 &lt; 1 的仓位会显示在下方。清算者必须用借款人借出的那种币来偿还债务并换取抵押物：抵押 PCOL 借 BUSD 的仓位 → 清算人用 BUSD 偿还，获得 PCOL；抵押 BUSD（PBUSD）借 COL 的仓位 → 清算人用 COL 偿还，获得 PBUSD（即用 COL 来“买”被清算者的 BUSD 抵押物）。偿还后获得对应抵押物及清算奖励。
      </p>
      {!user && <p className="muted">请先连接 MetaMask。</p>}
      {user && (
        <div className="card">
          <p className="muted" style={{ marginBottom: '1rem' }}>
            你的 BUSD 余额: <strong>{formatWei(balanceBUSD, decimals)}</strong>（用于清算「抵押 PCOL 借 BUSD」仓位，用 BUSD 买 PCOL）
            &nbsp;·&nbsp;
            你的 COL 余额: <strong>{formatWei(balanceCOL, decimals)}</strong>（用于清算「抵押 BUSD 借 COL」仓位，用 COL 买 PBUSD）
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <strong>可清算仓位（健康系数 &lt; 1）</strong>
            <button type="button" className="btn" onClick={fetchLiquidatable} disabled={loadingList}>
              {loadingList ? '加载中...' : '刷新列表'}
            </button>
          </div>
          {loadingList && <p className="muted">正在拉取抵押事件并筛选可清算账户…</p>}
          {!loadingList && list.length === 0 && <p className="muted">当前无可清算仓位。</p>}
          {!loadingList && list.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>目标账户</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>仓位类型</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>目标债务</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>抵押物</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>健康系数</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>清算奖励比例</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.targetUser + row.type} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.85rem' }} title={row.targetUser}>
                        {row.targetUser.slice(0, 6)}…{row.targetUser.slice(-4)}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {row.type === 'BUSD' ? 'PCOL→BUSD（用 BUSD 还债得 PCOL）' : 'PBUSD→COL（用 COL 还债得 PBUSD）'}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                        {formatWei(row.debt, decimals)} {row.repaySymbol}
                        {row.type === 'BUSD' && balanceBUSD < row.debt && (
                          <span className="danger" style={{ marginLeft: 4 }}>余额不足</span>
                        )}
                        {row.type === 'COL' && balanceCOL < row.debt && (
                          <span className="danger" style={{ marginLeft: 4 }}>余额不足</span>
                        )}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatWei(row.collateral, decimals)} {row.type === 'BUSD' ? 'PCOL' : 'PBUSD'}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{row.healthFactor != null ? row.healthFactor.toFixed(2) : '—'}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{row.liquidationBonusPct}%</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={
                            liquidating !== null ||
                            (row.type === 'BUSD' && balanceBUSD < row.debt) ||
                            (row.type === 'COL' && balanceCOL < row.debt)
                          }
                          onClick={() => handleLiquidate(row)}
                          title={
                            row.type === 'BUSD' && balanceBUSD < row.debt
                              ? 'BUSD 余额不足，需用 BUSD 偿还'
                              : row.type === 'COL' && balanceCOL < row.debt
                                ? 'COL 余额不足，需用 COL 偿还'
                                : undefined
                          }
                        >
                          {liquidating === row.targetUser + row.type ? '清算中...' : '清算'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
