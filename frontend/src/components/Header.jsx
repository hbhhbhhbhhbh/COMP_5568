import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { connectWallet, getAccount, getChainId } from '../utils/web3';
import './Header.css';

export default function Header() {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const location = useLocation();

  const loadAccount = async () => {
    const acc = await getAccount();
    setAddress(acc);
    const cid = await getChainId();
    setChainId(cid);
  };

  useEffect(() => {
    loadAccount();
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', loadAccount);
      window.ethereum.on('chainChanged', () => window.location.reload());
    }
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', loadAccount);
      }
    };
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      await connectWallet();
      await loadAccount();
    } catch (e) {
      setError(e.message || 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

  const navLinks = [
    { to: '/', label: 'Dashboard' },
    { to: '/deposit', label: 'Deposit' },
    { to: '/borrow', label: 'Borrow' },
    { to: '/repay', label: 'Repay' },
    { to: '/withdraw', label: 'Withdraw' },
    { to: '/liquidate', label: 'Liquidate' },
    { to: '/flash-loan', label: 'Flash Loan' },
    { to: '/analytics', label: 'Analytics' },
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
          {address ? (
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
