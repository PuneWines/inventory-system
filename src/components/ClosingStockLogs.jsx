import React, { useState, useEffect, useMemo } from 'react';
import SearchableDropdown from './SearchableDropdown';
import Toast from './Toast';
import {
  getShops,
  getItems,
  getClosingStockItems,
  updateClosingStockItemRow,
  deleteClosingStockItemRow
} from '../services/dbService';

export default function ClosingStockLogs({ hideHeader = false, currentUser, showActions = false }) {
  const [shopsList, setShopsList] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedShopId, setSelectedShopId] = useState(
    currentUser?.role === 'operator' && currentUser?.shop_id 
      ? currentUser.shop_id.toString() 
      : ''
  );
  const [selectedItemName, setSelectedItemName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');

  // Data state
  const [records, setRecords] = useState([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  // Editing states
  const [editingRowId, setEditingRowId] = useState(null);
  const [editValues, setEditValues] = useState({
    godown_qty: '0',
    counter_qty: '0'
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
      godown_qty: (row.godown_qty || 0).toString(),
      counter_qty: (row.counter_qty || 0).toString()
    });
  };

  const handleFieldChange = (field, val) => {
    setEditValues(prev => ({
      ...prev,
      [field]: val
    }));
  };

  const calculateLiveTotal = (vals) => {
    const godown = parseFloat(vals.godown_qty) || 0;
    const counter = parseFloat(vals.counter_qty) || 0;
    return godown + counter;
  };

  const handleSaveEdit = async (rowId) => {
    setIsSaving(true);
    try {
      const godown = parseFloat(editValues.godown_qty) || 0;
      const counter = parseFloat(editValues.counter_qty) || 0;
      const total = godown + counter;

      await updateClosingStockItemRow(rowId, {
        godown_qty: godown,
        counter_qty: counter
      });

      // Update locally
      setRecords(prev => prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            godown_qty: godown,
            counter_qty: counter,
            total_qty: total
          };
        }
        return row;
      }));

      setEditingRowId(null);
      showToast('Closing stock record updated successfully!');
    } catch (err) {
      console.error('Failed to save closing stock edit:', err);
      showToast(`Failed to update: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (rowId) => {
    if (!window.confirm('Are you sure you want to delete this closing stock record? This will also revert the stock ledger calculations for this item and date.')) {
      return;
    }
    try {
      await deleteClosingStockItemRow(rowId);
      setRecords(prev => prev.filter(row => row.id !== rowId));
      showToast('Closing stock record deleted successfully!');
    } catch (err) {
      console.error('Failed to delete closing stock record:', err);
      showToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  // 1. Load metadata (shops, items)
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [shops, items] = await Promise.all([getShops(), getItems()]);
        setShopsList(shops);
        setItemsList(items);
      } catch (err) {
        console.error('Failed to load metadata:', err);
      } finally {
        setIsLoadingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  // 2. Fetch records
  useEffect(() => {
    async function loadRecords() {
      setIsLoadingRecords(true);
      try {
        const data = await getClosingStockItems({
          fromDate,
          toDate,
          itemId: selectedItemId || null,
          shopId: selectedShopId || null
        });
        setRecords(data);
      } catch (err) {
        console.error('Failed to fetch closing stock items:', err);
        setRecords([]);
      } finally {
        setIsLoadingRecords(false);
      }
    }
    loadRecords();
  }, [fromDate, toDate, selectedItemId, selectedShopId]);

  // Client side search text filter
  const filteredRecords = useMemo(() => {
    if (!selectedItemName) return records;
    const query = selectedItemName.toLowerCase();
    return records.filter(row =>
      row.item_name && row.item_name.toLowerCase().includes(query)
    );
  }, [records, selectedItemName]);

  // Summary Metrics calculations
  const summary = useMemo(() => {
    return filteredRecords.reduce(
      (acc, row) => {
        acc.totalEntries += 1;
        acc.totalQty += row.total_qty;
        acc.godownQty += row.godown_qty;
        acc.counterQty += row.counter_qty;
        acc.totalValuation += row.total_qty * (row.purchase_rate || 0);
        return acc;
      },
      { totalEntries: 0, totalQty: 0, godownQty: 0, counterQty: 0, totalValuation: 0 }
    );
  }, [filteredRecords]);

  const handleSelectItem = (item) => {
    setSelectedItemName(item.item_name || item.name || '');
    setSelectedItemId(item.id || '');
  };

  const clearFilters = () => {
    setFromDate('');
    setToDate('');
    setSelectedShopId('');
    setSelectedItemName('');
    setSelectedItemId('');
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Shop Name', 'Item Name', 'Purchase Rate (₹)', 'Opening Stock', 'Godown Qty', 'Counter Qty', 'Total Closing Qty'];
    const rows = filteredRecords.map(r => [
      r.transaction_date,
      r.shop_name,
      r.item_name,
      r.purchase_rate ? `₹${r.purchase_rate.toFixed(2)}` : '₹0.00',
      r.last_closing_qty,
      r.godown_qty,
      r.counter_qty,
      r.total_qty
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${('' + val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Closing_Stock_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    const headers = ['Date', 'Shop Name', 'Item Name', 'Purchase Rate (₹)', 'Opening Stock', 'Godown Qty', 'Counter Qty', 'Total Closing Qty'];
    const rows = filteredRecords.map(r => [
      r.transaction_date,
      r.shop_name,
      r.item_name,
      r.purchase_rate || 0,
      r.last_closing_qty,
      r.godown_qty,
      r.counter_qty,
      r.total_qty
    ]);

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">`;
    html += `<head><meta charset="utf-8" /><style>table { border-collapse: collapse; } th { background-color: #f1f5f9; font-weight: bold; } th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }</style></head><body>`;
    html += `<h2>Closing Stock Logs Summary</h2>`;
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
    link.setAttribute("download", `Closing_Stock_Logs_${new Date().toISOString().split('T')[0]}.xls`);
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
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-sans">Closing Stock Logs</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium font-sans">Daily registry of physical closing stock records and godown/counter audits</p>
        </div>
      )}

      {/* Summary Cards */}
      {!hideHeader && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Total Logs</span>
            <span className="text-2xl sm:text-3xl font-black block mt-2.5 tracking-tight text-slate-800">
              {isLoadingRecords ? '...' : summary.totalEntries}
            </span>
          </div>
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Godown Qty</span>
            <span className="text-2xl sm:text-3xl font-black block mt-2.5 tracking-tight text-slate-800">
              {isLoadingRecords ? '...' : `${summary.godownQty.toLocaleString('en-IN')} units`}
            </span>
          </div>
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Counter Qty</span>
            <span className="text-2xl sm:text-3xl font-black block mt-2.5 tracking-tight text-slate-800">
              {isLoadingRecords ? '...' : `${summary.counterQty.toLocaleString('en-IN')} units`}
            </span>
          </div>
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Stock Valuation (Rate)</span>
            <span className="text-2xl sm:text-3xl font-black block mt-2.5 tracking-tight text-amber-600">
              {isLoadingRecords ? '...' : `₹${summary.totalValuation.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
          </div>
        </div>
      )}

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
              className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
            />
          </div>

          {/* Shop Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Shop Outlet</label>
            <select
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
              disabled={currentUser?.role === 'operator'}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all ${
                currentUser?.role === 'operator' 
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

          {/* Product Dropdown / Search */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Product Search</label>
            <div className="relative">
              <SearchableDropdown
                value={selectedItemName}
                onChange={handleSelectItem}
                onSearchChange={(val) => {
                  setSelectedItemName(val);
                  setSelectedItemId('');
                }}
                items={itemsList}
                placeholder="Select a snack item..."
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Closing Stock Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="font-bold text-slate-800 flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2.5 inline-block" />
            Closing Stock Sheets ({filteredRecords.length})
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
                <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-amber-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Syncing stock logs...
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50/70 text-slate-600 text-xs font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Shop Name</th>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4 text-right w-28">Purchase Rate</th>
                <th className="px-6 py-4 text-right w-32">Opening Stock</th>
                <th className="px-6 py-4 text-right w-32">Godown Qty</th>
                <th className="px-6 py-4 text-right w-32">Counter Qty</th>
                <th className="px-6 py-4 text-right w-36">Total Closing Qty</th>
                {showActions && <th className="px-6 py-4 text-center w-36">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 9 : 8} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No matching closing stock logs found. Try adjusting filter selections.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((row) => {
                  const isEditing = editingRowId === row.id;
                  const liveTotal = isEditing ? calculateLiveTotal(editValues) : row.total_qty;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/40 transition-colors text-xs sm:text-sm">
                      <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-medium">{row.transaction_date}</td>
                      <td className="px-6 py-4 font-semibold text-slate-500">{row.shop_name}</td>
                      <td className="px-6 py-4 font-bold text-slate-900">{row.item_name}</td>
                      
                      {/* Purchase Rate */}
                      <td className="px-6 py-4 text-right font-medium text-slate-600 whitespace-nowrap">
                        ₹{(row.purchase_rate || 0).toFixed(2)}
                      </td>

                      {/* Opening Stock */}
                      <td className="px-6 py-4 text-right font-medium text-slate-600">
                        {row.last_closing_qty}
                      </td>

                      {/* Godown Qty */}
                      <td className="px-6 py-4 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValues.godown_qty}
                            onChange={(e) => handleFieldChange('godown_qty', e.target.value)}
                            className="w-20 px-2 py-1 text-right border border-slate-300 rounded text-xs font-bold focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50"
                          />
                        ) : (
                          <span className="font-semibold text-slate-600">{row.godown_qty}</span>
                        )}
                      </td>

                      {/* Counter Qty */}
                      <td className="px-6 py-4 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValues.counter_qty}
                            onChange={(e) => handleFieldChange('counter_qty', e.target.value)}
                            className="w-20 px-2 py-1 text-right border border-slate-300 rounded text-xs font-bold focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50"
                          />
                        ) : (
                          <span className="font-semibold text-slate-600">{row.counter_qty}</span>
                        )}
                      </td>

                      {/* Total Closing Qty */}
                      <td className="px-6 py-4 text-right font-black text-amber-600">
                        {liveTotal}
                      </td>

                      {/* Actions */}
                      {showActions && (
                        <td className="px-6 py-3 text-center whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(row.id)}
                                disabled={isSaving}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 active:scale-95 transition-all cursor-pointer"
                              >
                                {isSaving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingRowId(null)}
                                disabled={isSaving}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg border border-slate-200 disabled:opacity-50 active:scale-95 transition-all cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center space-x-2">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(row)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Record"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(row.id)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Record"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
