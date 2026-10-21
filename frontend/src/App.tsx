import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { TxStatus } from "./components/TxStatus";
import { LedgerProvider } from "./hooks/useLedger";
import { TxProvider } from "./hooks/useTx";
import { WalletProvider } from "./hooks/useWallet";
import Activity from "./pages/Activity";
import Admin from "./pages/Admin";
import Borrow from "./pages/Borrow";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import MyLoans from "./pages/MyLoans";
import Returns from "./pages/Returns";

export default function App() {
  return (
    <WalletProvider>
      <LedgerProvider>
        <TxProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/borrow" element={<Borrow />} />
              <Route path="/my-loans" element={<MyLoans />} />
              <Route path="/returns" element={<Returns />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </Layout>
          <TxStatus />
        </TxProvider>
      </LedgerProvider>
    </WalletProvider>
  );
}
