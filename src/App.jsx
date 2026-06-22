import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Inventory from './Inventory';
import StockLedger from './components/StockLedger';
import PurchasedItems from './components/PurchasedItems';
import MasterManagement from './components/MasterManagement';
import SaleHistory from './components/SaleHistory';

function App() {
  const [currentPage, setCurrentPage] = useState('entry');

  const renderPage = () => {
    switch (currentPage) {
      case 'entry':
        return <Inventory />;
      case 'ledger':
        return <StockLedger />;
      case 'purchases':
        return <PurchasedItems />;
      case 'sales':
        return <SaleHistory />;
      case 'master':
        return <MasterManagement />;
      default:
        return <Inventory />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans selection:bg-amber-500/20 selection:text-amber-900">
      {/* Sidebar Navigation */}
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />

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

