import React, { useState, useEffect, useMemo } from 'react';
import SearchableDropdown from './SearchableDropdown';
import Toast from './Toast';
import {
  getItems,
  getVendors,
  getShops,
  getPurchasedItems,
  updatePurchaseItemRow,
  deletePurchaseItemRow
} from '../services/dbService';

const toDateStr = (d) => d.toISOString().split('T')[0];

const calculateEditTotal = (vals) => {
  const rate = parseFloat(vals.purchase_rate) || 0;
  const qty = parseFloat(vals.quantity) || 0;
  const disc = parseFloat(vals.discount) || 0;
  const gstVal = parseFloat(vals.gst_percent) || 0;
  const baseAmount = rate * qty;
  const discountAmt = vals.discount_type === '%' ? baseAmount * (disc / 100) : disc;
  const subtotal = Math.max(0, baseAmount - discountAmt);
  const gstAmt = subtotal * (gstVal / 100);
  return subtotal + gstAmt;
};

export default function PurchasedItems({ hideHeader = false, currentUser, showActions = false }) {
  const [itemsList, setItemsList] = useState([]);
  const [vendorsList, setVendorsList] = useState([]);
  const [shopsList, setShopsList] = useState([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [expandedItemName, setExpandedItemName] = useState(null);

  // Editing states
  const [editingRowId, setEditingRowId] = useState(null);
  const [editValues, setEditValues] = useState({
    purchase_rate: '0',
    quantity: '0',
    gst_percent: '0',
    discount: '0',
    discount_type: '%'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  const handleStartEdit = (row) => {
    setEditingRowId(row.id);
    setEditValues({
      purchase_rate: (row.purchase_rate || 0).toString(),
      quantity: (row.quantity || 0).toString(),
      gst_percent: (row.gst_percent || 0).toString(),
      discount: (row.discount || 0).toString(),
      discount_type: row.discount_type || '%'
    });
  };

  const handleFieldChange = (field, val) => {
    setEditValues(prev => ({
      ...prev,
      [field]: val
    }));
  };

  const handleSaveEdit = async (rowId) => {
    setIsSaving(true);
    try {
      const totalAmount = calculateEditTotal(editValues);

      await updatePurchaseItemRow(rowId, {
        purchase_rate: parseFloat(editValues.purchase_rate) || 0,
        quantity: parseFloat(editValues.quantity) || 0,
        gst_percent: parseFloat(editValues.gst_percent) || 0,
        discount: parseFloat(editValues.discount) || 0,
        discount_type: editValues.discount_type,
        total_amount: totalAmount
      });

      // Update locally
      setPurchaseRecords(prev => prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            purchase_rate: parseFloat(editValues.purchase_rate) || 0,
            quantity: parseFloat(editValues.quantity) || 0,
            gst_percent: parseFloat(editValues.gst_percent) || 0,
            discount: parseFloat(editValues.discount) || 0,
            discount_type: editValues.discount_type,
            total_amount: totalAmount
          };
        }
        return row;
      }));

      setEditingRowId(null);
      showToast('Purchase record updated successfully!');
    } catch (err) {
      console.error('Failed to save purchase record edit:', err);
      showToast(`Failed to update: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (rowId) => {
    if (!window.confirm('Are you sure you want to delete this purchase record? This will also revert the stock ledger calculations for this item and date.')) {
      return;
    }
    try {
      await deletePurchaseItemRow(rowId);
      setPurchaseRecords(prev => prev.filter(row => row.id !== rowId));
      showToast('Purchase record deleted successfully!');
    } catch (err) {
      console.error('Failed to delete purchase record:', err);
      showToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedShopId, setSelectedShopId] = useState(
    currentUser?.role === 'operator' && currentUser?.shop_id
      ? currentUser.shop_id.toString()
      : ''
  );
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
        const qty = parseFloat(row.quantity) || 0;
        const total = parseFloat(row.total_amount) || 0;
        const mrp = parseFloat(row.mrp) || 0;

        acc.expenditure += total;
        acc.quantity += qty;
        acc.mrp_amount += mrp * qty;
        acc.items.add(row.item_name);
        return acc;
      },
      { expenditure: 0, quantity: 0, mrp_amount: 0, items: new Set() }
    );
  }, [purchaseRecords]);

  // Group by unique item name and sum quantity & total amount
  const groupedRecords = useMemo(() => {
    const groups = {};
    purchaseRecords.forEach(row => {
      const key = row.item_name;
      if (!groups[key]) {
        groups[key] = {
          item_name: key,
          quantity: 0,
          total_amount: 0,
          mrp_amount: 0,
          vendor_names: new Set(),
          shop_names: new Set(),
          rates: [],
          gsts: [],
          dates: new Set(),
        };
      }
      const qty = parseFloat(row.quantity) || 0;
      const mrp = parseFloat(row.mrp) || 0;
      groups[key].quantity += qty;
      groups[key].total_amount += parseFloat(row.total_amount) || 0;
      groups[key].mrp_amount += mrp * qty;
      if (row.vendor_name && row.vendor_name !== 'N/A') groups[key].vendor_names.add(row.vendor_name);
      if (row.shop_name) groups[key].shop_names.add(row.shop_name);
      if (row.purchase_rate) groups[key].rates.push(parseFloat(row.purchase_rate));
      if (row.gst_percent) groups[key].gsts.push(parseFloat(row.gst_percent));
      if (row.transaction_date) groups[key].dates.add(row.transaction_date);
    });

    return Object.values(groups).map((group, index) => {
      const avgRate = group.rates.length > 0 ? group.rates.reduce((a, b) => a + b, 0) / group.rates.length : 0;
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

      const diff = group.mrp_amount - group.total_amount;

      return {
        id: `grouped-${index}`,
        item_name: group.item_name,
        quantity: group.quantity,
        total_amount: group.total_amount,
        mrp_amount: group.mrp_amount,
        diff: diff,
        vendor_name: group.vendor_names.size > 0 ? Array.from(group.vendor_names).join(', ') : 'N/A',
        shop_name: group.shop_names.size > 0 ? Array.from(group.shop_names).join(', ') : 'N/A',
        purchase_rate: avgRate,
        gst_percent: avgGst,
        transaction_date: dateStr,
      };
    });
  }, [purchaseRecords, fromDate, toDate]);

  const handleSelectItem = (item) => {
    setSelectedItemName(item.item_name || item.name || '');
    setSelectedItemId(item.id || '');
  };

  const clearFilters = () => {
    setFromDate('');
    setToDate('');
    setSelectedShopId('');
    setSelectedVendorId('');
    setSelectedItemName('');
    setSelectedItemId('');
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Item Name', 'Vendor', 'Shop Name', 'Avg Rate', 'Total Quantity', 'Avg GST %', 'Total Amount (₹)', 'MRP Amount (₹)', 'Diff (₹)'];
    const rows = groupedRecords.map(r => [
      r.transaction_date,
      r.item_name,
      r.vendor_name,
      r.shop_name,
      r.purchase_rate.toFixed(2),
      r.quantity,
      r.gst_percent.toFixed(1) + '%',
      r.total_amount.toFixed(2),
      r.mrp_amount.toFixed(2),
      r.diff.toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${('' + val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Purchase_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    const headers = ['Date', 'Item Name', 'Vendor', 'Shop Name', 'Avg Rate', 'Total Quantity', 'Avg GST %', 'Total Amount (₹)', 'MRP Amount (₹)', 'Diff (₹)'];
    const rows = groupedRecords.map(r => [
      r.transaction_date,
      r.item_name,
      r.vendor_name,
      r.shop_name,
      r.purchase_rate,
      r.quantity,
      r.gst_percent,
      r.total_amount,
      r.mrp_amount,
      r.diff
    ]);

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">`;
    html += `<head><meta charset="utf-8" /><style>table { border-collapse: collapse; } th { background-color: #f1f5f9; font-weight: bold; } th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }</style></head><body>`;
    html += `<h2>Purchase Logs Summary</h2>`;
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
    link.setAttribute("download", `Purchase_Logs_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 relative">
      <Toast notification={notification} onClose={() => setNotification(null)} />

      {/* Page Header */}
      {!hideHeader && (
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Purchase Logs</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Record registry of stock orders purchased from vendors</p>
        </div>
      )}

      {!showActions && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Total Purchased Qty Card */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Total Purchased Qty</span>
            <span className="text-2xl sm:text-3xl font-black block mt-2.5 tracking-tight text-slate-800">
              {isLoadingRecords ? '...' : `${summary.quantity.toLocaleString('en-IN')} units`}
            </span>
          </div>

          {/* Total Purchase Amount Card */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Total Purchase Amount</span>
            <span className="text-2xl sm:text-3xl font-black block mt-2.5 tracking-tight text-indigo-600">
              {isLoadingRecords ? '...' : `₹${summary.expenditure.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>

          {/* Total MRP Value Card */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Total MRP Value</span>
            <span className="text-2xl sm:text-3xl font-black block mt-2.5 tracking-tight text-slate-700">
              {isLoadingRecords ? '...' : `₹${summary.mrp_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>

          {/* Total Margin (Diff) Card */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Total Margin (Diff)</span>
            <span className="text-2xl sm:text-3xl font-black block mt-2.5 tracking-tight text-emerald-600">
              {isLoadingRecords ? '...' : `₹${(summary.mrp_amount - summary.expenditure).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>
        </div>
      )}

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

          {/* Shop Outlet */}
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
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="font-bold text-slate-800 flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 mr-2.5 inline-block" />
            Purchased Logs ({groupedRecords.length})
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
                <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Updating report data...
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
                <th className="px-6 py-4 text-right w-24">Avg GST %</th>
                <th className="px-6 py-4 text-right w-36">Total Amount (₹)</th>
                <th className="px-6 py-4 text-right w-36">MRP Amount (₹)</th>
                <th className="px-6 py-4 text-right w-28">Diff (₹)</th>
                <th className="px-6 py-4 text-center w-36">{showActions ? 'Actions' : 'Logs'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {groupedRecords.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 11 : 10} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No matching purchase records found. Try adjusting filter selections.
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

                      {/* Rate */}
                      <td className="px-6 py-3 text-right">
                        <span className="font-medium text-slate-700">₹{row.purchase_rate.toFixed(2)}</span>
                      </td>

                      {/* Qty */}
                      <td className="px-6 py-3 text-right">
                        <span className="font-bold text-slate-800">{row.quantity}</span>
                      </td>

                      {/* GST */}
                      <td className="px-6 py-3 text-right">
                        <span className="text-slate-500 font-medium">{row.gst_percent.toFixed(1)}%</span>
                      </td>

                      {/* Total */}
                      <td className="px-6 py-3 text-right">
                        <span className="font-extrabold text-indigo-600">
                          ₹{row.total_amount.toFixed(2)}
                        </span>
                      </td>

                      {/* MRP Amount */}
                      <td className="px-6 py-3 text-right">
                        <span className="font-semibold text-slate-700">
                          ₹{row.mrp_amount.toFixed(2)}
                        </span>
                      </td>

                      {/* Diff */}
                      <td className="px-6 py-3 text-right">
                        <span className={`font-semibold ${row.diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          ₹{row.diff.toFixed(2)}
                        </span>
                      </td>

                      {/* Action Button to Expand */}
                      <td className="px-6 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setExpandedItemName(expandedItemName === row.item_name ? null : row.item_name)}
                          className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${expandedItemName === row.item_name
                            ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
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

                    {/* Nested Sub-table for Ungrouped Individual Data */}
                    {expandedItemName === row.item_name && (
                      <tr className="bg-slate-50/45">
                        <td colSpan={showActions ? 11 : 10} className="px-6 py-5 border-t border-b border-slate-150">
                          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                Individual Transaction Logs for <span className="text-slate-950 normal-case">{row.item_name}</span>
                              </span>
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                                {purchaseRecords.filter(r => r.item_name === row.item_name).length} Records
                              </span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-left text-xs divide-y divide-slate-100">
                                <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase tracking-wider">
                                  <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Vendor</th>
                                    <th className="px-4 py-3">Shop</th>
                                    <th className="px-4 py-3 text-right w-24">Rate (₹)</th>
                                    <th className="px-4 py-3 text-right w-24">Qty</th>
                                    <th className="px-4 py-3 text-right w-20">GST %</th>
                                    <th className="px-4 py-3 text-right w-32">Discount</th>
                                    <th className="px-4 py-3 text-right w-32">Total (₹)</th>
                                    <th className="px-4 py-3 text-right w-28">MRP Total</th>
                                    <th className="px-4 py-3 text-right w-24">Diff</th>
                                    {showActions && <th className="px-4 py-3 text-center w-28">Actions</th>}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                  {purchaseRecords
                                    .filter(r => r.item_name === row.item_name)
                                    .map(subRow => {
                                      const isEditing = editingRowId === subRow.id;
                                      const liveTotal = isEditing ? calculateEditTotal(editValues) : subRow.total_amount;
                                      const liveMrpTotal = subRow.mrp * (isEditing ? (parseFloat(editValues.quantity) || 0) : subRow.quantity);
                                      const liveDiff = liveMrpTotal - liveTotal;

                                      return (
                                        <tr key={subRow.id} className="hover:bg-slate-50/30 transition-colors">
                                          <td className="px-4 py-3 text-slate-500 font-medium whitespace-nowrap">{subRow.transaction_date}</td>
                                          <td className="px-4 py-3 text-slate-700 font-semibold">{subRow.vendor_name}</td>
                                          <td className="px-4 py-3 text-slate-500 font-medium">{subRow.shop_name}</td>

                                          {/* Rate */}
                                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                            {isEditing ? (
                                              <input
                                                type="number"
                                                value={editValues.purchase_rate}
                                                onChange={(e) => handleFieldChange('purchase_rate', e.target.value)}
                                                className="w-20 px-1.5 py-1 text-right border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-slate-50"
                                                step="any"
                                              />
                                            ) : (
                                              <span className="font-medium text-slate-600">₹{subRow.purchase_rate.toFixed(2)}</span>
                                            )}
                                          </td>

                                          {/* Qty */}
                                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                            {isEditing ? (
                                              <input
                                                type="number"
                                                value={editValues.quantity}
                                                onChange={(e) => handleFieldChange('quantity', e.target.value)}
                                                className="w-16 px-1.5 py-1 text-right border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-slate-50"
                                                step="any"
                                              />
                                            ) : (
                                              <span className="font-bold text-slate-800">{subRow.quantity}</span>
                                            )}
                                          </td>

                                          {/* GST */}
                                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                            {isEditing ? (
                                              <input
                                                type="number"
                                                value={editValues.gst_percent}
                                                onChange={(e) => handleFieldChange('gst_percent', e.target.value)}
                                                className="w-14 px-1.5 py-1 text-right border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-slate-50"
                                                step="any"
                                              />
                                            ) : (
                                              <span className="text-slate-500 font-medium">{subRow.gst_percent}%</span>
                                            )}
                                          </td>

                                          {/* Discount */}
                                          <td className="px-4 py-2.5 text-right">
                                            {isEditing ? (
                                              <div className="flex items-center space-x-1 justify-end">
                                                <input
                                                  type="number"
                                                  value={editValues.discount}
                                                  onChange={(e) => handleFieldChange('discount', e.target.value)}
                                                  className="w-14 px-1.5 py-1 text-right border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-slate-50"
                                                  step="any"
                                                />
                                                <select
                                                  value={editValues.discount_type}
                                                  onChange={(e) => handleFieldChange('discount_type', e.target.value)}
                                                  className="px-1 py-1 border border-slate-300 rounded text-[10px] focus:ring-1 focus:ring-indigo-500 focus:outline-none bg-slate-50"
                                                >
                                                  <option value="%">%</option>
                                                  <option value="flat">₹</option>
                                                </select>
                                              </div>
                                            ) : (
                                              <span className="text-slate-500 font-medium">
                                                {subRow.discount_type === '%' ? `${subRow.discount}%` : `₹${subRow.discount.toFixed(2)}`}
                                              </span>
                                            )}
                                          </td>

                                          {/* Total */}
                                          <td className="px-4 py-2.5 text-right font-bold text-indigo-600">
                                            ₹{liveTotal.toFixed(2)}
                                          </td>

                                          {/* MRP Total */}
                                          <td className="px-4 py-2.5 text-right text-slate-500 font-medium">
                                            ₹{liveMrpTotal.toFixed(2)}
                                          </td>

                                          {/* Diff */}
                                          <td className={`px-4 py-2.5 text-right font-semibold ${liveDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            ₹{liveDiff.toFixed(2)}
                                          </td>

                                          {/* Actions */}
                                          {showActions && (
                                            <td className="px-4 py-2.5 text-center whitespace-nowrap">
                                              {isEditing ? (
                                                <div className="flex items-center justify-center space-x-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleSaveEdit(subRow.id)}
                                                    disabled={isSaving}
                                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded shadow-sm disabled:opacity-50 active:scale-95 transition-all cursor-pointer"
                                                  >
                                                    {isSaving ? 'Saving...' : 'Save'}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setEditingRowId(null)}
                                                    disabled={isSaving}
                                                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold rounded border border-slate-200 disabled:opacity-50 active:scale-95 transition-all cursor-pointer"
                                                  >
                                                    Cancel
                                                  </button>
                                                </div>
                                              ) : (
                                                <div className="flex items-center justify-center space-x-1.5">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleStartEdit(subRow)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                                    title="Edit Record"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                    </svg>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleDelete(subRow.id)}
                                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                                    title="Delete Record"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                  </button>
                                                </div>
                                              )}
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
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
