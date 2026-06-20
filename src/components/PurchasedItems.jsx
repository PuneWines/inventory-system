import React, { useState, useEffect, useMemo } from 'react';
import SearchableDropdown from './SearchableDropdown';
import {
  getItems,
  getVendors,
  getShops,
  getPurchasedItems
} from '../services/dbService';

const toDateStr = (d) => d.toISOString().split('T')[0];

export default function PurchasedItems() {
  const [itemsList, setItemsList] = useState([]);
  const [vendorsList, setVendorsList] = useState([]);
  const [shopsList, setShopsList] = useState([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // Filters
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Default to last 30 days for purchases
    return toDateStr(d);
  });
  const [toDate, setToDate] = useState(() => toDateStr(new Date()));
  const [selectedShopId, setSelectedShopId] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedItemName, setSelectedItemName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');

  // Data state
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  // 1. Load metadata
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [items, vendors, shops] = await Promise.all([getItems(), getVendors(), getShops()]);
        setItemsList(items);
        setVendorsList(vendors);
        setShopsList(shops);
      } catch (err) {
        console.error('Failed to load metadata for filters:', err);
      } finally {
        setIsLoadingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  // 2. Fetch purchase records
  useEffect(() => {
    async function loadRecords() {
      setIsLoadingRecords(true);
      try {
        const records = await getPurchasedItems({
          fromDate,
          toDate,
          itemId: selectedItemId || null,
          vendorId: selectedVendorId || null,
          shopId: selectedShopId || null
        });
        setPurchaseRecords(records);
      } catch (err) {
        console.error('Failed to fetch purchase items:', err);
        setPurchaseRecords([]);
      } finally {
        setIsLoadingRecords(false);
      }
    }
    loadRecords();
  }, [fromDate, toDate, selectedItemId, selectedVendorId, selectedShopId]);

  // Summary Metrics calculations
  const summary = useMemo(() => {
    return purchaseRecords.reduce(
      (acc, row) => {
        acc.expenditure += parseFloat(row.total_amount) || 0;
        acc.quantity += parseFloat(row.quantity) || 0;
        acc.items.add(row.item_name);
        return acc;
      },
      { expenditure: 0, quantity: 0, items: new Set() }
    );
  }, [purchaseRecords]);

  const handleSelectItem = (item) => {
    setSelectedItemName(item.item_name || item.name || '');
    setSelectedItemId(item.id || '');
  };

  const clearFilters = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setFromDate(toDateStr(d));
    setToDate(toDateStr(new Date()));
    setSelectedShopId('');
    setSelectedVendorId('');
    setSelectedItemName('');
    setSelectedItemId('');
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Purchase Logs</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Record registry of stock orders purchased from vendors</p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          { label: 'Total Vendor Outflow', val: `₹${summary.expenditure.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, bg: 'bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-600/10' },
          { label: 'Total Volume Purchased', val: `${summary.quantity.toLocaleString('en-IN')} units`, bg: 'bg-white border-slate-200 text-slate-900' },
          { label: 'Unique Products Stocked', val: `${summary.items.size} items`, bg: 'bg-white border-slate-200 text-slate-900' },
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
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Log Query Filters</h3>
        
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

          {/* Vendor Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Vendor Name</label>
            <select
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
            >
              <option value="">-- All Vendors --</option>
              {vendorsList.map(v => (
                <option key={v.id} value={v.id}>{v.vendor_name}</option>
              ))}
            </select>
          </div>

          {/* Product Dropdown */}
          <div className="sm:col-span-2 lg:col-span-4">
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Product Search</label>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <SearchableDropdown
                  value={selectedItemName}
                  onChange={handleSelectItem}
                  items={itemsList}
                  placeholder="Select a snack item..."
                />
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                Reset Search Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Purchases Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 mr-2.5 inline-block" />
            Purchased Logs ({purchaseRecords.length})
          </h3>
          {isLoadingRecords && (
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
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4">Vendor</th>
                <th className="px-6 py-4">Shop</th>
                <th className="px-6 py-4 text-right">Rate</th>
                <th className="px-6 py-4 text-right">Qty</th>
                <th className="px-6 py-4 text-right">GST %</th>
                <th className="px-6 py-4 text-right">Discount</th>
                <th className="px-6 py-4 text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {purchaseRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No matching purchase records found. Try adjusting filter selections.
                  </td>
                </tr>
              ) : (
                purchaseRecords.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/40 transition-colors text-xs sm:text-sm">
                    <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-medium">{row.transaction_date}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">{row.item_name}</td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{row.vendor_name}</td>
                    <td className="px-6 py-4 text-slate-500 font-medium">{row.shop_name}</td>
                    <td className="px-6 py-4 text-right font-medium text-slate-700">₹{row.purchase_rate.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-800">{row.quantity}</td>
                    <td className="px-6 py-4 text-right text-slate-500 font-medium">{row.gst_percent}%</td>
                    <td className="px-6 py-4 text-right text-rose-500 font-medium">
                      {row.discount > 0 ? `-${row.discount_type === '%' ? '' : '₹'}${row.discount}${row.discount_type === '%' ? '%' : ''}` : '—'}
                    </td>
                    <td className="px-6 py-4 text-right font-extrabold text-indigo-600">₹{row.total_amount.toFixed(2)}</td>
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
