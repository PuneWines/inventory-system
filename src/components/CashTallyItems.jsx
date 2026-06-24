import React, { useState, useEffect, useMemo } from 'react';
import Toast from './Toast';
import {
  getShops,
  getDailySalesSummary,
  updateDailySalesSummaryRow,
  deleteDailySalesSummaryRow
} from '../services/dbService';

export default function CashTallyItems({ hideHeader = false, currentUser, showActions = false }) {
  const [shopsList, setShopsList] = useState([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedShopId, setSelectedShopId] = useState(
    currentUser?.role === 'operator' && currentUser?.shop_id
      ? currentUser.shop_id.toString()
      : ''
  );

  // Data state
  const [records, setRecords] = useState([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);

  // Editing states
  const [editingRowId, setEditingRowId] = useState(null);
  const [editValues, setEditValues] = useState({
    gpay_amount: '0',
    cash_amount: '0',
    expense_amount: '0'
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
      gpay_amount: (row.gpay_amount || 0).toString(),
      cash_amount: (row.cash_amount || 0).toString(),
      expense_amount: (row.expense_amount || 0).toString()
    });
  };

  const handleFieldChange = (field, val) => {
    setEditValues(prev => ({
      ...prev,
      [field]: val
    }));
  };

  const calculateLiveTotal = (vals) => {
    const gpay = parseFloat(vals.gpay_amount) || 0;
    const cash = parseFloat(vals.cash_amount) || 0;
    const expense = parseFloat(vals.expense_amount) || 0;
    return gpay + cash - expense;
  };

  const handleSaveEdit = async (rowId) => {
    setIsSaving(true);
    try {
      const gpay = parseFloat(editValues.gpay_amount) || 0;
      const cash = parseFloat(editValues.cash_amount) || 0;
      const expense = parseFloat(editValues.expense_amount) || 0;
      const totalClosing = gpay + cash - expense;

      await updateDailySalesSummaryRow(rowId, {
        gpay_amount: gpay,
        cash_amount: cash,
        expense_amount: expense,
        total_closing_amount: totalClosing
      });

      // Update locally
      setRecords(prev => prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            gpay_amount: gpay,
            cash_amount: cash,
            expense_amount: expense,
            total_closing_amount: totalClosing
          };
        }
        return row;
      }));

      setEditingRowId(null);
      showToast('Daily sales record updated successfully!');
    } catch (err) {
      console.error('Failed to save daily sales edit:', err);
      showToast(`Failed to update: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (rowId) => {
    if (!window.confirm('Are you sure you want to delete this daily sales record? This will also remove its operational entry from history.')) {
      return;
    }
    try {
      await deleteDailySalesSummaryRow(rowId);
      setRecords(prev => prev.filter(row => row.id !== rowId));
      showToast('Daily sales record deleted successfully!');
    } catch (err) {
      console.error('Failed to delete daily sales record:', err);
      showToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  // 1. Load shops metadata
  useEffect(() => {
    async function loadMetadata() {
      try {
        const shops = await getShops();
        setShopsList(shops);
      } catch (err) {
        console.error('Failed to load shops:', err);
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
        const data = await getDailySalesSummary({
          fromDate,
          toDate,
          shopId: selectedShopId || null
        });
        setRecords(data);
      } catch (err) {
        console.error('Failed to fetch daily sales summary:', err);
        setRecords([]);
      } finally {
        setIsLoadingRecords(false);
      }
    }
    loadRecords();
  }, [fromDate, toDate, selectedShopId]);

  // Summary Metrics calculations
  const summary = useMemo(() => {
    return records.reduce(
      (acc, row) => {
        acc.gpay += parseFloat(row.gpay_amount) || 0;
        acc.cash += parseFloat(row.cash_amount) || 0;
        acc.expense += parseFloat(row.expense_amount) || 0;
        acc.netSales += parseFloat(row.total_closing_amount) || 0;
        return acc;
      },
      { gpay: 0, cash: 0, expense: 0, netSales: 0 }
    );
  }, [records]);

  const clearFilters = () => {
    setFromDate('');
    setToDate('');
    setSelectedShopId('');
  };

  return (
    <div className="space-y-8 relative">
      <Toast notification={notification} onClose={() => setNotification(null)} />

      {/* Page Header */}
      {!hideHeader && (
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-sans">Cash Tally Logs</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium font-sans">Record registry of daily shop sales summaries and operational tallies</p>
        </div>
      )}



      {/* Filters Form */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Log Query Filters</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-end">
          {/* From Date */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-slate-50/70 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Shop Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Shop Outlet</label>
            <div className="flex gap-4">
              <select
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                disabled={currentUser?.role === 'operator'}
                className={`flex-1 border rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all ${currentUser?.role === 'operator'
                  ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-50/70 border-slate-300 cursor-pointer'
                  }`}
              >
                {currentUser?.role !== 'operator' && <option value="">-- All Outlets --</option>}
                {shopsList.map(s => (
                  <option key={s.id} value={s.id}>{s.shop_name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={clearFilters}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cash Tally Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-none overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2.5 inline-block" />
            Cash Tally Sheets ({records.length})
          </h3>
          {isLoadingRecords && (
            <div className="flex items-center text-xs font-semibold text-slate-400">
              <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-emerald-500" fill="none" viewBox="0 0 24 24">
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
                <th className="px-6 py-4">Shop Name</th>
                <th className="px-6 py-4 text-right w-36">G-Pay Balance (₹)</th>
                <th className="px-6 py-4 text-right w-36">Cash Balance (₹)</th>
                <th className="px-6 py-4 text-right w-36">Expense (₹)</th>
                <th className="px-6 py-4 text-right w-40">Net Sales Amount (₹)</th>

              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 7 : 6} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No matching cash tally sheets found. Try adjusting filter selections.
                  </td>
                </tr>
              ) : (
                records.map((row) => {
                  const isEditing = editingRowId === row.id;
                  const liveTotal = isEditing ? calculateLiveTotal(editValues) : row.total_closing_amount;

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/40 transition-colors text-xs sm:text-sm">
                      <td className="px-6 py-4 text-slate-500 whitespace-nowrap font-medium">{row.transaction_date}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{row.shop_name}</td>

                      {/* G-Pay Amount */}
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="relative inline-block">
                            <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400 text-[10px]">₹</span>
                            <input
                              type="number"
                              value={editValues.gpay_amount}
                              onChange={(e) => handleFieldChange('gpay_amount', e.target.value)}
                              className="w-28 pl-5 pr-2 py-1 text-right border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50"
                              step="any"
                            />
                          </div>
                        ) : (
                          <span className="font-medium text-slate-600">₹{row.gpay_amount.toFixed(2)}</span>
                        )}
                      </td>

                      {/* Cash Amount */}
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="relative inline-block">
                            <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400 text-[10px]">₹</span>
                            <input
                              type="number"
                              value={editValues.cash_amount}
                              onChange={(e) => handleFieldChange('cash_amount', e.target.value)}
                              className="w-28 pl-5 pr-2 py-1 text-right border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50"
                              step="any"
                            />
                          </div>
                        ) : (
                          <span className="font-medium text-slate-600">₹{row.cash_amount.toFixed(2)}</span>
                        )}
                      </td>

                      {/* Expense Amount */}
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="relative inline-block">
                            <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-slate-400 text-[10px]">₹</span>
                            <input
                              type="number"
                              value={editValues.expense_amount}
                              onChange={(e) => handleFieldChange('expense_amount', e.target.value)}
                              className="w-28 pl-5 pr-2 py-1 text-right border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50"
                              step="any"
                            />
                          </div>
                        ) : (
                          <span className="font-semibold text-rose-600">₹{row.expense_amount.toFixed(2)}</span>
                        )}
                      </td>

                      {/* Total Closing Amount */}
                      <td className="px-6 py-3 text-right font-extrabold text-indigo-600">
                        ₹{liveTotal.toFixed(2)}
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
