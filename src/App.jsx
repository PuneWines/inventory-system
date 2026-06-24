import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Inventory from './Inventory';
import StockLedger from './components/StockLedger';
import PurchasedItems from './components/PurchasedItems';
import CurrentStockItems from './components/ClosingStockItems';
import MasterManagement from './components/MasterManagement';
import SaleHistory from './components/SaleHistory';
import LoginScreen from './components/LoginScreen';
import UserManagement from './components/UserManagement';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('entry');
  const [isLoading, setIsLoading] = useState(true);

  // Load user session on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('vishal_snacks_user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
        localStorage.removeItem('vishal_snacks_user');
      }
    }
    setIsLoading(false);
  }, []);

  // Guard routes dynamically based on user's granular page_access JSON array permissions
  useEffect(() => {
    if (currentUser) {
      const allowed = currentUser.page_access || [];
      const hasAccess = (page) => {
        if (page === 'entry') {
          return allowed.includes('entry_purchases') || allowed.includes('entry_closing') || allowed.includes('entry_cashtally');
        }
        if (page === 'ledger') {
          return allowed.includes('ledger_table') || allowed.includes('ledger_reports') || allowed.includes('ledger_purchases') || allowed.includes('ledger_sales') || allowed.includes('ledger_closing');
        }
        if (page === 'master') {
          return allowed.includes('master_items') || allowed.includes('master_vendors');
        }
        if (page === 'users') {
          return allowed.includes('users_management');
        }
        return false;
      };

      if (!hasAccess(currentPage)) {
        const pages = ['entry', 'ledger', 'master', 'users'];
        const firstAllowed = pages.find(p => hasAccess(p)) || 'entry';
        setCurrentPage(firstAllowed);
      }
    }
  }, [currentPage, currentUser]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    localStorage.setItem('vishal_snacks_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('vishal_snacks_user');
    setCurrentPage('entry');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Loading Console Session...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'entry':
        return <Inventory currentUser={currentUser} />;
      case 'ledger':
        return <StockLedger currentUser={currentUser} />;
      case 'purchases':
        return <PurchasedItems currentUser={currentUser} />;
      case 'sales':
        return <SaleHistory currentUser={currentUser} />;
      case 'closing':
        return <CurrentStockItems currentUser={currentUser} />;
      case 'master':
        return <MasterManagement currentUser={currentUser} />;
      case 'users':
        return <UserManagement currentUser={currentUser} />;
      default:
        return <Inventory currentUser={currentUser} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans selection:bg-amber-500/20 selection:text-amber-900">
      {/* Sidebar Navigation */}
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        currentUser={currentUser} 
        onLogout={handleLogout} 
      />

      {/* Main Content Layout Wrapper */}
      <div className="lg:pl-64 min-h-screen flex flex-col transition-all duration-300">
        <main className="flex-1 p-4 sm:p-6 md:p-8 lg:p-4 pt-24 lg:pt-4 w-10-xl w-full mx-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
