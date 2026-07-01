import React, { useState, useEffect, useMemo } from 'react';
import SearchableDropdown from './SearchableDropdown';
import Toast from './Toast';
import {
  getCurrentStockItems,
  updateCurrentStockItem,
  deleteItem,
  getShops
} from '../services/dbService';

export default function CurrentStockItems({ hideHeader = false, currentUser, showActions = false }) {
  const [itemsList, setItemsList] = useState([]);
  const [shopsList, setShopsList] = useState([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  const [selectedShopId, setSelectedShopId] = useState(
    currentUser?.role === 'operator' && currentUser?.shop_id
      ? currentUser.shop_id.toString()
      : ''
  );
  const [selectedItemName, setSelectedItemName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');

  // Data state
  const [stockItems, setStockItems] = useState([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  // Editing states (only item_name and mrp are editable — stock fields live in the ledger)
  const [editingRowId, setEditingRowId] = useState(null);
  const [editValues, setEditValues] = useState({
    item_name: '',
    mrp: '20'
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
      item_name: row.item_name || '',
      mrp: (row.mrp || 20).toString()
    });
  };

  const handleFieldChange = (field, val) => {
    setEditValues(prev => ({ ...prev, [field]: val }));
  };

  const handleSaveEdit = async (rowId) => {
    setIsSaving(true);
    try {
      const mrp = parseFloat(editValues.mrp) || 0;

      await updateCurrentStockItem(rowId, {
        item_name: editValues.item_name,
        mrp
      });

      const updateRow = row => row.id !== rowId ? row : { ...row, item_name: editValues.item_name, mrp };
      setStockItems(prev => prev.map(updateRow));
      setItemsList(prev => prev.map(row => row.id !== rowId ? row : { ...row, item_name: editValues.item_name, name: editValues.item_name, mrp }));

      setEditingRowId(null);
      showToast('Item updated successfully!');
    } catch (err) {
      console.error('Failed to save stock item edit:', err);
      showToast(`Failed to update: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (rowId) => {
    if (!window.confirm('Are you sure you want to delete this item from the database? This action is permanent and will remove the item record.')) {
      return;
    }
    try {
      await deleteItem(rowId);
      setStockItems(prev => prev.filter(row => row.id !== rowId));
      setItemsList(prev => prev.filter(row => row.id !== rowId));
      showToast('Stock item deleted successfully!');
    } catch (err) {
      console.error('Failed to delete stock item:', err);
      showToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  // 1. Load metadata (items, shops)
  useEffect(() => {
    async function loadMetadata() {
      try {
        const [items, shops] = await Promise.all([getCurrentStockItems(), getShops()]);
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

  // 2. Fetch stock items
  const loadRecords = async () => {
    setIsLoadingRecords(true);
    try {
      const records = await getCurrentStockItems({
        itemId: selectedItemId || null,
        shopId: selectedShopId || null
      });
      setStockItems(records);
    } catch (err) {
      console.error('Failed to fetch current stock items:', err);
      setStockItems([]);
    } finally {
      setIsLoadingRecords(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [selectedItemId, selectedShopId]);

  // Client side search text filter
  const filteredStockItems = useMemo(() => {
    let filtered = stockItems;
    if (selectedItemName) {
      const query = selectedItemName.toLowerCase();
      filtered = filtered.filter(row =>
        row.item_name && row.item_name.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [stockItems, selectedItemName]);

  // Summary Metrics calculations
  const summary = useMemo(() => {
    return filteredStockItems.reduce(
      (acc, row) => {
        acc.totalItems += 1;
        acc.totalStock += row.current_stock;
        acc.totalValuation += row.current_stock * row.mrp;
        return acc;
      },
      { totalItems: 0, totalStock: 0, totalValuation: 0 }
    );
  }, [filteredStockItems]);

  const handleSelectItem = (item) => {
    setSelectedItemName(item.item_name || item.name || '');
    setSelectedItemId(item.id || '');
  };

  const clearFilters = () => {
    setSelectedShopId('');
    setSelectedItemName('');
    setSelectedItemId('');
  };

  const handleExportCSV = () => {
    const headers = ['Shop Name', 'Item Name', 'Opening Qty', 'Purchase Qty', 'Closing Qty', 'Current Stock', 'MRP (₹)', 'Stock Value (₹)', 'Purchase Rate (₹)', 'Stock Value on Purchase Rate (₹)'];
    const rows = filteredStockItems.map(r => [
      r.shop_name,
      r.item_name,
      r.opening_qty,
      r.purchase_qty,
      r.closing_qty,
      r.current_stock,
      r.mrp,
      r.current_stock * r.mrp,
      r.purchase_rate || 0,
      r.current_stock * (r.purchase_rate || 0)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${('' + val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Current_Stock_Details_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    const headers = ['Shop Name', 'Item Name', 'Opening Qty', 'Purchase Qty', 'Closing Qty', 'Current Stock', 'MRP (₹)', 'Stock Value (₹)', 'Purchase Rate (₹)', 'Stock Value on Purchase Rate (₹)'];
    const rows = filteredStockItems.map(r => [
      r.shop_name,
      r.item_name,
      r.opening_qty,
      r.purchase_qty,
      r.closing_qty,
      r.current_stock,
      r.mrp,
      r.current_stock * r.mrp,
      r.purchase_rate || 0,
      r.current_stock * (r.purchase_rate || 0)
    ]);

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">`;
    html += `<head><meta charset="utf-8" /><style>table { border-collapse: collapse; } th { background-color: #f1f5f9; font-weight: bold; } th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }</style></head><body>`;
    html += `<h2>Current Stock Details Summary</h2>`;
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
    link.setAttribute("download", `Current_Stock_Details_${new Date().toISOString().split('T')[0]}.xls`);
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
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Current Stock Details</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Real-time live inventory stock valuations and metrics</p>
        </div>
      )}

      {/* Filters Form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Inventory Query Filters</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Shop Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Shop Outlet</label>
            <select
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
              disabled={currentUser?.role === 'operator'}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all ${currentUser?.role === 'operator'
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
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Product Search</label>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
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

      {/* Stock Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="font-bold text-slate-800 flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2.5 inline-block" />
            Live Inventory Items ({filteredStockItems.length})
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
                Syncing stock metrics...
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50/70 text-slate-600 text-xs font-bold uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Shop Name</th>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4 text-right w-32">Current Stock</th>
                <th className="px-6 py-4 text-right w-28">Purchase Rate (₹)</th>
                <th className="px-6 py-4 text-right w-28">MRP (₹)</th>
                <th className="px-6 py-4 text-right w-36">Stock Value on MRP (₹)</th>
                <th className="px-6 py-4 text-right w-40">Stock Value on Purchase Rate (₹)</th>
                {showActions && <th className="px-6 py-4 text-center w-36">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredStockItems.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 8 : 7} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No active stock items found. Check database or filter criteria.
                  </td>
                </tr>
              ) : (
                filteredStockItems.map((row) => {
                  const isEditing = editingRowId === row.id;
                  const currentStock = row.current_stock;
                  const purchaseRate = row.purchase_rate || 0;
                  const mrp = isEditing ? parseFloat(editValues.mrp) || 0 : row.mrp;

                  const mrpValue = currentStock * mrp;
                  const purchaseRateValue = currentStock * purchaseRate;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/40 transition-colors text-xs sm:text-sm">
                      <td className="px-6 py-4 text-slate-500 font-semibold">{row.shop_name}</td>

                      {/* Item Name */}
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editValues.item_name}
                            onChange={(e) => handleFieldChange('item_name', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-semibold focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50"
                          />
                        ) : (
                          row.item_name
                        )}
                      </td>

                      {/* Current Stock — read-only (derived from ledger) */}
                      <td className="px-6 py-4 text-right">
                        <span className="font-black text-amber-600">{currentStock}</span>
                      </td>

                      {/* Purchase Rate — read-only (comes from latest purchase entry) */}
                      <td className="px-6 py-4 text-right">
                        <span className="font-semibold text-slate-600">₹{purchaseRate}</span>
                      </td>

                      {/* MRP */}
                      <td className="px-6 py-4 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValues.mrp}
                            onChange={(e) => handleFieldChange('mrp', e.target.value)}
                            className="w-16 px-2 py-1 text-right border border-slate-300 rounded text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50"
                          />
                        ) : (
                          <span className="font-semibold text-slate-600">₹{row.mrp}</span>
                        )}
                      </td>

                      {/* Stock Value on MRP */}
                      <td className="px-6 py-4 text-right font-black text-emerald-600 bg-emerald-50/20">
                        ₹{mrpValue.toLocaleString()}
                      </td>

                      {/* Stock Value on Purchase Rate */}
                      <td className="px-6 py-4 text-right font-black text-blue-600 bg-blue-50/20">
                        ₹{purchaseRateValue.toLocaleString()}
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
                                title="Edit Item"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(row.id)}
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Item"
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