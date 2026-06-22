import React, { useState, useEffect, useMemo } from 'react';
import SearchableDropdown from './SearchableDropdown';
import Toast from './Toast';
import {
  getItems,
  getShops,
  getClosingStockItems,
  updateClosingStockItemRow,
  deleteClosingStockItemRow
} from '../services/dbService';

const toDateStr = (d) => d.toISOString().split('T')[0];

export default function ClosingStockItems() {
  const [itemsList, setItemsList] = useState([]);
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
  const [selectedItemName, setSelectedItemName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');

  // Data state
  const [closingRecords, setClosingRecords] = useState([]);
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

  const handleSaveEdit = async (rowId) => {
    setIsSaving(true);
    try {
      const godownQty = parseFloat(editValues.godown_qty) || 0;
      const counterQty = parseFloat(editValues.counter_qty) || 0;
      const totalQty = godownQty + counterQty;

      await updateClosingStockItemRow(rowId, {
        godown_qty: godownQty,
        counter_qty: counterQty
      });

      // Update locally
      setClosingRecords(prev => prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            godown_qty: godownQty,
            counter_qty: counterQty,
            total_qty: totalQty
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
    if (!window.confirm('Are you sure you want to delete this closing stock record? This will also revert the stock ledger calculations for this date.')) {
      return;
    }
    try {
      await deleteClosingStockItemRow(rowId);
      setClosingRecords(prev => prev.filter(row => row.id !== rowId));
      showToast('Closing stock record deleted successfully!');
    } catch (err) {
      console.error('Failed to delete closing stock record:', err);
      showToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  // 1. Load metadata (items, shops)
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [items, shops] = await Promise.all([getItems(), getShops()]);
        setItemsList(items);
        setShopsList(shops);
      } catch (err) {
        console.error('Failed to load metadata for filters:', err);
      } finally {
        setIsLoadingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  // 2. Fetch closing stock records
  useEffect(() => {
    async function loadRecords() {
      setIsLoadingRecords(true);
      try {
        const records = await getClosingStockItems({
          fromDate,
          toDate,
          itemId: selectedItemId || null,
          shopId: selectedShopId || null
        });
        setClosingRecords(records);
      } catch (err) {
        console.error('Failed to fetch closing stock items:', err);
        setClosingRecords([]);
      } finally {
        setIsLoadingRecords(false);
      }
    }
    loadRecords();
  }, [fromDate, toDate, selectedItemId, selectedShopId]);

  // Summary Metrics calculations
  const summary = useMemo(() => {
    return closingRecords.reduce(
      (acc, row) => {
        acc.totalQty += parseFloat(row.total_qty) || 0;
        acc.godownQty += parseFloat(row.godown_qty) || 0;
        acc.counterQty += parseFloat(row.counter_qty) || 0;
        acc.items.add(row.item_name);
        return acc;
      },
      { totalQty: 0, godownQty: 0, counterQty: 0, items: new Set() }
    );
  }, [closingRecords]);

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
    setSelectedItemName('');
    setSelectedItemId('');
  };

  return (
    <div className="space-y-8 relative">
      <Toast notification={notification} onClose={() => setNotification(null)} />

      {/* Page Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Closing Stock Logs</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Record registry of physical end-of-day closing stock counts</p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          {
            label: 'Total Closing Stock',
            val: `${summary.totalQty.toLocaleString('en-IN')} units`,
            bg: 'bg-amber-600 border-amber-700 text-white shadow-lg shadow-amber-600/10'
          },
          {
            label: 'Godown stock volume',
            val: `${summary.godownQty.toLocaleString('en-IN')} units`,
            bg: 'bg-white border-slate-200 text-slate-900'
          },
          {
            label: 'counter stock volume',
            val: `${summary.counterQty.toLocaleString('en-IN')} units`,
            bg: 'bg-white border-slate-200 text-slate-900'
          },
          {
            label: 'Products Counted',
            val: `${summary.items.size} items`,
            bg: 'bg-white border-slate-200 text-slate-900'
          },
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
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
              className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer"
            >
              <option value="">-- All Outlets --</option>
              {shopsList.map(s => (
                <option key={s.id} value={s.id}>{s.shop_name}</option>
              ))}
            </select>
          </div>

          {/* Product Dropdown */}
          <div className="sm:col-span-2 lg:col-span-3">
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

      {/* Closing Stock Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2.5 inline-block" />
            Closing Logs ({closingRecords.length})
          </h3>
          {isLoadingRecords && (
            <div className="flex items-center text-xs font-semibold text-slate-400">
              <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-amber-500" fill="none" viewBox="0 0 24 24">
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
                <th className="px-6 py-4">Shop</th>
                <th className="px-6 py-4 text-right w-36">Yesterday's Closing</th>
                <th className="px-6 py-4 text-right w-28">Godown Qty</th>
                <th className="px-6 py-4 text-right w-28">Counter Qty</th>
                <th className="px-6 py-4 text-right w-32">Total Closing Qty</th>
                <th className="px-6 py-4 text-center w-40">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {closingRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No matching closing stock records found. Try adjusting filter selections.
                  </td>
                </tr>
              ) : (
                closingRecords.map((row) => {
                  const isEditing = row.id === editingRowId;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/40 transition-colors text-xs sm:text-sm">
                      <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-medium">{row.transaction_date}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{row.item_name}</td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{row.shop_name}</td>
                      <td className="px-6 py-4 text-right font-medium text-slate-500">{row.last_closing_qty}</td>
                      
                      {/* Godown Qty */}
                      <td className="px-6 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editValues.godown_qty}
                            onChange={(e) => handleFieldChange('godown_qty', e.target.value)}
                            disabled={isSaving}
                            className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                          />
                        ) : (
                          <span className="font-medium text-slate-700">{row.godown_qty}</span>
                        )}
                      </td>

                      {/* Counter Qty */}
                      <td className="px-6 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editValues.counter_qty}
                            onChange={(e) => handleFieldChange('counter_qty', e.target.value)}
                            disabled={isSaving}
                            className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                          />
                        ) : (
                          <span className="font-medium text-slate-700">{row.counter_qty}</span>
                        )}
                      </td>

                      {/* Total qty */}
                      <td className="px-6 py-3 text-right font-extrabold text-amber-600">
                        {isEditing ? (
                          (parseFloat(editValues.godown_qty) || 0) + (parseFloat(editValues.counter_qty) || 0)
                        ) : (
                          row.total_qty
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3 text-center whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(row.id)}
                              disabled={isSaving}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {isSaving ? '...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRowId(null)}
                              disabled={isSaving}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(row)}
                              disabled={editingRowId !== null}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button;submit"
                              onClick={() => handleDelete(row.id)}
                              disabled={editingRowId !== null}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
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
