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
      setTx({ status: 'error', hash: '请配置 VITE_FLASH_LOAN_RECEIVER（FlashLoanReceiverExample 合约地址）' });
      return;
    }
    setLoading(true);
    setTx({ status: '', hash: '' });
    try {
      const amountWei = ethers.parseUnits(amount, decimals);
      const feeWei = await getFlashLoanFee(amountWei);
      if (balance < feeWei) throw new Error(`手续费需 ${ethers.formatUnits(feeWei, decimals)} ${symbol}，余额不足`);
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
      <h1>Flash Loan 闪电贷</h1>
      <p className="muted">选择资产与数量后发起闪电贷。需先向示例合约（Receiver）授权<strong>手续费</strong>，由 Receiver 向池子借出并在同一笔交易内归还本金+手续费。您只需持有至少等于手续费的 {addresses.borrowAsset ? 'COL/BUSD' : '资产'} 即可。</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && (
        <div className="card">
          {!receiverAddress && (
            <p className="danger">请在 .env 中设置 VITE_FLASH_LOAN_RECEIVER 为已部署的 FlashLoanReceiverExample 合约地址。</p>
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
          <p><strong>您的余额:</strong> {typeof balance === 'bigint' ? ethers.formatUnits(balance, decimals) : '0'} {symbol}</p>
          <p className="form-hint">闪电贷无需抵押，同一笔交易内归还本金+手续费即可。您只需持有 ≥ 手续费的 {symbol}。</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>借出数量</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            {fee != null && (
              <p className="form-hint">手续费（需提前授权给 Receiver）: {typeof fee === 'bigint' ? ethers.formatUnits(fee, decimals) : String(fee)} {symbol}</p>
            )}
            <button type="submit" className="submit-btn" disabled={loading || !amount || !receiverAddress}>
              {loading ? '执行中...' : '发起闪电贷'}
            </button>
          </form>
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
