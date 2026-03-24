import { useWallet } from '../context/WalletContext';
import './Page.css';

export default function Analytics() {
  const { user } = useWallet();
  return (
    <div className="page">
      <h1>Analytics</h1>
      <p className="muted">Pool stats and history. Connect wallet to see your activity.</p>
      {!user && <p className="muted">Connect MetaMask first.</p>}
      {user && <div className="card"><p>Pool COL/BUSD. PCOL/PBUSD receipts. More charts can be added here.</p></div>}
    </div>
  );
}
