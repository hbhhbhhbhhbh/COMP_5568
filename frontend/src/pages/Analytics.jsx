import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  getUtilizationRate,
  getLendingPoolContract,
  addresses,
} from '../utils/web3';
import './Page.css';

const STORAGE_KEY = 'defi-lending-analytics';

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHistory(entry) {
  const history = loadHistory();
  const next = [...history, entry].slice(-100);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export default function AnalyticsPage() {
  const [utilization, setUtilization] = useState(null);
  const [totalCollateral, setTotalCollateral] = useState(null);
  const [totalBorrowed, setTotalBorrowed] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const contract = getLendingPoolContract(false);
      if (!contract || !addresses.lendingPool) {
        setLoading(false);
        return;
      }
      try {
        const [util, totalCol, totalBor] = await Promise.all([
          contract.getUtilizationRate(),
          contract.totalCollateral(),
          contract.totalBorrowed(),
        ]);
        if (cancelled) return;
        setUtilization(util);
        setTotalCollateral(totalCol);
        setTotalBorrowed(totalBor);
        const entry = {
          time: new Date().toISOString(),
          utilization: Number(util) / 100,
          totalCollateral: totalCol.toString(),
          totalBorrowed: totalBor.toString(),
        };
        saveHistory(entry);
        setHistory(loadHistory());
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const utilDisplay = utilization != null ? (Number(utilization) / 100).toFixed(2) + '%' : '—';
  const chartData = history.map((h, i) => ({
    name: new Date(h.time).toLocaleTimeString(),
    utilization: h.utilization,
    index: i,
  }));
  const pieData = [
    { name: 'Borrowed', value: totalBorrowed ? Number(totalBorrowed) : 0, color: '#ff6b6b' },
    { name: 'Available', value: totalCollateral && totalBorrowed ? Number(totalCollateral) - Number(totalBorrowed) : Number(totalCollateral || 0), color: '#00d4aa' },
  ].filter((d) => d.value > 0);

  return (
    <div className="page">
      <h1>Analytics</h1>
      <p className="muted">Utilization rate and historical snapshot (stored in localStorage).</p>
      {loading && <p className="muted">Loading...</p>}
      {!loading && (
        <>
          <section className="card grid-2">
            <div>
              <h3>Current metrics</h3>
              <p><strong>Utilization rate:</strong> {utilDisplay}</p>
              <p><strong>Total collateral (raw):</strong> {totalCollateral != null ? totalCollateral.toString() : '—'}</p>
              <p><strong>Total borrowed (raw):</strong> {totalBorrowed != null ? totalBorrowed.toString() : '—'}</p>
            </div>
            <div>
              <h3>APY (simplified)</h3>
              <p className="muted">APY can be derived from utilization and reward rate. Here we show utilization only.</p>
              <p><strong>Utilization:</strong> {utilDisplay}</p>
            </div>
          </section>
          {chartData.length > 0 && (
            <section className="card">
              <h3>Utilization over time</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(v) => v + '%'} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
                      formatter={(v) => [v + '%', 'Utilization']}
                    />
                    <Line type="monotone" dataKey="utilization" stroke="var(--accent)" strokeWidth={2} dot={false} name="Utilization %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
          {pieData.length > 0 && (
            <section className="card">
              <h3>Pool composition (raw values)</h3>
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
