import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Deposit from './pages/Deposit';
import Borrow from './pages/Borrow';
import Repay from './pages/Repay';
import Withdraw from './pages/Withdraw';
import Liquidate from './pages/Liquidate';
import FlashLoan from './pages/FlashLoan';
import Analytics from './pages/Analytics';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/deposit" element={<Deposit />} />
        <Route path="/borrow" element={<Borrow />} />
        <Route path="/repay" element={<Repay />} />
        <Route path="/withdraw" element={<Withdraw />} />
        <Route path="/liquidate" element={<Liquidate />} />
        <Route path="/flash-loan" element={<FlashLoan />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Layout>
  );
}

export default App;
