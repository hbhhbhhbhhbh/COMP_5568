import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Deposit from './pages/Deposit';
import Borrow from './pages/Borrow';
import Repay from './pages/Repay';
import Withdraw from './pages/Withdraw';
import Liquidate from './pages/Liquidate';
import InterestRateTest from './pages/InterestRateTest';
import PoolTest from './pages/PoolTest';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/interest-rate-test" element={<InterestRateTest />} />
        <Route path="/pool-test" element={<PoolTest />} />
        <Route path="/deposit" element={<Deposit />} />
        <Route path="/borrow" element={<Borrow />} />
        <Route path="/repay" element={<Repay />} />
        <Route path="/withdraw" element={<Withdraw />} />
        <Route path="/liquidate" element={<Liquidate />} />
      </Routes>
    </Layout>
  );
}

export default App;
