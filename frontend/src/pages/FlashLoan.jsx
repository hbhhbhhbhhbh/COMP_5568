import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  addresses,
  getFlashLoanFee,
  getTokenBalance,
  getTokenInfo,
  approveToken,
  getTokenAllowance,
  requestFlashLoanViaReceiver,
} from '../utils/web3';
import { useWallet } from '../context/WalletContext';
import './Page.css';

export default function FlashLoanPage() {
  const { user } = useWallet();
  const [asset, setAsset] = useState(addresses.borrowAsset || addresses.collateralAsset || '');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState(null);
  const [balance, setBalance] = useState(0n);
  const [decimals, setDecimals] = useState(18);
  const [symbol, setSymbol] = useState('USD');
  const [tx, setTx] = useState({ status: '', hash: '' });
  const [loading, setLoading] = useState(false);

  const receiverAddress = addresses.flashLoanReceiver;

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
      setTx({ status: 'error', hash: 'Please configure VITE_FLASH_LOAN_RECEIVER (FlashLoanReceiverExample contract address)' });
      return;
    }
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      const feeWei = await getFlashLoanFee(amountWei);
      if (balance < feeWei) throw new Error(`Required fee: ${ethers.formatUnits(feeWei, decimals)} ${symbol}; insufficient balance`);
      const pool = addresses.lendingPool;
      const allowance = await getTokenAllowance(asset, user, receiverAddress);
      if (allowance < feeWei) await approveToken(asset, receiverAddress, ethers.MaxUint256);
      const receipt = await requestFlashLoanViaReceiver(receiverAddress, asset, amountWei);
      setTx({ status: 'success', hash: receipt.hash });
      setAmount('');
      const newBal = await getTokenBalance(asset, user);
      setBalance(newBal);
    } catch (err) {
      setTx({ status: 'error', hash: err.message || 'Transaction failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Flash Loan</h1>
      <p className="muted">Select an asset and amount to start a flash loan. You must first approve the <strong>fee</strong> to the receiver contract. The receiver borrows from the pool and repays principal + fee in the same transaction. You only need at least the fee amount of {addresses.borrowAsset ? 'COL/BUSD' : 'the selected asset'}.</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && (
        <div className="card">
          {!receiverAddress && (
            <p className="danger">Please set VITE_FLASH_LOAN_RECEIVER in .env to a deployed FlashLoanReceiverExample contract address.</p>
          )}
          <div className="form-group">
            <label>Asset</label>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              style={{ maxWidth: 320, padding: '0.6rem 0.75rem', borderRadius: 8 }}
            >
              {addresses.collateralAsset && <option value={addresses.collateralAsset}>COL</option>}
              {addresses.borrowAsset && <option value={addresses.borrowAsset}>BUSD</option>}
            </select>
          </div>
          <p><strong>Your Balance:</strong> {typeof balance === 'bigint' ? ethers.formatUnits(balance, decimals) : '0'} {symbol}</p>
          <p className="form-hint">No collateral is needed for flash loans, but principal + fee must be repaid in the same transaction. You only need a balance >= fee in {symbol}.</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Loan Amount</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            {fee != null && (
              <p className="form-hint">Fee (approve to Receiver first): {typeof fee === 'bigint' ? ethers.formatUnits(fee, decimals) : String(fee)} {symbol}</p>
            )}
            <button type="submit" className="submit-btn" disabled={loading || !amount || !receiverAddress}>
              {loading ? 'Executing...' : 'Request Flash Loan'}
            </button>
          </form>
          {tx.status && (
            <p className={tx.status === 'success' ? 'success' : 'danger'} style={{ marginTop: '1rem' }}>
              {tx.status === 'success' ? `Success. Tx: ${tx.hash}` : tx.hash}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
