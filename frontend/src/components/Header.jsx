import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { connectWallet, getChainId } from '../utils/web3';
import { useWallet } from '../context/WalletContext';
import './Header.css';

export default function Header() {
  const { user, refreshUser } = useWallet();
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const location = useLocation();

  useEffect(() => {
    getChainId().then(setChainId);
  }, [user]);

  const handleConnect = async () => {
    console.log('[DeFi] Header handleConnect start');
    setConnecting(true);
    setError('');
    try {
      await connectWallet();
      const acc = await refreshUser();
      console.log('[DeFi] Header connect success', { account: acc ? `${acc.slice(0, 8)}...` : null });
    } catch (e) {
      console.warn('[DeFi] Header connect failed', e?.message || e);
      setError(e.message || 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const shortAddress = user ? `${user.slice(0, 6)}...${user.slice(-4)}` : '';

  const navLinks = [
    { to: '/', label: 'Dashboard' },
    { to: '/deposit', label: 'Deposit' },
    { to: '/borrow', label: 'Borrow' },
    { to: '/repay', label: 'Repay' },
    { to: '/withdraw', label: 'Withdraw' },
    { to: '/liquidate', label: 'Liquidate' },
    { to: '/interest-rate-test', label: 'Rate Test' },
    { to: '/pool-test', label: 'Pool Test' },
  ];

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo">
          DeFi Lend
        </Link>
        <nav className="nav">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={location.pathname === to ? 'nav-link active' : 'nav-link'}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="wallet">
          {chainId != null && chainId !== 31337 && chainId !== 11155111 && (
            <span className="chain-warn">Switch to Local/Sepolia</span>
          )}
          {error && <span className="error-msg">{error}</span>}
          {user ? (
            <span className="address">{shortAddress}</span>
          ) : (
            <button className="connect-btn" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect MetaMask'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
