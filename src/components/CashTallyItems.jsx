import React, { useState, useEffect, useMemo } from 'react';
import Toast from './Toast';
import {
  getShops,
  getDailySalesSummary,
  updateDailySalesSummaryRow,
  deleteDailySalesSummaryRow,
  getTodayTotalSales
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

  // Today's sales state
  const [todaySales, setTodaySales] = useState({
    gpay: 0,
    cash: 0,
    expense: 0,
    netSales: 0,
    totalSalesAmt: 0
  });
  const [isLoadingTodaySales, setIsLoadingTodaySales] = useState(true);

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

  // CSV Export Handler
  const handleExportCSV = () => {
    const headers = ['Date', 'Shop Name', 'G-Pay Amount (₹)', 'Cash Amount (₹)', 'Expense (₹)', 'Net Sales (₹)', 'Total Sales Amt (₹)', 'Difference (₹)'];
    const rows = records.map(r => [
      r.transaction_date,
      r.shop_name,
      r.gpay_amount.toFixed(2),
      r.cash_amount.toFixed(2),
      r.expense_amount.toFixed(2),
      r.total_closing_amount.toFixed(2),
      (r.total_sales_amt || 0).toFixed(2),
      ((r.total_sales_amt || 0) - r.total_closing_amount).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${('' + val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Cash_Tally_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Excel Export Handler
  const handleExportExcel = () => {
    const headers = ['Date', 'Shop Name', 'G-Pay Amount (₹)', 'Cash Amount (₹)', 'Expense (₹)', 'Net Sales (₹)', 'Total Sales Amt (₹)', 'Difference (₹)'];
    const rows = records.map(r => [
      r.transaction_date,
      r.shop_name,
      r.gpay_amount || 0,
      r.cash_amount || 0,
      r.expense_amount || 0,
      r.total_closing_amount || 0,
      r.total_sales_amt || 0,
      ((r.total_sales_amt || 0) - (r.total_closing_amount || 0))
    ]);

    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">`;
    html += `<head><meta charset="utf-8" /><style>table { border-collapse: collapse; } th { background-color: #f1f5f9; font-weight: bold; } th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; }</style></head><body>`;
    html += `<h2>Cash Tally Logs Summary</h2>`;
    html += `<p>Generated on: ${new Date().toLocaleString()}</p>`;
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
    link.setAttribute("download", `Cash_Tally_Logs_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    return gpay + cash;
  };

  const handleSaveEdit = async (rowId) => {
    setIsSaving(true);
    try {
      const gpay = parseFloat(editValues.gpay_amount) || 0;
      const cash = parseFloat(editValues.cash_amount) || 0;
      const expense = parseFloat(editValues.expense_amount) || 0;
      const totalClosing = gpay + cash;

      await updateDailySalesSummaryRow(rowId, {
        gpay_amount: gpay,
        cash_amount: cash,
        expense_amount: expense,
        total_closing_amount: totalClosing
      });

      // Update locally
      setRecords(prev =>
        prev.map(row => {
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
        })
      );

      // Refresh today's sales after update
      await loadTodaySales();

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
      // Refresh today's sales after delete
      await loadTodaySales();
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

  // 2. Load today's sales
  const loadTodaySales = async () => {
    setIsLoadingTodaySales(true);
    try {
      const shopId = selectedShopId || (currentUser?.role === 'operator' ? currentUser.shop_id : null);
      const totals = await getTodayTotalSales(shopId);
      setTodaySales(totals);
    } catch (err) {
      console.error('Failed to fetch today\'s sales:', err);
      setTodaySales({ gpay: 0, cash: 0, expense: 0, netSales: 0, totalSalesAmt: 0 });
    } finally {
      setIsLoadingTodaySales(false);
    }
  };

  // 3. Fetch records
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
    loadTodaySales();
  }, [fromDate, toDate, selectedShopId]);

  // Summary Metrics calculations for filtered records
  const summary = useMemo(() => {
    return records.reduce(
      (acc, row) => {
        acc.gpay += parseFloat(row.gpay_amount) || 0;
        acc.cash += parseFloat(row.cash_amount) || 0;
        acc.expense += parseFloat(row.expense_amount) || 0;
        acc.netSales += parseFloat(row.total_closing_amount) || 0;
        acc.totalSalesAmt += parseFloat(row.total_sales_amt) || 0;
        return acc;
      },
      { gpay: 0, cash: 0, expense: 0, netSales: 0, totalSalesAmt: 0 }
    );
  }, [records]);

  const clearFilters = () => {
    setFromDate('');
    setToDate('');
    setSelectedShopId('');
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `₹${amount.toFixed(2)}`;
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

          {/* Export Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={handleExportCSV}
              disabled={records.length === 0}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
            <button
              onClick={handleExportExcel}
              disabled={records.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Excel
            </button>
          </div>
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
                <th className="px-6 py-4 text-right w-40">Total Sales Amt (₹)</th>
                <th className="px-6 py-4 text-right w-36">Diff (₹)</th>
                {showActions && <th className="px-6 py-4 text-center w-36">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={showActions ? 8 : 7} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No matching cash tally sheets found. Try adjusting filter selections.
                  </td>
                </tr>
              ) : (
                records.map((row) => {
                  const isEditing = editingRowId === row.id;
                  const liveTotal = row.total_closing_amount;

                  const diff =
                    (parseFloat(row.total_sales_amt) || 0) -
                    (parseFloat(row.total_closing_amount) || 0);

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

                      {/* Total Sales Amount */}
                      <td className="px-6 py-3 text-right font-extrabold text-purple-600">
                        ₹{(row.total_sales_amt || 0).toFixed(2)}
                      </td>

                      <td
                        className={`px-6 py-3 text-right font-bold ${diff === 0
                          ? 'text-emerald-600'
                          : diff > 0
                            ? 'text-amber-600'
                            : 'text-rose-600'
                          }`}
                      >
                        ₹{diff.toFixed(2)}
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