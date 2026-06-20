import React, { useState, useEffect, useMemo } from 'react';
import SearchableDropdown from './SearchableDropdown';
import {
  getItems,
  getShops,
  getStockLedger,
  getStockLedgerView
} from '../services/dbService';

const toDateStr = (d) => d.toISOString().split('T')[0];

export default function StockLedger() {
  const [itemsList, setItemsList] = useState([]);
  const [shopsList, setShopsList] = useState([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // Filters
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); // Default to last 7 days
    return toDateStr(d);
  });
  const [toDate, setToDate] = useState(() => toDateStr(new Date()));
  const [selectedShopId, setSelectedShopId] = useState('');
  const [selectedItemName, setSelectedItemName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  
  // Stored vs Live view toggle
  const [ledgerMode, setLedgerMode] = useState('stored'); // 'stored' | 'live'
  
  // Data state
  const [ledgerData, setLedgerData] = useState([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  // 1. Load metadata (items, shops)
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [items, shops] = await Promise.all([getItems(), getShops()]);
        setItemsList(items);
        setShopsList(shops);
      } catch (err) {
        console.error('Failed to load items/shops for filters:', err);
      } finally {
        setIsLoadingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  // 2. Load ledger data whenever filters or mode change
  useEffect(() => {
    async function loadData() {
      setIsLoadingLedger(true);
      try {
        if (ledgerMode === 'stored') {
          const data = await getStockLedger({
            fromDate,
            toDate,
            itemId: selectedItemId || null
          });
          setLedgerData(data);
        } else {
          const data = await getStockLedgerView({
            fromDate,
            toDate,
            itemName: selectedItemName || null
          });
          // View format returned has capitals: Date, "Item Name", "Opening Quantity", etc.
          // Map to uniform fields for table compatibility
          const mapped = data.map((row, idx) => ({
            id: idx,
            item_name: row['Item Name'],
            ledger_date: row['Date'],
            date_for_opening: row['Date For Opening'],
            opening_qty: row['Opening Quantity'],
            purchase_qty: row['Purchase Quantity'],
            sale_qty: row['Sale Quantity'],
            closing_qty: row['Closing Quantity']
          }));
          setLedgerData(mapped);
        }
      } catch (err) {
        console.error('Failed to load ledger data:', err);
        setLedgerData([]);
      } finally {
        setIsLoadingLedger(false);
      }
    }
    loadData();
  }, [fromDate, toDate, selectedItemId, selectedItemName, ledgerMode]);

  // Derived Summary Card Metrics
  const summary = useMemo(() => {
    return ledgerData.reduce(
      (acc, curr) => {
        acc.opening += parseFloat(curr.opening_qty) || 0;
        acc.purchase += parseFloat(curr.purchase_qty) || 0;
        acc.sale += parseFloat(curr.sale_qty) || 0;
        acc.closing += parseFloat(curr.closing_qty) || 0;
        return acc;
      },
      { opening: 0, purchase: 0, sale: 0, closing: 0 }
    );
  }, [ledgerData]);

  const handleSelectItem = (item) => {
    setSelectedItemName(item.item_name || item.name || '');
    setSelectedItemId(item.id || '');
  };

  const clearFilters = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    setFromDate(toDateStr(d));
    setToDate(toDateStr(new Date()));
    setSelectedShopId('');
    setSelectedItemName('');
    setSelectedItemId('');
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Stock Ledger Reports</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Historical audit of item transactions & stock levels</p>
        </div>

        {/* View Mode Toggle */}
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 self-start md:self-auto">
          <button
            onClick={() => setLedgerMode('stored')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              ledgerMode === 'stored'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Stored History (Ledger Table)
          </button>
          <button
            onClick={() => setLedgerMode('live')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              ledgerMode === 'live'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Live Computed (SQL View)
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Openings', val: summary.opening, bg: 'bg-indigo-50 border-indigo-100 text-indigo-600', iconColor: 'text-indigo-500' },
          { label: 'Total Purchased', val: summary.purchase, bg: 'bg-emerald-50 border-emerald-100 text-emerald-700', iconColor: 'text-emerald-500' },
          { label: 'Total Sold (Derived)', val: summary.sale, bg: 'bg-violet-50 border-violet-100 text-violet-600', iconColor: 'text-violet-500' },
          { label: 'Total Closings', val: summary.closing, bg: 'bg-amber-50 border-amber-100 text-amber-600', iconColor: 'text-amber-500' },
        ].map((card, idx) => (
          <div key={idx} className={`p-5 rounded-2xl border ${card.bg}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-wider block opacity-75">{card.label}</span>
            <span className="text-2xl sm:text-3xl font-black block mt-2 tracking-tight">
              {isLoadingLedger ? '...' : card.val}
            </span>
          </div>
        ))}
      </div>

      {/* Filter Options Desk */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Report Filter Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
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

          {/* Product Dropdown */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Item Select</label>
            <div className="flex gap-2.5">
              <div className="flex-1">
                <SearchableDropdown
                  value={selectedItemName}
                  onChange={handleSelectItem}
                  items={itemsList}
                  placeholder="All Snack Products..."
                />
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center justify-center px-4 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 active:scale-95 border border-slate-200 transition-all cursor-pointer whitespace-nowrap"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Report Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 mr-2.5 inline-block" />
            Ledger Rows ({ledgerData.length})
          </h3>
          {isLoadingLedger && (
            <div className="flex items-center text-xs font-semibold text-slate-400">
              <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Updating report data...
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50/70 text-slate-600 text-xs font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4 w-32">Date</th>
                <th className="px-6 py-4 w-36">Date For Opening</th>
                <th className="px-6 py-4 w-28 text-right">Opening Qty</th>
                <th className="px-6 py-4 w-28 text-right">Purchased Qty</th>
                <th className="px-6 py-4 w-28 text-right">Sold Qty</th>
                <th className="px-6 py-4 w-28 text-right">Closing Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {ledgerData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No matching ledger rows found in range. Try adjusting filter date range or mode.
                  </td>
                </tr>
              ) : (
                ledgerData.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900">{row.item_name}</td>
                    <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{row.ledger_date}</td>
                    <td className="px-6 py-4 text-slate-400 whitespace-nowrap">{row.date_for_opening || '—'}</td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-700">{row.opening_qty}</td>
                    <td className="px-6 py-4 text-right font-semibold text-indigo-600">+{row.purchase_qty}</td>
                    <td className="px-6 py-4 text-right font-semibold text-violet-600">-{row.sale_qty}</td>
                    <td className="px-6 py-4 text-right font-bold text-amber-600">{row.closing_qty}</td>
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
