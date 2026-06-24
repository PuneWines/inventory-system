import React, { useState, useEffect, useMemo } from 'react';
import SearchableDropdown from './SearchableDropdown';
import Toast from './Toast';
import ItemDetailsModal from './ItemDetailsModal';
import PurchasedItems from './PurchasedItems';
import SaleHistory from './SaleHistory';
import CurrentStockItems from './ClosingStockItems';
import {
  getStockLedgerItems,
  getShops,
  getStockLedger,
  getStockLedgerView,
  updateStockLedgerRow,
  getSaleHistory
} from '../services/dbService';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, LineElement, PointElement } from 'chart.js';
import { Pie, Bar, Line } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, LineElement, PointElement);

const toDateStr = (d) => d.toISOString().split('T')[0];

export default function StockLedger({ currentUser }) {
  const [itemsList, setItemsList] = useState([]);
  const [shopsList, setShopsList] = useState([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedShopId, setSelectedShopId] = useState(
    currentUser?.role === 'operator' && currentUser?.shop_id 
      ? currentUser.shop_id.toString() 
      : ''
  );
  const [selectedItemName, setSelectedItemName] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');

  // Stored vs Live view toggle
  const [ledgerMode, setLedgerMode] = useState('stored'); // 'stored' | 'live'

  // Tab state dynamically initialized based on user's page_access granular permissions
  const [activeTab, setActiveTab] = useState(() => {
    const allowed = currentUser?.page_access || [];
    if (allowed.includes('ledger_table')) return 'table';
    if (allowed.includes('ledger_reports')) return 'reports';
    if (allowed.includes('ledger_purchases')) return 'purchases';
    if (allowed.includes('ledger_sales')) return 'sales';
    if (allowed.includes('ledger_closing')) return 'closing';
    return 'table';
  });
  const [reportsSubTab, setReportsSubTab] = useState('overview'); // 'overview' | 'sales'

  // Data state
  const [ledgerData, setLedgerData] = useState([]);
  const [salesHistoryData, setSalesHistoryData] = useState([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  // Editing states
  const [editingRowId, setEditingRowId] = useState(null);
  const [editValues, setEditValues] = useState({ opening_qty: '0', purchase_qty: '0', closing_qty: '0', sale_qty: '0' });
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  // Modal display states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalItem, setModalItem] = useState({ id: '', name: '' });

  const handleItemClick = (row) => {
    const item = itemsList.find(i => i.item_name === row.item_name || i.name === row.item_name);
    setModalItem({
      id: item?.id || row.item_id || '',
      name: row.item_name
    });
    setIsModalOpen(true);
  };

  // 1. Load metadata (shops)
  useEffect(() => {
    async function loadMetadata() {
      try {
        const shops = await getShops();
        setShopsList(shops);
      } catch (err) {
        console.error('Failed to load shops for filters:', err);
      } finally {
        setIsLoadingMetadata(false);
      }
    }
    loadMetadata();
  }, []);

  // 1b. Fetch items dynamically based on selectedShopId
  useEffect(() => {
    async function loadItems() {
      try {
        const items = await getStockLedgerItems(selectedShopId || null);
        setItemsList(items);
        // Clear selected item if it's not in the new shop's items list
        if (selectedItemId) {
          const exists = items.some(item => item.id === selectedItemId);
          if (!exists) {
            setSelectedItemId('');
            setSelectedItemName('');
          }
        }
      } catch (err) {
        console.error('Failed to load items for select:', err);
      }
    }
    loadItems();
  }, [selectedShopId]);

  // 2. Load ledger data whenever filters or mode change
  useEffect(() => {
    async function loadData() {
      setIsLoadingLedger(true);
      try {
        // Fetch sales history for mapping sold_qty
        const salesData = await getSaleHistory({
          fromDate,
          toDate,
          shopId: selectedShopId || null
        });
        setSalesHistoryData(salesData);

        let data = [];
        if (ledgerMode === 'stored') {
          data = await getStockLedger({
            fromDate,
            toDate,
            itemId: selectedItemId || null
          });
        } else {
          const rawView = await getStockLedgerView({
            fromDate,
            toDate,
            itemName: selectedItemName || null
          });
          // View format returned has capitals: Date, "Item Name", "Opening Quantity", etc.
          // Map to uniform fields for table compatibility
          data = rawView.map((row, idx) => ({
            id: idx,
            item_name: row['Item Name'],
            ledger_date: row['Date'],
            date_for_opening: row['Date For Opening'],
            opening_qty: row['Opening Quantity'],
            purchase_qty: row['Purchase Quantity'],
            sale_qty: row['Sale Quantity'],
            closing_qty: row['Closing Quantity']
          }));
        }

        // Map sale_qty from salesData (sale_history table)
        const mappedData = data.map(row => {
          const matchSales = salesData.filter(s =>
            s.item_name === row.item_name &&
            s.transaction_date === row.ledger_date
          );
          const soldQty = matchSales.reduce((sum, s) => sum + (parseFloat(s.sale_qty) || 0), 0);
          return {
            ...row,
            sale_qty: soldQty
          };
        });

        setLedgerData(mappedData);
      } catch (err) {
        console.error('Failed to load ledger data:', err);
        setLedgerData([]);
      } finally {
        setIsLoadingLedger(false);
      }
    }
    loadData();
  }, [fromDate, toDate, selectedItemId, selectedItemName, ledgerMode, selectedShopId]);

  // To disable page scroll when the popup/modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isModalOpen]);

  // Filter ledger data based on selected shop and search text
  const filteredLedgerData = useMemo(() => {
    let filtered = ledgerData;

    // 1. Filter by shop
    if (selectedShopId) {
      const shopItemIds = new Set(itemsList.map(item => item.id));
      filtered = filtered.filter(row => {
        const item = itemsList.find(i => i.item_name === row.item_name || i.name === row.item_name);
        const itemId = item?.id || row.item_id;
        return shopItemIds.has(itemId);
      });
    }

    // 2. Filter by search text (item name) in-memory
    if (selectedItemName) {
      const query = selectedItemName.toLowerCase();
      filtered = filtered.filter(row =>
        row.item_name && row.item_name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [ledgerData, selectedShopId, itemsList, selectedItemName]);

  // Derived Summary Card Metrics
  const summary = useMemo(() => {
    return filteredLedgerData.reduce(
      (acc, curr) => {
        acc.opening += parseFloat(curr.opening_qty) || 0;
        acc.purchase += parseFloat(curr.purchase_qty) || 0;
        acc.sale += parseFloat(curr.sale_qty) || 0;
        acc.closing += parseFloat(curr.closing_qty) || 0;
        return acc;
      },
      { opening: 0, purchase: 0, sale: 0, closing: 0 }
    );
  }, [filteredLedgerData]);

  // Prepare data for charts
  const chartData = useMemo(() => {
    // Aggregate data by item name
    const itemMap = new Map();

    filteredLedgerData.forEach(row => {
      const itemName = row.item_name;
      if (!itemMap.has(itemName)) {
        itemMap.set(itemName, {
          name: itemName,
          totalPurchase: 0,
          totalSale: 0,
          totalClosing: 0,
          totalOpening: 0
        });
      }

      const itemData = itemMap.get(itemName);
      itemData.totalPurchase += parseFloat(row.purchase_qty) || 0;
      itemData.totalSale += parseFloat(row.sale_qty) || 0;
      itemData.totalClosing += parseFloat(row.closing_qty) || 0;
      itemData.totalOpening += parseFloat(row.opening_qty) || 0;
    });

    return Array.from(itemMap.values());
  }, [filteredLedgerData]);

  // Pie chart data for purchases
  const purchasePieData = {
    labels: chartData.map(item => item.name),
    datasets: [
      {
        label: 'Total Purchase Quantity',
        data: chartData.map(item => item.totalPurchase),
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
          '#FF9F40', '#FF6384', '#C9CBCF', '#4DC9F6', '#F67019',
          '#537BC4', '#ACC236', '#166A8F', '#00A950', '#58595B'
        ],
        borderColor: '#FFFFFF',
        borderWidth: 2,
      },
    ],
  };

  // Bar chart data for item comparison
  const comparisonBarData = {
    labels: chartData.map(item => item.name),
    datasets: [
      {
        label: 'Purchased',
        data: chartData.map(item => item.totalPurchase),
        backgroundColor: 'rgba(54, 162, 235, 0.8)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 2,
      },
      {
        label: 'Sold',
        data: chartData.map(item => item.totalSale),
        backgroundColor: 'rgba(255, 99, 132, 0.8)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 2,
      },
      {
        label: 'Closing Stock',
        data: chartData.map(item => item.totalClosing),
        backgroundColor: 'rgba(255, 206, 86, 0.8)',
        borderColor: 'rgba(255, 206, 86, 1)',
        borderWidth: 2,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Item Comparison: Purchase vs Sale vs Closing Stock',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Quantity',
        },
      },
    },
  };

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          font: {
            size: 12,
          },
        },
      },
      title: {
        display: true,
        text: 'Purchase Distribution by Item',
        font: {
          size: 16,
        },
      },
    },
  };

  // Group sales history by date and product
  const filteredSalesData = useMemo(() => {
    let filtered = salesHistoryData;
    if (selectedItemName) {
      const query = selectedItemName.toLowerCase();
      filtered = filtered.filter(row =>
        row.item_name && row.item_name.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [salesHistoryData, selectedItemName]);

  const salesChartData = useMemo(() => {
    // 1. Group by Item Name for Pie Chart
    const productMap = new Map();
    // 2. Group by Date for Line/Bar Chart (Trend)
    const dateMap = new Map();

    filteredSalesData.forEach(row => {
      // Group by Item Name
      const itemName = row.item_name;
      const qty = parseFloat(row.sale_qty) || 0;
      productMap.set(itemName, (productMap.get(itemName) || 0) + qty);

      // Group by Date
      const date = row.transaction_date;
      dateMap.set(date, (dateMap.get(date) || 0) + qty);
    });

    // Sort dates chronologically
    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => new Date(a) - new Date(b));
    const dateValues = sortedDates.map(date => dateMap.get(date));

    // Sort products by total quantity sold descending
    const productData = Array.from(productMap.entries())
      .map(([name, totalSales]) => ({ name, totalSales }))
      .sort((a, b) => b.totalSales - a.totalSales);

    return {
      dates: sortedDates,
      salesByDate: dateValues,
      products: productData
    };
  }, [filteredSalesData]);

  // Pie chart for sales distribution
  const salesPieData = {
    labels: salesChartData.products.map(p => p.name),
    datasets: [
      {
        label: 'Total Units Sold',
        data: salesChartData.products.map(p => p.totalSales),
        backgroundColor: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
          '#FF9F40', '#FF6384', '#C9CBCF', '#4DC9F6', '#F67019',
          '#537BC4', '#ACC236', '#166A8F', '#00A950', '#58595B'
        ],
        borderColor: '#FFFFFF',
        borderWidth: 2,
      }
    ]
  };

  // Line chart for sales trend
  const salesTrendLineData = {
    labels: salesChartData.dates,
    datasets: [
      {
        label: 'Units Sold',
        data: salesChartData.salesByDate,
        borderColor: '#6366F1', // Indigo-500
        backgroundColor: 'rgba(99, 102, 241, 0.15)', // Indigo-500 fill
        borderWidth: 3,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#4F46E5', // Indigo-600
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }
    ]
  };

  const salesTrendOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: { size: 12, weight: 'bold' }
        }
      },
      title: {
        display: true,
        text: 'Sales Quantity Trend Over Time',
        font: { size: 16, weight: 'bold' }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Quantity'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Date'
        }
      }
    }
  };

  const salesPieOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          font: { size: 12 }
        }
      },
      title: {
        display: true,
        text: 'Sales Distribution by Product',
        font: { size: 16, weight: 'bold' }
      }
    }
  };

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

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  const handleStartEdit = (row) => {
    setEditingRowId(row.id);
    setEditValues({
      opening_qty: (row.opening_qty || 0).toString(),
      purchase_qty: (row.purchase_qty || 0).toString(),
      closing_qty: (row.closing_qty || 0).toString(),
      sale_qty: (row.sale_qty || 0).toString()
    });
  };

  const handleFieldChange = (field, val) => {
    setEditValues(prev => {
      const updated = { ...prev, [field]: val };
      const op = parseFloat(updated.opening_qty) || 0;
      const pu = parseFloat(updated.purchase_qty) || 0;
      const cl = parseFloat(updated.closing_qty) || 0;
      updated.sale_qty = (op + pu - cl).toString();
      return updated;
    });
  };

  const handleSaveEdit = async (rowId) => {
    setIsSaving(true);
    try {
      const op = parseFloat(editValues.opening_qty) || 0;
      const pu = parseFloat(editValues.purchase_qty) || 0;
      const cl = parseFloat(editValues.closing_qty) || 0;
      const sa = parseFloat(editValues.sale_qty) || 0;

      await updateStockLedgerRow(rowId, {
        opening_qty: op,
        purchase_qty: pu,
        closing_qty: cl,
        sale_qty: sa
      });

      setLedgerData(prev => prev.map(row => {
        if (row.id === rowId) {
          return {
            ...row,
            opening_qty: op,
            purchase_qty: pu,
            closing_qty: cl,
            sale_qty: sa
          };
        }
        return row;
      }));

      setEditingRowId(null);
      showToast('Ledger row updated successfully!');
    } catch (err) {
      console.error('Failed to update ledger row:', err);
      showToast(`Failed to update row: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 relative">
      <Toast notification={notification} onClose={() => setNotification(null)} />

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Stock Ledger Reports</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Historical audit of item transactions & stock levels</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap space-x-6 sm:space-x-8" aria-label="Tabs">
          {currentUser?.page_access?.includes('ledger_table') && (
            <button
              onClick={() => setActiveTab('table')}
              className={`
                py-4 px-1 border-b-2 font-bold text-xs sm:text-sm uppercase tracking-wider
                ${activeTab === 'table'
                  ? 'border-indigo-600 text-indigo-600 font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
              `}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Table View
              </span>
            </button>
          )}
          {currentUser?.page_access?.includes('ledger_reports') && (
            <button
              onClick={() => setActiveTab('reports')}
              className={`
                py-4 px-1 border-b-2 font-bold text-xs sm:text-sm uppercase tracking-wider
                ${activeTab === 'reports'
                  ? 'border-indigo-600 text-indigo-600 font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
              `}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Reports & Charts
              </span>
            </button>
          )}
          {currentUser?.page_access?.includes('ledger_purchases') && (
            <button
              onClick={() => setActiveTab('purchases')}
              className={`
                py-4 px-1 border-b-2 font-bold text-xs sm:text-sm uppercase tracking-wider
                ${activeTab === 'purchases'
                  ? 'border-indigo-600 text-indigo-600 font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
              `}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                Purchase Items
              </span>
            </button>
          )}
          {currentUser?.page_access?.includes('ledger_sales') && (
            <button
              onClick={() => setActiveTab('sales')}
              className={`
                py-4 px-1 border-b-2 font-bold text-xs sm:text-sm uppercase tracking-wider
                ${activeTab === 'sales'
                  ? 'border-indigo-600 text-indigo-600 font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
              `}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Sales History
              </span>
            </button>
          )}
          {currentUser?.page_access?.includes('ledger_closing') && (
            <button
              onClick={() => setActiveTab('closing')}
              className={`
                py-4 px-1 border-b-2 font-bold text-xs sm:text-sm uppercase tracking-wider
                ${activeTab === 'closing'
                  ? 'border-indigo-600 text-indigo-600 font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}
              `}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Current Stock Details
              </span>
            </button>
          )}
        </nav>
      </div>

      {/* Filter Options Desk */}
      {(activeTab === 'table' || activeTab === 'reports') && (
        <div className="bg-white border border-slate-200 p-6 space-y-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Report Filter Settings</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {/* Shop Outlet */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Shop Outlet</label>
              <select
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                disabled={currentUser?.role === 'operator'}
                className={`w-full border rounded-sm px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${
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

            {/* From Date */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-2">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full bg-slate-50/70 border border-slate-300 rounded-sm px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-2">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full bg-slate-50/70 border border-slate-300 rounded-sm px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* Product Dropdown */}
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-xs font-bold uppercase text-slate-400 mb-2">
                Item Select
              </label>
              <div className="flex gap-2.5">
                <div className="flex-1">
                  <SearchableDropdown
                    value={selectedItemName}
                    onChange={handleSelectItem}
                    onSearchChange={(val) => {
                      setSelectedItemName(val);
                      setSelectedItemId('');
                    }}
                    items={itemsList}
                    placeholder="All Snack Products..."
                  />
                </div>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center justify-center px-4 rounded-sm text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 active:scale-95 border border-slate-200 transition-all cursor-pointer whitespace-nowrap"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'table' && currentUser?.page_access?.includes('ledger_table') ? (
        // Table View
        <div className="bg-white border border-slate-200 shadow-none overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 mr-2.5 inline-block" />
              Ledger Rows ({filteredLedgerData.length})
            </h3>
            {isLoadingLedger && (
              <div className="flex items-center text-xs font-semibold text-slate-400">
                <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Updating report data...
              </div>
            )}
          </div>

          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="sticky top-0 z-20 bg-white text-slate-600 text-xs font-bold uppercase tracking-wider shadow-sm">
                <tr>
                  <th className="px-6 py-4">Item Name</th>
                  <th className="px-6 py-4 w-32">Date</th>
                  <th className="px-6 py-4 w-36">Date For Opening</th>
                  <th className="px-6 py-4 w-28 text-right">Opening Qty</th>
                  <th className="px-6 py-4 w-28 text-right">Purchased Qty</th>
                  <th className="px-6 py-4 w-28 text-right">Current Qty</th>
                  <th className="px-6 py-4 w-28 text-right">Sold Qty</th>
                  <th className="px-6 py-4 w-28 text-right">Closing Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredLedgerData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400 font-medium">
                      No matching ledger rows found in range. Try adjusting filter date range or mode.
                    </td>
                  </tr>
                ) : (
                  filteredLedgerData.map((row) => {
                    const isEditing = row.id === editingRowId;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/40 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-900">
                          <button
                            type="button"
                            onClick={() => handleItemClick(row)}
                            className="hover:text-indigo-600 hover:underline text-left cursor-pointer transition-all duration-200 outline-none"
                          >
                            {row.item_name}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{row.ledger_date}</td>
                        <td className="px-6 py-4 text-slate-400 whitespace-nowrap">{row.date_for_opening || '—'}</td>

                        {/* Opening Qty */}
                        <td className="px-6 py-3 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editValues.opening_qty}
                              onChange={(e) => handleFieldChange('opening_qty', e.target.value)}
                              disabled={isSaving}
                              className="w-20 bg-white border border-slate-300 rounded-sm px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          ) : (
                            <span className="font-semibold text-slate-700">{row.opening_qty}</span>
                          )}
                        </td>

                        {/* Purchased Qty */}
                        <td className="px-6 py-3 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editValues.purchase_qty}
                              onChange={(e) => handleFieldChange('purchase_qty', e.target.value)}
                              disabled={isSaving}
                              className="w-20 bg-white border border-slate-300 rounded-sm px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          ) : (
                            <span className="font-semibold text-indigo-600">+{row.purchase_qty}</span>
                          )}
                        </td>

                        {/* Current Qty (Opening + Purchase) */}
                        <td className="px-6 py-3 text-right">
                          <span className="font-semibold text-slate-500">
                            {isEditing
                              ? ((parseFloat(editValues.opening_qty) || 0) + (parseFloat(editValues.purchase_qty) || 0))
                              : ((parseFloat(row.opening_qty) || 0) + (parseFloat(row.purchase_qty) || 0))
                            }
                          </span>
                        </td>

                        {/* Sold Qty */}
                        <td className="px-6 py-3 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editValues.sale_qty}
                              readOnly
                              disabled
                              className="w-20 bg-slate-50 border border-slate-200 rounded-sm px-2 py-1 text-xs text-right text-violet-500 font-bold select-none cursor-not-allowed"
                            />
                          ) : (
                            <span className="font-semibold text-violet-600">-{row.sale_qty}</span>
                          )}
                        </td>

                        {/* Closing Qty */}
                        <td className="px-6 py-3 text-right font-bold text-amber-600">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editValues.closing_qty}
                              onChange={(e) => handleFieldChange('closing_qty', e.target.value)}
                              disabled={isSaving}
                              className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          ) : (
                            <span>{row.closing_qty}</span>
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
      ) : activeTab === 'reports' && currentUser?.page_access?.includes('ledger_reports') ? (
        // Reports View
        <div className="space-y-6">
          {/* Reports Sub-tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setReportsSubTab('overview')}
              className={`
                py-2.5 px-4 font-bold text-xs uppercase tracking-wider border-b-2
                ${reportsSubTab === 'overview'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'}
                transition-all duration-200 cursor-pointer
              `}
            >
              Overview
            </button>
            <button
              onClick={() => setReportsSubTab('sales')}
              className={`
                py-2.5 px-4 font-bold text-xs uppercase tracking-wider border-b-2
                ${reportsSubTab === 'sales'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'}
                transition-all duration-200 cursor-pointer
              `}
            >
              Sales
            </button>
          </div>

          {reportsSubTab === 'overview' ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 p-6 rounded-lg">
                  <p className="text-sm font-medium text-slate-500">Total Opening Stock</p>
                  <p className="text-2xl font-bold text-slate-900">{summary.opening}</p>
                </div>
                <div className="bg-white border border-slate-200 p-6 rounded-lg">
                  <p className="text-sm font-medium text-slate-500">Total Purchases</p>
                  <p className="text-2xl font-bold text-indigo-600">{summary.purchase}</p>
                </div>
                <div className="bg-white border border-slate-200 p-6 rounded-lg">
                  <p className="text-sm font-medium text-slate-500">Total Sales</p>
                  <p className="text-2xl font-bold text-violet-600">{summary.sale}</p>
                </div>
                <div className="bg-white border border-slate-200 p-6 rounded-lg">
                  <p className="text-sm font-medium text-slate-500">Total Closing Stock</p>
                  <p className="text-2xl font-bold text-amber-600">{summary.closing}</p>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Pie Chart */}
                <div className="bg-white border border-slate-200 p-6 rounded-lg">
                  {chartData.length > 0 ? (
                    <div className="h-[400px] flex items-center justify-center">
                      <Pie data={purchasePieData} options={pieOptions} />
                    </div>
                  ) : (
                    <div className="h-[400px] flex items-center justify-center text-slate-400">
                      <div className="text-center">
                        <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <p>No data available for charts</p>
                        <p className="text-xs mt-1">Adjust your filters to see visualizations</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bar Chart */}
                <div className="bg-white border border-slate-200 p-6 rounded-lg">
                  {chartData.length > 0 ? (
                    <div className="h-[400px] flex items-center justify-center">
                      <Bar data={comparisonBarData} options={barOptions} />
                    </div>
                  ) : (
                    <div className="h-[400px] flex items-center justify-center text-slate-400">
                      <div className="text-center">
                        <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <p>No data available for charts</p>
                        <p className="text-xs mt-1">Adjust your filters to see visualizations</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Report - Top Items Table */}
              {chartData.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200">
                    <h4 className="font-semibold text-slate-800">Item Summary Report</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Item Name</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Opening Stock</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Total Purchased</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Total Sold</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Closing Stock</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {chartData.map((item, index) => (
                          <tr key={index} className="hover:bg-slate-50">
                            <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                            <td className="px-6 py-4 text-right text-slate-700">{item.totalOpening}</td>
                            <td className="px-6 py-4 text-right text-indigo-600 font-semibold">{item.totalPurchase}</td>
                            <td className="px-6 py-4 text-right text-violet-600 font-semibold">{item.totalSale}</td>
                            <td className="px-6 py-4 text-right text-amber-600 font-bold">{item.totalClosing}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 font-semibold">
                        <tr>
                          <td className="px-6 py-4 text-slate-900">Total</td>
                          <td className="px-6 py-4 text-right text-slate-900">{summary.opening}</td>
                          <td className="px-6 py-4 text-right text-indigo-600">{summary.purchase}</td>
                          <td className="px-6 py-4 text-right text-violet-600">{summary.sale}</td>
                          <td className="px-6 py-4 text-right text-amber-600">{summary.closing}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Sales Analysis subtab */}
              {/* Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 p-6 rounded-lg shadow-sm">
                  <p className="text-sm font-medium text-slate-500">Total Units Sold</p>
                  <p className="text-2xl font-bold text-violet-600">
                    {salesChartData.products.reduce((acc, curr) => acc + curr.totalSales, 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 p-6 rounded-lg shadow-sm">
                  <p className="text-sm font-medium text-slate-500">Products Sold</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {salesChartData.products.length}
                  </p>
                </div>


              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Trend Line Chart */}
                <div className="bg-white border border-slate-200 p-6 rounded-lg shadow-sm">
                  {salesChartData.dates.length > 0 ? (
                    <div className="h-[400px] flex items-center justify-center">
                      <Line data={salesTrendLineData} options={salesTrendOptions} />
                    </div>
                  ) : (
                    <div className="h-[400px] flex items-center justify-center text-slate-400">
                      <div className="text-center">
                        <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <p className="font-bold">No sales trend data</p>
                        <p className="text-xs mt-1">Adjust filters or record sales in closing stock</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Distribution Pie Chart */}
                <div className="bg-white border border-slate-200 p-6 rounded-lg shadow-sm">
                  {salesChartData.products.length > 0 ? (
                    <div className="h-[400px] flex items-center justify-center">
                      <Pie data={salesPieData} options={salesPieOptions} />
                    </div>
                  ) : (
                    <div className="h-[400px] flex items-center justify-center text-slate-400">
                      <div className="text-center">
                        <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                        </svg>
                        <p className="font-bold">No sales distribution data</p>
                        <p className="text-xs mt-1">Adjust filters or record sales in closing stock</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Sales Summary Table */}
              {salesChartData.products.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-200">
                    <h4 className="font-semibold text-slate-800">Product Sales Summary</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Item Name</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Units Sold</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Sales Share (%)</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {salesChartData.products.map((item, index) => {
                          const totalSalesUnits = salesChartData.products.reduce((acc, curr) => acc + curr.totalSales, 0);
                          const share = totalSalesUnits > 0 ? ((item.totalSales / totalSalesUnits) * 100).toFixed(1) : '0.0';
                          return (
                            <tr key={index} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-semibold text-slate-900">{item.name}</td>
                              <td className="px-6 py-4 text-right text-violet-600 font-bold">{item.totalSales.toLocaleString()}</td>
                              <td className="px-6 py-4 text-right text-slate-600 font-medium">
                                <div className="flex items-center justify-end gap-3">
                                  <span>{share}%</span>
                                  <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden hidden sm:block">
                                    <div
                                      className="bg-indigo-500 h-full rounded-full"
                                      style={{ width: `${share}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 font-semibold border-t border-slate-200">
                        <tr>
                          <td className="px-6 py-4 text-slate-900">Total</td>
                          <td className="px-6 py-4 text-right text-violet-600 font-extrabold">
                            {salesChartData.products.reduce((acc, curr) => acc + curr.totalSales, 0).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-right text-slate-900">100.0%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : activeTab === 'purchases' && currentUser?.page_access?.includes('ledger_purchases') ? (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl">
          <PurchasedItems hideHeader={true} currentUser={currentUser} showActions={false} />
        </div>
      ) : activeTab === 'sales' && currentUser?.page_access?.includes('ledger_sales') ? (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl">
          <SaleHistory hideHeader={true} currentUser={currentUser} showActions={false} />
        </div>
      ) : activeTab === 'closing' && currentUser?.page_access?.includes('ledger_closing') ? (
        <div className="bg-white border border-slate-200 p-6 rounded-2xl">
          <CurrentStockItems hideHeader={true} currentUser={currentUser} showActions={false} />
        </div>
      ) : null}

      {/* Item Details Popup Modal */}
      <ItemDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        itemName={modalItem.name}
        itemId={modalItem.id}
        initialFromDate={fromDate}
        initialToDate={toDate}
      />
    </div>
  );
}