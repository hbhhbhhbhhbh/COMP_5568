import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getProvider, syncSigner } from '../utils/web3';

const WalletContext = createContext({ user: null, refreshUser: async () => null });

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export function WalletProvider({ children }) {
  const [user, setUser] = useState(null);

  const refreshUser = useCallback(async () => {
    const p = getProvider();
    if (!p) {
      setUser(null);
      return null;
    }
    try {
      await syncSigner();
      const accounts = await p.listAccounts();
      const account = accounts?.[0]?.address ?? null;
      setUser(account);
      return account;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser();
    if (typeof window !== 'undefined' && window.ethereum) {
      const onAccountsChanged = () => refreshUser();
      const onChainChanged = () => refreshUser();
      window.ethereum.on('accountsChanged', onAccountsChanged);
      window.ethereum.on('chainChanged', onChainChanged);
      return () => {
        window.ethereum.removeListener('accountsChanged', onAccountsChanged);
        window.ethereum.removeListener('chainChanged', onChainChanged);
      };
    }
  }, [refreshUser]);

  return (
    <WalletContext.Provider value={{ user, refreshUser }}>
      {children}
    </WalletContext.Provider>
  );
}
