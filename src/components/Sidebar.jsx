import React, { useState } from 'react';

export default function Sidebar({ currentPage, setCurrentPage, currentUser, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    {
      id: 'entry',
      label: 'Daily Entry',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      )
    },
    {
      id: 'ledger',
      label: 'Stock Ledger',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      )
    },
    {
      id: 'master',
      label: 'Master Directory',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      )
    },
    {
      id: 'users',
      label: 'User Management',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    }
  ];

  // Filter navigation tabs based on user's granular page_access JSON array permissions
  const filteredNavItems = navItems.filter(item => {
    const allowed = currentUser?.page_access || [];
    if (item.id === 'entry') {
      return allowed.includes('entry_purchases') || allowed.includes('entry_closing') || allowed.includes('entry_cashtally');
    }
    if (item.id === 'ledger') {
      return allowed.includes('ledger_table') || allowed.includes('ledger_reports') || allowed.includes('ledger_purchases') || allowed.includes('ledger_sales') || allowed.includes('ledger_closing') || allowed.includes('manager_report');
    }
    if (item.id === 'master') {
      return allowed.includes('master_items') || allowed.includes('master_vendors');
    }
    if (item.id === 'users') {
      return allowed.includes('users_management');
    }
    return false;
  });

  return (
    <>
      {/* Mobile Hamburger Toggle */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-3 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-800 hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
        >
          {isOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Backdrop for Mobile Drawer */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="lg:hidden fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-40 transition-opacity"
        />
      )}

      {/* Sidebar Shell */}
      <aside
        className={`fixed inset-y-0 left-0 bg-slate-900 text-slate-100 w-64 border-r border-slate-800 p-6 flex flex-col justify-between z-40 transform lg:transform-none lg:opacity-100 transition-all duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
      >
        <div className="space-y-7">
          {/* Logo Brand Header */}
          <div className="flex items-center space-x-3 px-2">
            <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-amber-600 rounded-xl shadow-md shadow-amber-500/10">
              <svg className="w-6 h-6 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <div>
              <h1 className="font-black text-lg tracking-wide bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                SNACKS INVENTORY
              </h1>
              <p className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">Inventory System</p>
            </div>
          </div>

          {/* User Profile Card */}
          {currentUser && (
            <div className="mx-1 bg-slate-950/40 border border-slate-800/70 p-3.5 rounded-xl flex items-center gap-3 shadow-inner">
              <div className="w-8.5 h-8.5 rounded-xl bg-gradient-to-tr from-amber-400 to-amber-500 flex items-center justify-center text-slate-950 font-black text-xs shrink-0">
                {currentUser.username.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-100 truncate">{currentUser.username}</p>
                <p className="text-[9px] font-black uppercase tracking-wider text-amber-400 mt-0.5 truncate">
                  {currentUser.role} {currentUser.shop_name ? `• ${currentUser.shop_name}` : '• Global'}
                </p>
              </div>
            </div>
          )}

          {/* Navigation Items */}
          <nav className="space-y-1.5">
            {filteredNavItems.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentPage(item.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3.5 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${isActive
                    ? 'bg-gradient-to-r from-amber-500/15 to-transparent text-amber-400 border-l-2 border-amber-500 shadow-inner'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 border-l-2 border-transparent'
                    }`}
                >
                  <span className={isActive ? 'text-amber-400' : 'text-slate-400'}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Logout & Footer Brand Credit */}
        <div className="space-y-5">
          <button
            onClick={onLogout}
            className="w-full flex items-center space-x-3.5 px-4 py-3 text-xs font-bold text-slate-400 hover:text-white hover:bg-rose-950/15 hover:border-rose-500/10 border border-transparent rounded-xl transition-all duration-200 cursor-pointer outline-none"
          >
            <svg className="w-5 h-5 text-rose-500/75 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            <span>Sign Out</span>
          </button>

          <div className="border-t border-slate-800 pt-4 px-2">
            <p className="text-[10px] font-bold tracking-wider text-slate-600 uppercase">Operational Console</p>
            <p className="text-[11px] text-slate-400 mt-0.5">V1.2.0 • Supporter Dashboard</p>
          </div>
        </div>
      </aside>
    </>
  );
}
