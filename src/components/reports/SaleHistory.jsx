import React, { useState, useEffect, useMemo } from 'react';
import { getShops, getSaleHistory, getPurchasedItems, getItems } from '../../services/dbService';
import Toast from '../ui/Toast';

const toDateStr = (d) => d.toISOString().split('T')[0];

export default function SaleHistory({ hideHeader = false, currentUser, showActions = false }) {
  const [shopsList, setShopsList] = useState([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedShopId, setSelectedShopId] = useState(
    currentUser?.role === 'operator' && currentUser?.shop_id
      ? currentUser.shop_id.toString()
      : ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);

  // Data state
  const [salesRecords, setSalesRecords] = useState([]);
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [expandedItemName, setExpandedItemName] = useState(null);
  const [itemsList, setItemsList] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // 1. Load metadata
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [shops, items] = await Promise.all([getShops(), getItems()]);
        setShopsList(shops);
        setItemsList(items);
      } catch (err) {
        console.error('Failed to load metadata for filters:', err);
      } finally {
        setIsLoadingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  // 2. Fetch sale history & purchase items
  useEffect(() => {
    async function loadRecords() {
      setIsLoadingRecords(true);
      try {
        const [sales, purchases] = await Promise.all([
          getSaleHistory({
            fromDate,
            toDate,
            shopId: selectedShopId || null
          }),
          getPurchasedItems({
            fromDate,
            toDate,
            shopId: selectedShopId || null
          })
        ]);
        setSalesRecords(sales);
        setPurchaseRecords(purchases);
      } catch (err) {
        console.error('Failed to fetch logs:', err);
        setSalesRecords([]);
        setPurchaseRecords([]);
      } finally {
        setIsLoadingRecords(false);
      }
    }
    loadRecords();
  }, [fromDate, toDate, selectedShopId]);

  // Derived filtered records by search query (item name)
  const filteredSales = useMemo(() => {
    if (!searchQuery.trim()) return salesRecords;
    const q = searchQuery.toLowerCase();
    return salesRecords.filter(row =>
      row.item_name && row.item_name.toLowerCase().includes(q)
    );
  }, [salesRecords, searchQuery]);

  const filteredPurchases = useMemo(() => {
    if (!searchQuery.trim()) return purchaseRecords;
    const q = searchQuery.toLowerCase();
    return purchaseRecords.filter(row =>
      row.item_name && row.item_name.toLowerCase().includes(q)
    );
  }, [purchaseRecords, searchQuery]);

  // Unique items filtered for search dropdown autocomplete
  const dropdownItems = useMemo(() => {
    const uniqueNames = new Set();
    const uniqueItems = [];
    itemsList.forEach(item => {
      const name = item.item_name || item.name || '';
      if (name && !uniqueNames.has(name)) {
        uniqueNames.add(name);
        uniqueItems.push(item);
      }
    });

    const q = searchQuery.toLowerCase().trim();
    if (!q) return uniqueItems;
    return uniqueItems.filter(item =>
      (item.item_name || item.name || '').toLowerCase().includes(q)
    );
  }, [itemsList, searchQuery]);

  // Summary Metrics calculations
  const summary = useMemo(() => {
    return filteredSales.reduce(
      (acc, row) => {
        acc.totalUnits += parseFloat(row.sale_qty) || 0;
        acc.uniqueProducts.add(row.item_name);

        // Calculate sale amount using MRP from itemsList
        const itemObj = itemsList.find(i => {
          const nameA = (i.item_name || i.name || '').trim().toLowerCase();
          const nameB = (row.item_name || '').trim().toLowerCase();
          return nameA === nameB;
        });
        const mrp = itemObj ? (parseFloat(itemObj.mrp) || 0) : 20;
        acc.totalSaleAmount += (parseFloat(row.sale_qty) || 0) * mrp;

        return acc;
      },
      { totalUnits: 0, uniqueProducts: new Set(), totalSaleAmount: 0 }
    );
  }, [filteredSales, itemsList]);

  // Group by unique item name and calculate sales & purchase statistics
  const groupedRecords = useMemo(() => {
    const groups = {};

    // Initialize groups from sales
    filteredSales.forEach(row => {
      const key = row.item_name;
      if (!groups[key]) {
        groups[key] = {
          item_name: key,
          sale_qty: 0,
          purchase_qty: 0,
          total_amount: 0,
          mrp_amount: 0,
          vendor_names: new Set(),
          shop_names: new Set(),
          rates: [],
          gsts: [],
          dates: new Set(),
        };
      }
      groups[key].sale_qty += parseFloat(row.sale_qty) || 0;
      if (row.shop_name) groups[key].shop_names.add(row.shop_name);
      if (row.transaction_date) groups[key].dates.add(row.transaction_date);
    });

    // Integrate purchase details for the same items
    filteredPurchases.forEach(row => {
      const key = row.item_name;
      if (!groups[key]) {
        groups[key] = {
          item_name: key,
          sale_qty: 0,
          purchase_qty: 0,
          total_amount: 0,
          mrp_amount: 0,
          vendor_names: new Set(),
          shop_names: new Set(),
          rates: [],
          gsts: [],
          dates: new Set(),
        };
      }
      groups[key].purchase_qty += parseFloat(row.quantity) || 0;
      groups[key].total_amount += parseFloat(row.total_amount) || 0;
      groups[key].mrp_amount += (parseFloat(row.mrp) || 0) * (parseFloat(row.quantity) || 0);
      if (row.vendor_name && row.vendor_name !== 'N/A') groups[key].vendor_names.add(row.vendor_name);
      if (row.shop_name) groups[key].shop_names.add(row.shop_name);
      if (row.purchase_rate) groups[key].rates.push(parseFloat(row.purchase_rate));
      if (row.gst_percent) groups[key].gsts.push(parseFloat(row.gst_percent));
      if (row.transaction_date) groups[key].dates.add(row.transaction_date);
    });

    return Object.values(groups)
      .filter(group => group.sale_qty > 0)
      .map((group, index) => {
        // Lookup MRP and current rates from items DB table
        const itemObj = itemsList.find(i => {
          const nameA = (i.item_name || i.name || '').trim().toLowerCase();
          const nameB = (group.item_name || '').trim().toLowerCase();
          return nameA === nameB;
        });

        const mrpUnit = itemObj ? (parseFloat(itemObj.mrp) || 0) : 0;
        const fallbackRate = itemObj ? (parseFloat(itemObj.purchase_rate) || 0) : 0;

        const avgRate = group.rates.length > 0 ? group.rates.reduce((a, b) => a + b, 0) / group.rates.length : fallbackRate;
        const avgGst = group.gsts.length > 0 ? group.gsts.reduce((a, b) => a + b, 0) / group.gsts.length : 0;
        const uniqueDates = Array.from(group.dates).sort();
        const hasDateFilter = fromDate || toDate;
        const dateStr = hasDateFilter
          ? (uniqueDates.length > 1
            ? `${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]}`
            : uniqueDates[0] || '—')
          : (uniqueDates.length > 0
            ? uniqueDates[uniqueDates.length - 1]
            : '—');

        // Fallback calculations for values based on sales if no purchases in the period
        const mrpAmount = group.purchase_qty > 0 ? group.mrp_amount : (mrpUnit * group.sale_qty);
        const totalAmount = group.purchase_qty > 0 ? group.total_amount : (avgRate * group.sale_qty);
        const diff = mrpAmount - totalAmount;

        return {
          id: `grouped-${index}`,
          item_name: group.item_name,
          sale_qty: group.sale_qty,
          purchase_qty: group.purchase_qty,
          purchase_rate: avgRate,
          gst_percent: avgGst,
          total_amount: totalAmount,
          mrp_amount: mrpAmount,
          mrp_unit: mrpUnit,
          diff: diff,
          vendor_name: group.vendor_names.size > 0 ? Array.from(group.vendor_names).join(', ') : 'N/A',
          shop_name: group.shop_names.size > 0 ? Array.from(group.shop_names).join(', ') : 'N/A',
          transaction_date: dateStr,
        };
      });
  }, [filteredSales, filteredPurchases, fromDate, toDate, itemsList]);

  const clearFilters = () => {
    setFromDate('');
    setToDate('');
    setSelectedShopId('');
    setSearchQuery('');
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Item Name', 'Vendor', 'Shop Name', 'Avg Rate', 'Total Quantity', 'MRP (₹/unit)', 'Avg GST %', 'Total Amount (₹)', 'MRP Amount (₹)', 'Diff (₹)', 'Units Sold'];
    const rows = groupedRecords.map(r => [
      r.transaction_date,
      r.item_name,
      r.vendor_name,
      r.shop_name,
      r.purchase_rate.toFixed(2),
      r.purchase_qty,
      r.mrp_unit.toFixed(2),
      r.gst_percent.toFixed(1) + '%',
      r.total_amount.toFixed(2),
      r.mrp_amount.toFixed(2),
      r.diff.toFixed(2),
      r.sale_qty
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${('' + val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Sales_History_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    const headers = ['Date', 'Item Name', 'Vendor', 'Shop Name', 'Avg Rate', 'Total Quantity', 'MRP (₹/unit)', 'Avg GST %', 'Total Amount (₹)', 'MRP Amount (₹)', 'Diff (₹)', 'Units Sold'];
    const rows = groupedRecords.map(r => [
      r.transaction_date,
      r.item_name,
      r.vendor_name,
      r.shop_name,
      r.purchase_rate,
      r.purchase_qty,
      r.mrp_unit,
      r.gst_percent,
      r.total_amount,
      r.mrp_amount,
      r.diff,
      r.sale_qty
    ]);

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">`;
    html += `<head><meta charset="utf-8" /><style>table { border-collapse: collapse; } th { background-color: #f1f5f9; font-weight: bold; } th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }</style></head><body>`;
    html += `<h2>Sales History Logs Summary</h2>`;
    html += `<table><thead><tr>`;
    headers.forEach(h => { html += `<th>${h}</th>`; });
    html += `</tr></thead><tbody>`;
    rows.forEach(row => {
      html += `<tr>`;
      row.forEach(val => { html += `<td>${val === null || val === undefined ? '' : val}</td>`; });
      html += `</tr>`;
    });
    html += `</tbody></table></body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Sales_History_Logs_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      {!hideHeader && (
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Sales History Logs</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Historical register of items sold, calculated automatically during closing stock entry</p>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Total Sale Amount', val: `₹${summary.totalSaleAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, bg: 'bg-emerald-600 border-emerald-700 text-white shadow-lg shadow-emerald-600/10' },
          { label: 'Total Units Sold Out', val: `${summary.totalUnits.toLocaleString('en-IN')} units`, bg: 'bg-white border-slate-200 text-slate-900' },
          { label: 'Unique Snacks Sold', val: `${summary.uniqueProducts.size} items`, bg: 'bg-white border-slate-200 text-slate-900' },
          { label: 'Total Sales Entries Recorded', val: `${filteredSales.length} records`, bg: 'bg-white border-slate-200 text-slate-900' },
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
              disabled={currentUser?.role === 'operator'}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${currentUser?.role === 'operator'
                ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-slate-50/70 border-slate-300 cursor-pointer'
                }`}
            >
              {currentUser?.role !== 'operator' && <option value="">-- All Outlets --</option>}
              {shopsList.map(s => (
                <option key={s.id} value={s.id}>{s.shop_name}</option>
              ))}
            </select>
          </div>

          {/* Item Search Input */}
          <div className="relative">
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Snack Item Search</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search snack name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
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

            {/* Dropdown Autocomplete List */}
            {showDropdown && dropdownItems.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg z-50 divide-y divide-slate-50">
                {dropdownItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={() => {
                      setSearchQuery(item.item_name || item.name || '');
                      setShowDropdown(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors focus:outline-none"
                  >
                    {item.item_name || item.name}
                  </button>
                ))}
              </div>
            )}
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
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="font-bold text-slate-800 flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 mr-2.5 inline-block" />
            Sales Logs ({groupedRecords.length}) 
          </h3>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
                title="Export as CSV"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
                title="Export as Excel"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                <span>Excel</span>
              </button>
            </div>
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
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50/70 text-slate-600 text-xs font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4">Vendor</th>
                <th className="px-6 py-4">Shop Name</th>
                <th className="px-6 py-4 text-right w-28">Avg Rate</th>
                <th className="px-6 py-4 text-right w-28">Total Quantity</th>
                <th className="px-6 py-4 text-right w-28">MRP</th>
                <th className="px-6 py-4 text-right w-36">Total Amount (₹)</th>
                <th className="px-6 py-4 text-right w-36">MRP Amount (₹)</th>
                <th className="px-6 py-4 text-right w-28">Diff (₹)</th>
                <th className="px-6 py-4 text-right w-32">Units Sold</th>
                <th className="px-6 py-4 text-center w-36">{showActions ? 'Actions' : 'Logs'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {groupedRecords.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No matching sales history records found. Try adjusting filter selections.
                  </td>
                </tr>
              ) : (
                groupedRecords.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-slate-50/40 transition-colors text-xs sm:text-sm">
                      <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-medium">{row.transaction_date}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{row.item_name}</td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{row.vendor_name}</td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{row.shop_name}</td>

                      {/* Avg Rate */}
                      <td className="px-6 py-3 text-right">
                        <span className="font-medium text-slate-700">₹{row.purchase_rate.toFixed(2)}</span>
                      </td>

                      {/* Total Quantity */}
                      <td className="px-6 py-3 text-right font-semibold text-slate-700">
                        {row.purchase_qty}
                      </td>

                      {/* MRP per unit from items DB */}
                      <td className="px-6 py-3 text-right">
                        <span className="font-semibold text-slate-600">₹{row.mrp_unit.toFixed(2)}</span>
                      </td>

                      {/* Total Amount */}
                      <td className="px-6 py-3 text-right font-bold text-indigo-600">
                        ₹{row.total_amount.toFixed(2)}
                      </td>

                      {/* MRP Amount */}
                      <td className="px-6 py-3 text-right font-semibold text-slate-700">
                        ₹{row.mrp_amount.toFixed(2)}
                      </td>

                      {/* Diff */}
                      <td className="px-6 py-3 text-right">
                        <span className={`font-semibold ${row.diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          ₹{row.diff.toFixed(2)}
                        </span>
                      </td>

                      {/* Units Sold */}
                      <td className="px-6 py-4 text-right font-extrabold text-emerald-600">
                        {row.sale_qty > 0 ? `${row.sale_qty}` : '0'} units
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setExpandedItemName(expandedItemName === row.item_name ? null : row.item_name)}
                          className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${expandedItemName === row.item_name
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-800'
                            }`}
                        >
                          <span>{expandedItemName === row.item_name ? 'Hide Logs' : (showActions ? 'View / Edit Logs' : 'View Logs')}</span>
                          <svg
                            className={`w-3.5 h-3.5 transform transition-transform ${expandedItemName === row.item_name ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      </td>
                    </tr>

                    {/* Collapsible Nested Table for Individual Sales Logs */}
                    {expandedItemName === row.item_name && (
                      <tr className="bg-slate-50/45">
                        <td colSpan={12} className="px-6 py-5 border-t border-b border-slate-150">
                          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm max-w-3xl mx-auto">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                Individual Sales Entries for <span className="text-slate-950 normal-case">{row.item_name}</span>
                              </span>
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                                {salesRecords.filter(r => r.item_name === row.item_name).length} Entries
                              </span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-left text-xs divide-y divide-slate-100">
                                <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase tracking-wider">
                                  <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Shop</th>
                                    <th className="px-4 py-3 text-right w-36">Units Sold</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                  {salesRecords
                                    .filter(r => r.item_name === row.item_name)
                                    .map(subRow => (
                                      <tr key={subRow.id} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-4 py-3 text-slate-500 font-medium whitespace-nowrap">{subRow.transaction_date}</td>
                                        <td className="px-4 py-3 text-slate-500 font-medium">{subRow.shop_name}</td>
                                        <td className="px-4 py-3 text-right font-extrabold text-emerald-600">
                                          {subRow.sale_qty} units
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
