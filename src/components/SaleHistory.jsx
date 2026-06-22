import React, { useState, useEffect, useMemo } from 'react';
import { getShops, getSaleHistory } from '../services/dbService';
import Toast from './Toast';

const toDateStr = (d) => d.toISOString().split('T')[0];

export default function SaleHistory() {
  const [shopsList, setShopsList] = useState([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // Filters
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Default to last 30 days
    return toDateStr(d);
  });
  const [toDate, setToDate] = useState(() => toDateStr(new Date()));
  const [selectedShopId, setSelectedShopId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);

  // Data state
  const [salesRecords, setSalesRecords] = useState([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  // 1. Load metadata
  useEffect(() => {
    async function loadMetadata() {
      try {
        const shops = await getShops();
        setShopsList(shops);
      } catch (err) {
        console.error('Failed to load shops for filters:', err);
      } finally {
        setIsLoadingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  // 2. Fetch sale history
  useEffect(() => {
    async function loadRecords() {
      setIsLoadingRecords(true);
      try {
        const records = await getSaleHistory({
          fromDate,
          toDate,
          shopId: selectedShopId || null
        });
        setSalesRecords(records);
      } catch (err) {
        console.error('Failed to fetch sale history logs:', err);
        setSalesRecords([]);
      } finally {
        setIsLoadingRecords(false);
      }
    }
    loadRecords();
  }, [fromDate, toDate, selectedShopId]);

  // Derived filtered records by search query (item name)
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return salesRecords;
    const q = searchQuery.toLowerCase();
    return salesRecords.filter(row =>
      row.item_name && row.item_name.toLowerCase().includes(q)
    );
  }, [salesRecords, searchQuery]);

  // Summary Metrics calculations
  const summary = useMemo(() => {
    return filteredRecords.reduce(
      (acc, row) => {
        acc.totalUnits += parseFloat(row.sale_qty) || 0;
        acc.uniqueProducts.add(row.item_name);
        return acc;
      },
      { totalUnits: 0, uniqueProducts: new Set() }
    );
  }, [filteredRecords]);

  const clearFilters = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setFromDate(toDateStr(d));
    setToDate(toDateStr(new Date()));
    setSelectedShopId('');
    setSearchQuery('');
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return '—';
    try {
      const dateObj = new Date(isoString);
      return dateObj.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }) + ' ' + dateObj.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-8">
      <Toast notification={notification} onClose={() => setNotification(null)} />

      {/* Page Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Sales History Logs</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Historical register of items sold, calculated automatically during closing stock entry</p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          { label: 'Total Units Sold Out', val: `${summary.totalUnits.toLocaleString('en-IN')} units`, bg: 'bg-emerald-600 border-emerald-700 text-white shadow-lg shadow-emerald-600/10' },
          { label: 'Unique Snacks Sold', val: `${summary.uniqueProducts.size} items`, bg: 'bg-white border-slate-200 text-slate-900' },
          { label: 'Total Sales Entries Recorded', val: `${filteredRecords.length} records`, bg: 'bg-white border-slate-200 text-slate-900' },
        ].map((card, idx) => (
          <div key={idx} className={`p-6 rounded-2xl border ${card.bg}`}>
            <span className={`text-[10px] font-extrabold uppercase tracking-wider block ${idx === 0 ? 'opacity-85' : 'text-slate-500'}`}>{card.label}</span>
            <span className="text-2xl sm:text-3xl font-black block mt-2.5 tracking-tight">
              {isLoadingRecords ? '...' : card.val}
            </span>
          </div>
        ))}
      </div>

      {/* Filters Form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Query Filters</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* From Date */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Shop Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Shop Outlet</label>
            <select
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
              className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
            >
              <option value="">-- All Outlets --</option>
              {shopsList.map(s => (
                <option key={s.id} value={s.id}>{s.shop_name}</option>
              ))}
            </select>
          </div>

          {/* Item Search Input */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Snack Item Search</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search snack name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            Reset Search Filters
          </button>
        </div>
      </div>

      {/* Sales Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 mr-2.5 inline-block" />
            Sales Logs ({filteredRecords.length})
          </h3>
          {isLoadingRecords && (
            <div className="flex items-center text-xs font-semibold text-slate-400">
              <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-emerald-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Updating sale logs...
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50/70 text-slate-600 text-xs font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Logged Date & Time</th>
                <th className="px-6 py-4">Transaction Date</th>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4">Shop</th>
                <th className="px-6 py-4 text-right">Units Sold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No matching sales history records found. Try adjusting filter selections.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/40 transition-colors text-xs sm:text-sm">
                    <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-medium">{formatDateTime(row.created_at)}</td>
                    <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-medium">{row.transaction_date}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">{row.item_name}</td>
                    <td className="px-6 py-4 text-slate-500 font-medium">{row.shop_name}</td>
                    <td className="px-6 py-4 text-right font-extrabold text-emerald-600">
                      {row.sale_qty > 0 ? `${row.sale_qty}` : '0'} units
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
