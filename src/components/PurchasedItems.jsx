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

export default function PurchasedItems() {
  const [itemsList, setItemsList] = useState([]);
  const [vendorsList, setVendorsList] = useState([]);
  const [shopsList, setShopsList] = useState([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

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
    <div className="space-y-8 relative">
      <Toast notification={notification} onClose={() => setNotification(null)} />

      {/* Page Header */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Purchase Logs</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Record registry of stock orders purchased from vendors</p>
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

          {/* Shop Outlet */}
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
                <th className="px-6 py-4 text-right w-28">Rate</th>
                <th className="px-6 py-4 text-right w-24">Qty</th>
                <th className="px-6 py-4 text-right w-24">GST %</th>
                <th className="px-6 py-4 text-right w-36">Discount</th>
                <th className="px-6 py-4 text-right w-28">Total (₹)</th>
                <th className="px-6 py-4 text-center w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {purchaseRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No matching purchase records found. Try adjusting filter selections.
                  </td>
                </tr>
              ) : (
                purchaseRecords.map((row) => {
                  const isEditing = row.id === editingRowId;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/40 transition-colors text-xs sm:text-sm">
                      <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-medium">{row.transaction_date}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{row.item_name}</td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{row.vendor_name}</td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{row.shop_name}</td>

                      {/* Rate */}
                      <td className="px-6 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={editValues.purchase_rate}
                            onChange={(e) => handleFieldChange('purchase_rate', e.target.value)}
                            disabled={isSaving}
                            className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        ) : (
                          <span className="font-medium text-slate-700">₹{row.purchase_rate.toFixed(2)}</span>
                        )}
                      </td>

                      {/* Qty */}
                      <td className="px-6 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editValues.quantity}
                            onChange={(e) => handleFieldChange('quantity', e.target.value)}
                            disabled={isSaving}
                            className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        ) : (
                          <span className="font-bold text-slate-800">{row.quantity}</span>
                        )}
                      </td>

                      {/* GST */}
                      <td className="px-6 py-3 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editValues.gst_percent}
                            onChange={(e) => handleFieldChange('gst_percent', e.target.value)}
                            disabled={isSaving}
                            className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        ) : (
                          <span className="text-slate-500 font-medium">{row.gst_percent}%</span>
                        )}
                      </td>

                      {/* Discount */}
                      <td className="px-6 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center space-x-1 justify-end">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={editValues.discount}
                              onChange={(e) => handleFieldChange('discount', e.target.value)}
                              disabled={isSaving}
                              className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <select
                              value={editValues.discount_type}
                              onChange={(e) => handleFieldChange('discount_type', e.target.value)}
                              disabled={isSaving}
                              className="bg-white border border-slate-300 rounded-lg px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                              <option value="%">%</option>
                              <option value="₹">₹</option>
                            </select>
                          </div>
                        ) : (
                          <span className="text-rose-500 font-medium">
                            {row.discount > 0 ? `-${row.discount_type === '%' ? '' : '₹'}${row.discount}${row.discount_type === '%' ? '%' : ''}` : '—'}
                          </span>
                        )}
                      </td>

                      {/* Total */}
                      <td className="px-6 py-3 text-right">
                        <span className="font-extrabold text-indigo-600">
                          ₹{(isEditing ? calculateEditTotal(editValues) : row.total_amount).toFixed(2)}
                        </span>
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
                              type="button"
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
