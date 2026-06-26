import React, { useState, useEffect, useMemo } from 'react';
import { getManagerReports, getShops } from '../services/dbService';
import Toast from './Toast';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export default function ManagerReport({ currentUser }) {
  const [shopsList, setShopsList] = useState([]);
  const [selectedShopName, setSelectedShopName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportsData, setReportsData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Load shops for filters
  useEffect(() => {
    async function loadShops() {
      try {
        const shops = await getShops();
        setShopsList(shops || []);
      } catch (err) {
        console.error('Failed to load shops:', err);
      }
    }
    loadShops();
  }, []);

  // Fetch report data
  useEffect(() => {
    async function fetchReports() {
      setIsLoading(true);
      try {
        const data = await getManagerReports({
          fromDate,
          toDate,
          shopName: selectedShopName || null
        });
        setReportsData(data || []);
      } catch (err) {
        console.error('Failed to fetch manager reports:', err);
        showToast('Failed to fetch manager reports from database.', 'error');
      } finally {
        setIsLoading(false);
      }
    }
    fetchReports();
  }, [fromDate, toDate, selectedShopName]);

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  // Helper to safely format numbers as currency
  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  // Calculate Aggregated Metrics (KPIs)
  const summaryMetrics = useMemo(() => {
    return reportsData.reduce(
      (acc, row) => {
        const gpay = parseFloat(row.gpay_amount ?? row.gpay ?? 0);
        const cash = parseFloat(row.cash_amount ?? row.cash ?? 0);
        const expense = parseFloat(row.expense_amount ?? row.expense ?? 0);
        const balance = parseFloat(row.balance ?? 0);

        acc.totalGpay += gpay;
        acc.totalCash += cash;
        acc.totalExpense += expense;
        acc.totalBalance += balance;
        return acc;
      },
      {
        totalGpay: 0,
        totalCash: 0,
        totalExpense: 0,
        totalBalance: 0
      }
    );
  }, [reportsData]);

  // Prepare Chart Data
  const sortedReports = useMemo(() => {
    // Sort reports chronologically for the line chart
    return [...reportsData].sort((a, b) => new Date(a.report_date ?? a.transaction_date) - new Date(b.report_date ?? b.transaction_date));
  }, [reportsData]);

  const lineChartData = {
    labels: sortedReports.map(r => r.report_date ?? r.transaction_date ?? ''),
    datasets: [
      {
        label: 'Balance',
        data: sortedReports.map(r => parseFloat(r.balance ?? 0)),
        borderColor: '#6366F1', // Indigo 500
        backgroundColor: 'rgba(99, 102, 241, 0.05)',
        borderWidth: 3,
        tension: 0.3,
        pointBackgroundColor: '#4F46E5',
        pointHoverRadius: 7,
      },
      {
        label: 'GPay Collections',
        data: sortedReports.map(r => parseFloat(r.gpay_amount ?? r.gpay ?? 0)),
        borderColor: '#3B82F6', // Blue 500
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        borderWidth: 3,
        tension: 0.3,
        pointBackgroundColor: '#2563EB',
        pointHoverRadius: 7,
      },
      {
        label: 'Expenses',
        data: sortedReports.map(r => parseFloat(r.expense_amount ?? r.expense ?? 0)),
        borderColor: '#EF4444', // Red 500
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        pointBackgroundColor: '#DC2626',
        pointHoverRadius: 6,
      }
    ]
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { font: { weight: 'bold', size: 11 } }
      },
      tooltip: {
        padding: 12,
        cornerRadius: 8,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#F1F5F9' },
        ticks: { font: { size: 10 } }
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } }
      }
    }
  };

  const doughnutChartData = {
    labels: ['GPay Collections', 'Cash Collections', 'Expenses Logged'],
    datasets: [
      {
        data: [
          summaryMetrics.totalGpay,
          summaryMetrics.totalCash,
          summaryMetrics.totalExpense
        ],
        backgroundColor: [
          '#3B82F6', // Blue 500
          '#10B981', // Emerald 500
          '#EF4444'  // Red 500
        ],
        borderColor: '#FFFFFF',
        borderWidth: 3,
        hoverOffset: 10
      }
    ]
  };

  const doughnutChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: { font: { size: 11, weight: '600' }, boxWidth: 15 }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const val = context.raw || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
            return ` ${context.label}: ${formatCurrency(val)} (${pct}%)`;
          }
        }
      }
    },
    cutout: '65%'
  };

  const clearFilters = () => {
    setSelectedShopName('');
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="space-y-8 relative">
      <Toast notification={notification} onClose={() => setNotification(null)} />



      {/* Filter Control Desk */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-600" />
          Filter Settings
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Shop Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Shop Location</label>
            <select
              value={selectedShopName}
              onChange={(e) => setSelectedShopName(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-slate-50/50 cursor-pointer"
            >
              <option value="">-- All Locations --</option>
              {shopsList.map(s => (
                <option key={s.id} value={s.shop_name}>{s.shop_name}</option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-slate-50/50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-slate-50/50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Reset Action */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={clearFilters}
              className="w-full inline-flex items-center justify-center h-[42px] px-4 rounded-xl text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer whitespace-nowrap active:scale-95"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>


      {/* Reports Table Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-800 flex items-center">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 mr-2.5 inline-block" />
            Reports Registry ({reportsData.length})
          </h3>
          {isLoading && (
            <div className="flex items-center text-xs font-semibold text-slate-400">
              <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Fetching latest report entries...
            </div>
          )}
        </div>

        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="sticky top-0 z-20 bg-white text-slate-600 text-xs font-bold uppercase tracking-wider shadow-sm border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Report Date</th>
                <th className="px-6 py-4">Shop name</th>
                <th className="px-6 py-4 text-right">GPay Amt</th>
                <th className="px-6 py-4 text-right">Cash Amt</th>
                <th className="px-6 py-4 text-right">Expenses </th>
                <th className="px-6 py-4 text-right text-indigo-600">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {reportsData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-slate-400 font-medium bg-slate-50/20">
                    <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="font-bold text-slate-600">No consolidated reports found</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your date range or select a different shop location.</p>
                  </td>
                </tr>
              ) : (
                reportsData.map((row, idx) => {
                  const gpay = parseFloat(row.gpay_amount ?? row.gpay ?? 0);
                  const cash = parseFloat(row.cash_amount ?? row.cash ?? 0);
                  const expense = parseFloat(row.expense_amount ?? row.expense ?? 0);
                  const balance = parseFloat(row.balance ?? 0);

                  return (
                    <tr key={row.id || idx} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900 whitespace-nowrap">
                        {row.report_date ?? row.transaction_date}
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium whitespace-nowrap">
                        {row.shop_name ?? 'Global Outlet'}
                      </td>
                      <td className="px-6 py-4 text-right text-blue-600 font-semibold">
                        {formatCurrency(gpay)}
                      </td>
                      <td className="px-6 py-4 text-right text-emerald-600 font-semibold">
                        {formatCurrency(cash)}
                      </td>
                      <td className="px-6 py-4 text-right text-rose-500 font-medium">
                        {formatCurrency(expense)}
                      </td>
                      <td className="px-6 py-4 text-right text-indigo-600 font-bold">
                        {formatCurrency(balance)}
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