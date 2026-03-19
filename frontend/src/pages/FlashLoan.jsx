import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  getAccount,
  addresses,
  getFlashLoanFee,
  getTokenBalance,
  getTokenInfo,
  getTokenAllowance,
  approveToken,
  flashLoan,
} from '../utils/web3';
import './Page.css';

export default function FlashLoanPage() {
  const [user, setUser] = useState(null);
  const [asset, setAsset] = useState(addresses.borrowAsset || '');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState(null);
  const [balance, setBalance] = useState(0n);
  const [decimals, setDecimals] = useState(18);
  const [symbol, setSymbol] = useState('USD');
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);

  const receiverAddress = addresses.flashLoanReceiver;

  useEffect(() => {
    getAccount().then(setUser);
  }, []);

  useEffect(() => {
    if (!asset || !user) return;
    getTokenBalance(asset, user).then(setBalance);
    getTokenInfo(asset).then((info) => {
      setDecimals(info.decimals);
      setSymbol(info.symbol);
    });
  }, [asset, user]);

  useEffect(() => {
    if (!amount || !addresses.lendingPool) {
      setFee(null);
      return;
    }
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      getFlashLoanFee(amountWei).then((f) => setFee(f));
    } catch {
      setFee(null);
    }
  }, [amount, decimals]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || !user || !receiverAddress) {
      setTx({ status: 'error', hash: 'Flash loan receiver not configured. Deploy FlashLoanReceiverExample and set address.' });
      return;
    }
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      const params = '0x';
      const receipt = await flashLoan(receiverAddress, asset, amountWei, params);
      setTx({ status: 'success', hash: receipt.hash });
      setAmount('');
    } catch (err) {
      setTx({ status: 'error', hash: err.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Flash Loan</h1>
      <p className="muted">Request a flash loan. The receiver contract must repay principal + fee in the same transaction. Use the example receiver address if deployed.</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && (
        <div className="card">
          {!receiverAddress && (
            <p className="danger">Set VITE_FLASH_LOAN_RECEIVER in .env to the FlashLoanReceiverExample contract address.</p>
          )}
          <p><strong>Asset:</strong> {symbol} ({asset ? `${asset.slice(0, 10)}...` : '—'})</p>
          <p><strong>Your balance:</strong> {ethers.formatUnits(balance, decimals)} {symbol}</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Amount to flash borrow</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            {fee != null && (
              <p className="form-hint">Fee: {ethers.formatUnits(fee, decimals)} {symbol}</p>
            )}
            <button type="submit" className="submit-btn" disabled={loading || !amount || !receiverAddress}>
              {loading ? 'Executing...' : 'Execute Flash Loan'}
            </button>
          </form>
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
