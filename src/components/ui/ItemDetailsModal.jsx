import React, { useState, useEffect, useMemo } from 'react';
import { getPurchasedItems, getSaleHistory, getClosingStockItems } from '../../services/dbService';

export default function ItemDetailsModal({
  isOpen,
  onClose,
  itemName,
  itemId,
  initialFromDate = '',
  initialToDate = ''
}) {
  const [activeTab, setActiveTab] = useState('purchases'); // 'purchases' | 'sales' | 'closing'
  const [fromDate, setFromDate] = useState(initialFromDate);
  const [toDate, setToDate] = useState(initialToDate);
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Synchronize modal dates with initial parent dates when modal opens/item changes
  useEffect(() => {
    if (isOpen) {
      setFromDate(initialFromDate);
      setToDate(initialToDate);
      setActiveTab('purchases'); // Reset tab to purchases on open
    }
  }, [isOpen, itemId, initialFromDate, initialToDate]);

  // Fetch records whenever tab, dates, itemId, or itemName changes
  useEffect(() => {
    if (!isOpen || !itemName) return;

    let isMounted = true;
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        let fetched = [];
        if (activeTab === 'purchases') {
          fetched = await getPurchasedItems({
            fromDate: fromDate || null,
            toDate: toDate || null,
            itemId: itemId || null
          });
        } else if (activeTab === 'sales') {
          fetched = await getSaleHistory({
            fromDate: fromDate || null,
            toDate: toDate || null,
            itemName: itemName
          });
        } else if (activeTab === 'closing') {
          fetched = await getClosingStockItems({
            fromDate: fromDate || null,
            toDate: toDate || null,
            itemId: itemId || null
          });
        }

        if (isMounted) {
          setRecords(fetched);
        }
      } catch (err) {
        console.error(`Failed to fetch ${activeTab} data for item:`, err);
        if (isMounted) {
          setError(err.message || 'Something went wrong while fetching data.');
          setRecords([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeTab, fromDate, toDate, itemId, itemName]);

  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Derived Summary metrics based on records and active tab
  const tabSummary = useMemo(() => {
    if (!records.length) return null;
    if (activeTab === 'purchases') {
      return records.reduce(
        (acc, r) => {
          acc.totalQty += parseFloat(r.quantity) || 0;
          acc.totalCost += parseFloat(r.total_amount) || 0;
          return acc;
        },
        { totalQty: 0, totalCost: 0 }
      );
    } else if (activeTab === 'sales') {
      return records.reduce(
        (acc, r) => {
          acc.totalQty += parseFloat(r.sale_qty) || 0;
          return acc;
        },
        { totalQty: 0 }
      );
    } else if (activeTab === 'closing') {
      return records.reduce(
        (acc, r) => {
          acc.totalQty += parseFloat(r.total_qty) || 0;
          acc.godownQty += parseFloat(r.godown_qty) || 0;
          acc.counterQty += parseFloat(r.counter_qty) || 0;
          return acc;
        },
        { totalQty: 0, godownQty: 0, counterQty: 0 }
      );
    }
    return null;
  }, [records, activeTab]);

  if (!isOpen) return null;

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
        hour12: true
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 sm:p-6 md:p-10 animate-fade-in">
      {/* Backdrop click closer */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative bg-white rounded-sm shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-hidden transform transition-all duration-300 scale-100 z-10">

        {/* Modal Header */}
        <div className="px-6 sm:px-8 py-5 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 block mb-1">Product Details Lookup</span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{itemName}</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Audit transaction history, sales records, and physical counts</p>
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 sm:static p-2.5 rounded-xl hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 transition-colors active:scale-95 cursor-pointer"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Toolbar: Dates & Tabs */}
        <div className="px-6 sm:px-8 py-4 bg-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-5">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/50">
            {[
              { id: 'purchases', label: 'Purchase Items' },
              { id: 'sales', label: 'Sales History' },
              { id: 'closing', label: 'Closing Stock Details' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setRecords([]);
                }}
                className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${activeTab === tab.id
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date Picker Range */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-slate-50/70 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-slate-50/70 border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
            <button
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer active:scale-95 transition-all p-1"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Modal Body / Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-slate-50/50">



          {/* Main Results Board */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <svg className="animate-spin h-8 w-8 text-indigo-600 mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm font-bold text-slate-500">Querying transaction log...</span>
            </div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-500 block mb-1">Database Error</span>
              <p className="text-sm text-rose-700 font-medium">{error}</p>
            </div>
          ) : records.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs">
              <svg className="w-10 h-10 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h4 className="font-bold text-slate-800">No records found</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">There are no logged entries for this item matching the selected date ranges.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                {activeTab === 'purchases' && (
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5">Date</th>
                        <th className="px-6 py-3.5">Vendor</th>
                        <th className="px-6 py-3.5">Shop Outlet</th>
                        <th className="px-6 py-3.5 text-right w-24">Rate</th>
                        <th className="px-6 py-3.5 text-right w-20">Qty</th>
                        <th className="px-6 py-3.5 text-right w-20">GST %</th>
                        <th className="px-6 py-3.5 text-right w-28">Discount</th>
                        <th className="px-6 py-3.5 text-right w-28">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white text-xs sm:text-sm">
                      {records.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-3 text-slate-500 whitespace-nowrap font-medium">{row.transaction_date}</td>
                          <td className="px-6 py-3 font-semibold text-slate-900">{row.vendor_name}</td>
                          <td className="px-6 py-3 text-slate-500 font-medium">{row.shop_name}</td>
                          <td className="px-6 py-3 text-right text-slate-600">₹{row.purchase_rate.toFixed(2)}</td>
                          <td className="px-6 py-3 text-right font-bold text-slate-800">{row.quantity}</td>
                          <td className="px-6 py-3 text-right text-slate-500">{row.gst_percent}%</td>
                          <td className="px-6 py-3 text-right text-rose-500 font-medium">
                            {row.discount > 0 ? `-${row.discount_type === '%' ? '' : '₹'}${row.discount}${row.discount_type === '%' ? '%' : ''}` : '—'}
                          </td>
                          <td className="px-6 py-3 text-right font-black text-indigo-600">₹{row.total_amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeTab === 'sales' && (
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5">Logged Date & Time</th>
                        <th className="px-6 py-3.5">Transaction Date</th>
                        <th className="px-6 py-3.5">Shop Outlet</th>
                        <th className="px-6 py-3.5 text-right w-32">Units Sold</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white text-xs sm:text-sm">
                      {records.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-3 text-slate-400 whitespace-nowrap font-medium">{formatDateTime(row.created_at)}</td>
                          <td className="px-6 py-3 text-slate-500 whitespace-nowrap font-semibold">{row.transaction_date}</td>
                          <td className="px-6 py-3 text-slate-500 font-medium">{row.shop_name}</td>
                          <td className="px-6 py-3 text-right font-extrabold text-emerald-600">
                            {row.sale_qty > 0 ? `${row.sale_qty}` : '0'} units
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeTab === 'closing' && (
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5">Date</th>
                        <th className="px-6 py-3.5">Shop Outlet</th>
                        <th className="px-6 py-3.5 text-right w-36">Yesterday's Closing</th>
                        <th className="px-6 py-3.5 text-right w-28">Godown Qty</th>
                        <th className="px-6 py-3.5 text-right w-28">Counter Qty</th>
                        <th className="px-6 py-3.5 text-right w-32">Total Closing Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white text-xs sm:text-sm">
                      {records.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-3 text-slate-500 whitespace-nowrap font-medium">{row.transaction_date}</td>
                          <td className="px-6 py-3 text-slate-500 font-medium">{row.shop_name}</td>
                          <td className="px-6 py-3 text-right text-slate-400 font-medium">{row.last_closing_qty}</td>
                          <td className="px-6 py-3 text-right text-slate-600 font-medium">{row.godown_qty}</td>
                          <td className="px-6 py-3 text-right text-slate-600 font-medium">{row.counter_qty}</td>
                          <td className="px-6 py-3 text-right font-extrabold text-amber-600">{row.total_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
