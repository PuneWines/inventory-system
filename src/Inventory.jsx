import React, { useState, useEffect, useMemo, useCallback } from 'react';
import SearchableDropdown from './components/SearchableDropdown';
import Toast from './components/Toast';
import PurchasedItems from './components/PurchasedItems';
import {
  getItems,
  getVendors,
  getShops,
  getStockLedgerSnapshot,
  submitPurchaseTransaction,
  submitClosingStockTransaction,
  submitSaleAmountTransaction
} from './services/dbService';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for a given Date object */
const toDateStr = (d) => d.toISOString().split('T')[0];

/** Yesterday's date string */
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateStr(d);
};

export default function Inventory() {
  const [quantityType, setQuantityType] = useState('Purchase Quantity');
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [submitHistory, setSubmitHistory] = useState([]);
  const [notification, setNotification] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = () => setRefreshKey(prev => prev + 1);

  // Items & vendors
  const [itemsList, setItemsList] = useState([]);
  const [vendorsList, setVendorsList] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [isLoadingItems, setIsLoadingItems] = useState(true);

  // Shops
  const [shopsList, setShopsList] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [isLoadingShops, setIsLoadingShops] = useState(true);

  // Stock ledger snapshot for the selected date
  const [ledgerSnapshot, setLedgerSnapshot] = useState({});
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState({});

  // ─────────────────────────────────────────────────────────────────────────
  // Load items + vendors + shops (with optional refresh flag)
  // ─────────────────────────────────────────────────────────────────────────
  const loadInitialData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      setIsLoadingItems(true);
      setIsLoadingShops(true);
    }
    try {
      const [items, vendors, shops] = await Promise.all([getItems(selectedShopId), getVendors(selectedShopId), getShops()]);
      setItemsList(items);
      setVendorsList(vendors);
      setShopsList(shops);
      if (shops && shops.length > 0 && !selectedShopId) {
        setSelectedShopId(shops[0].id.toString());
      }
    } catch (err) {
      console.error('Failed to load initial data from DB:', err);
    } finally {
      setIsLoadingItems(false);
      setIsLoadingShops(false);
    }
  }, [selectedShopId]);

  useEffect(() => {
    loadInitialData();
  }, []);





  // ─────────────────────────────────────────────────────────────────────────
  // Load ledger snapshot whenever date changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadLedger() {
      setIsLoadingLedger(true);
      try {
        const snapshot = await getStockLedgerSnapshot(date);
        setLedgerSnapshot(snapshot);
      } catch (err) {
        console.error('Failed to load ledger snapshot:', err);
        setLedgerSnapshot({});
      } finally {
        setIsLoadingLedger(false);
      }
    }
    loadLedger();
  }, [date]);

  // ─────────────────────────────────────────────────────────────────────────
  // Load vendors whenever shop changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadVendorsForShop() {
      if (!selectedShopId) return;
      try {
        const vendors = await getVendors(selectedShopId);
        setVendorsList(vendors);
      } catch (err) {
        console.error('Failed to load vendors for shop:', err);
      }
    }
    loadVendorsForShop();
  }, [selectedShopId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Load items whenever shop changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadItemsForShop() {
      if (!selectedShopId) return;
      setIsLoadingItems(true);
      try {
        const items = await getItems(selectedShopId);
        setItemsList(items);
      } catch (err) {
        console.error('Failed to load items for shop:', err);
      } finally {
        setIsLoadingItems(false);
      }
    }
    loadItemsForShop();
  }, [selectedShopId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived: current available stock for an item
  // ─────────────────────────────────────────────────────────────────────────
  const getAvailableStock = useCallback((itemId) => {
    if (!itemId) return 0;
    const item = itemsList.find(i => i.id === itemId || i.id.toString() === itemId.toString());
    return item ? parseFloat(item.current_stock) || 0 : 0;
  }, [itemsList]);

  // ─────────────────────────────────────────────────────────────────────────
  // Toast helper
  // ─────────────────────────────────────────────────────────────────────────
  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 1: Purchase Quantity State
  // ─────────────────────────────────────────────────────────────────────────
  const [purchaseRows, setPurchaseRows] = useState([
    { id: '1', itemId: '', itemName: '', mrp: '', rate: '', quantity: '0', discount: '0', discountType: '%', gst: '0' }
  ]);

  const addPurchaseRow = () => {
    setPurchaseRows(prev => [
      ...prev,
      { id: Date.now().toString(), itemId: '', itemName: '', mrp: '', rate: '', quantity: '0', discount: '0', discountType: '%', gst: '0' }
    ]);
  };

  const removePurchaseRow = (id) => {
    if (purchaseRows.length === 1) {
      setPurchaseRows([{ id: '1', itemId: '', itemName: '', mrp: '', rate: '', quantity: '0', discount: '0', discountType: '%', gst: '0' }]);
      return;
    }
    setPurchaseRows(prev => prev.filter(row => row.id !== id));
  };

  const updatePurchaseRow = (id, field, value) => {
    setPurchaseRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      if (field === 'item') {
        const itemId = value.id || '';
        const itemMrp = (value.mrp !== undefined && value.mrp !== null) ? value.mrp.toString() : '';
        return {
          ...row,
          itemId,
          itemName: value.item_name || value.name || '',
          mrp: itemMrp,
          rate: '',
          quantity: '0',
          gst: '0'
        };
      }
      return { ...row, [field]: value };
    }));
  };

  const calculateRowTotal = (row) => {
    const rate = parseFloat(row.rate) || 0;
    const qty = parseFloat(row.quantity) || 0;
    const disc = parseFloat(row.discount) || 0;
    const gstVal = parseFloat(row.gst) || 0;
    const baseAmount = rate * qty;
    const discountAmt = row.discountType === '%' ? baseAmount * (disc / 100) : disc;
    const subtotal = Math.max(0, baseAmount - discountAmt);
    const gstAmt = subtotal * (gstVal / 100);
    return subtotal + gstAmt;
  };

  const grandTotal = useMemo(() =>
    purchaseRows.reduce((acc, row) => acc + calculateRowTotal(row), 0),
    [purchaseRows]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 2: Closing Quantity State
  // ─────────────────────────────────────────────────────────────────────────
  const [closingItem, setClosingItem] = useState('');
  const [closingItemId, setClosingItemId] = useState('');
  const [godownQty, setGodownQty] = useState('');
  const [counterQty, setCounterQty] = useState('');
  const [isFetchingClosing, setIsFetchingClosing] = useState(false);

  const [closingOpeningQty, setClosingOpeningQty] = useState(0);
  const [closingPurchaseQty, setClosingPurchaseQty] = useState(0);

  const selectedItemObj = useMemo(() => {
    return itemsList.find(i => i.id === closingItemId || i.id.toString() === closingItemId.toString());
  }, [itemsList, closingItemId]);

  const maxClosingAllowed = selectedItemObj ? parseFloat(selectedItemObj.current_stock) || 0 : 0;

  const currentClosingQty = useMemo(() => {
    const g = parseFloat(godownQty) || 0;
    const c = parseFloat(counterQty) || 0;
    return g + c;
  }, [godownQty, counterQty]);

  const isClosingOverflow = closingItemId !== '' && currentClosingQty > maxClosingAllowed;

  const handleSelectClosingItem = async (selectedItem) => {
    const name = selectedItem.item_name || selectedItem.name || '';
    setClosingItem(name);
    setClosingItemId(selectedItem.id || '');
    setErrors(prev => ({ ...prev, closingItem: null, closingOverflow: null }));
    setGodownQty('');
    setCounterQty('');

    if (selectedItem.id) {
      setIsFetchingClosing(true);
      try {
        const snap = ledgerSnapshot[selectedItem.id];
        if (snap) {
          setClosingOpeningQty(snap.opening_qty || 0);
          setClosingPurchaseQty(snap.purchase_qty || 0);
        } else {
          setClosingOpeningQty(0);
          setClosingPurchaseQty(0);
        }
      } finally {
        setIsFetchingClosing(false);
      }
    } else {
      setClosingOpeningQty(0);
      setClosingPurchaseQty(0);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MODE 3: Sale Amount State
  // ─────────────────────────────────────────────────────────────────────────
  const [gpayBalance, setGpayBalance] = useState('');
  const [cashBalance, setCashBalance] = useState('');
  const [expense, setExpense] = useState('');

  // ─────────────────────────────────────────────────────────────────────────
  // FORM SUBMISSION
  // ─────────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    const newErrors = {};

    // ── Purchase ──────────────────────────────────────────────────────────
    if (quantityType === 'Purchase Quantity') {
      purchaseRows.forEach((row) => {
        if (!row.itemId) newErrors[`item_${row.id}`] = 'Please select a product';
        if (!row.rate || parseFloat(row.rate) < 0) newErrors[`rate_${row.id}`] = 'Enter valid rate';
        if (!row.quantity || parseFloat(row.quantity) <= 0) newErrors[`qty_${row.id}`] = 'Enter quantity';
        if (parseFloat(row.discount) < 0) newErrors[`disc_${row.id}`] = 'Enter valid discount';
        if (parseFloat(row.gst) < 0) newErrors[`gst_${row.id}`] = 'Enter valid GST';
      });

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        showToast('Please resolve errors in the purchase rows.', 'error');
        return;
      }

      setIsSubmitting(true);
      try {
        const payload = purchaseRows.map(row => ({
          itemId: row.itemId,
          itemName: row.itemName,
          rate: parseFloat(row.rate),
          quantity: parseFloat(row.quantity),
          discount: parseFloat(row.discount),
          discountType: row.discountType,
          gst: parseFloat(row.gst),
          total: calculateRowTotal(row)
        }));

        await submitPurchaseTransaction(date, selectedVendorId, payload, selectedShopId);
        setSubmitHistory(prev => [{
          date, type: quantityType, items: payload,
          grandTotal
        }, ...prev]);
        showToast(`Purchase logged! Total: ₹${grandTotal.toFixed(2)}`);
        setPurchaseRows([{ id: '1', itemId: '', itemName: '', mrp: '', rate: '', quantity: '0', discount: '0', discountType: '%', gst: '0' }]);
        setSelectedVendorId('');
        setIsFormOpen(false);
        triggerRefresh();
        await Promise.all([
          loadInitialData(true),
          getStockLedgerSnapshot(date).then(snap => setLedgerSnapshot(snap))
        ]);
      } catch (err) {
        showToast(`Failed to submit purchase: ${err.message}`, 'error');
      } finally {
        setIsSubmitting(false);
      }

      // ── Closing Stock ─────────────────────────────────────────────────────
    } else if (quantityType === 'Closing Quantity') {
      if (!closingItemId) newErrors.closingItem = 'Please select a product';
      if (godownQty !== '' && parseFloat(godownQty) < 0) newErrors.godownQty = 'Cannot be negative';
      if (counterQty !== '' && parseFloat(counterQty) < 0) newErrors.counterQty = 'Cannot be negative';
      if (godownQty === '' && counterQty === '') newErrors.godownQty = 'Enter godown or counter quantity';

      if (closingItemId && currentClosingQty > maxClosingAllowed) {
        newErrors.closingOverflow = `Closing qty (${currentClosingQty}) cannot exceed available stock (Opening ${closingOpeningQty} + Purchase ${closingPurchaseQty} = ${maxClosingAllowed})`;
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        if (newErrors.closingOverflow) {
          showToast(`❌ Closing qty exceeds available stock of ${maxClosingAllowed} units!`, 'error');
        }
        return;
      }

      setIsSubmitting(true);
      try {
        const salesQty = maxClosingAllowed - currentClosingQty;
        await submitClosingStockTransaction(
          date,
          closingItemId,
          closingItem,
          closingOpeningQty,
          godownQty || 0,
          counterQty || 0,
          currentClosingQty,
          salesQty,
          selectedShopId
        );
        setSubmitHistory(prev => [{
          date, type: quantityType,
          itemName: closingItem,
          openingQty: closingOpeningQty,
          purchaseQty: closingPurchaseQty,
          godownQuantity: parseFloat(godownQty) || 0,
          counterQuantity: parseFloat(counterQty) || 0,
          currentClosing: currentClosingQty
        }, ...prev]);
        showToast(`Closing stock saved: ${closingItem} → ${currentClosingQty} units`);
        setClosingItem('');
        setClosingItemId('');
        setClosingOpeningQty(0);
        setClosingPurchaseQty(0);
        setGodownQty('');
        setCounterQty('');
        setIsFormOpen(false);
        triggerRefresh();
        await Promise.all([
          loadInitialData(true),
          getStockLedgerSnapshot(date).then(snap => setLedgerSnapshot(snap))
        ]);
      } catch (err) {
        showToast(`Failed to submit closing stock: ${err.message}`, 'error');
      } finally {
        setIsSubmitting(false);
      }

      // ── Sale Amount ───────────────────────────────────────────────────────
    } else if (quantityType === 'Sale Amount') {
      if (gpayBalance === '' && cashBalance === '' && expense === '') {
        newErrors.gpayBalance = 'Provide at least one financial entry';
        setErrors(newErrors);
        return;
      }
      if (gpayBalance !== '' && parseFloat(gpayBalance) < 0) newErrors.gpayBalance = 'Cannot be negative';
      if (cashBalance !== '' && parseFloat(cashBalance) < 0) newErrors.cashBalance = 'Cannot be negative';
      if (expense !== '' && parseFloat(expense) < 0) newErrors.expense = 'Cannot be negative';

      if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

      const totalClosing = (parseFloat(gpayBalance) || 0) + (parseFloat(cashBalance) || 0) - (parseFloat(expense) || 0);

      setIsSubmitting(true);
      try {
        await submitSaleAmountTransaction(date, gpayBalance || 0, cashBalance || 0, expense || 0, totalClosing, selectedShopId);
        setSubmitHistory(prev => [{
          date, type: quantityType,
          gpay: parseFloat(gpayBalance) || 0,
          cash: parseFloat(cashBalance) || 0,
          expense: parseFloat(expense) || 0,
          netTotal: totalClosing
        }, ...prev]);
        showToast(`Financial sheet logged: Net = ₹${totalClosing.toFixed(2)}`);
        setGpayBalance('');
        setCashBalance('');
        setExpense('');
        setIsFormOpen(false);
        triggerRefresh();
      } catch (err) {
        showToast(`Failed to submit sales summary: ${err.message}`, 'error');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      <Toast notification={notification} onClose={() => setNotification(null)} />

      {/* Submitting Loading Overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center transition-all duration-300">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center space-y-4">
            <div className="flex justify-center">
              <div className="relative flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                <div className="absolute w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-indigo-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Submitting Data</h3>
              <p className="text-xs text-slate-500 mt-1">Please wait while we record this entry in the ledger.</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-10xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-none overflow-hidden mb-10">

        {/* ── Banner with Open Form Button ─────────────────────────────── */}
        <div className="p-6 md:p-8 border-b border-slate-200 bg-slate-50/55 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="text-center md:text-left">
              <div className="inline-flex items-center justify-center p-3.5 bg-amber-500 rounded-2xl ring-1 ring-amber-400/20 mb-4 md:mb-0">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="md:ml-4 md:inline-block">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">VISHAL Snacks Inventory Form</h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Daily operational entry desk</p>
              </div>
            </div>

            {/* Open Form Button */}
            <button
              onClick={() => setIsFormOpen(true)}
              className="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all duration-200 shadow-md hover:shadow-lg active:scale-95"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Open Entry Form
            </button>
          </div>

          {(isLoadingItems || isLoadingLedger) && (
            <div className="mt-3 inline-flex items-center text-xs font-semibold text-slate-400">
              <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {isLoadingItems ? 'Connecting database...' : 'Loading stock data...'}
            </div>
          )}
        </div>

        {/* ── Main Content Area ────────────────────────────────────────── */}
        <div className="p-6 md:p-8">
          {/* Purchased Items Component */}
          <PurchasedItems key={refreshKey} />
        </div>
      </div>

      {/* ── FORM POPUP MODAL ────────────────────────────────────────────── */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10">
          {/* Background overlay */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
            onClick={() => setIsFormOpen(false)}
          />

          {/* Modal panel */}
          <div className="relative bg-white shadow-2xl rounded-2xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden transform transition-all z-10">
            {/* Modal Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">New Inventory Entry</h3>
                <p className="text-xs text-slate-500">Fill in the details below to record your transaction</p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body - Form */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <form onSubmit={handleSubmit} className="space-y-8">
                  {/* ── Common Header ─────────────────────────────────────── */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200">
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Date</label>
                      <input
                        type="date"
                        required
                        value={date}
                        onChange={(e) => { setDate(e.target.value); setErrors({}); }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Shop Location</label>
                      <select
                        value={selectedShopId}
                        onChange={(e) => { setSelectedShopId(e.target.value); setErrors({}); }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                      >
                        {isLoadingShops ? (
                          <option>Loading shops...</option>
                        ) : (
                          shopsList.map(s => (
                            <option key={s.id} value={s.id}>{s.shop_name}</option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Entry Type</label>
                      <select
                        value={quantityType}
                        onChange={(e) => { setQuantityType(e.target.value); setErrors({}); }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                      >
                        <option value="Purchase Quantity">Purchase Quantity</option>
                        <option value="Closing Quantity">Closing Quantity</option>
                        <option value="Sale Amount">Sale Amount</option>
                      </select>
                    </div>
                  </div>

                  {/* ════════════════════════════════════════════════════════
                      MODE 1 — PURCHASE QUANTITY
                  ═══════════════════════════════════════════════════════════ */}
                  {quantityType === 'Purchase Quantity' && (
                    <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-4">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center whitespace-nowrap">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 mr-2.5 inline-block" />
                          Purchase Items
                        </h3>
                        <div className="flex items-center space-x-2.5 w-full sm:max-w-xs">
                          <label className="text-xs font-bold uppercase text-slate-500 whitespace-nowrap">Vendor:</label>
                          <select
                            value={selectedVendorId}
                            onChange={(e) => setSelectedVendorId(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                          >
                            <option value="">-- Select Vendor --</option>
                            {vendorsList.map(v => (
                              <option key={v.id} value={v.id}>{v.vendor_name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {purchaseRows.map((row, index) => {
                          const rowTotal = calculateRowTotal(row);
                          const availStock = row.itemId ? getAvailableStock(row.itemId) : null;
                          return (
                            <div
                              key={row.id}
                              className="relative p-5 bg-slate-50/40 border border-slate-200 rounded-xl hover:border-slate-300 transition-all space-y-0 group"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Item #{index + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => removePurchaseRow(row.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 transition-colors cursor-pointer"
                                  title="Remove Row"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                                <div className="md:col-span-3">
                                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase w-4">Item Name</label>
                                  <SearchableDropdown
                                    value={row.itemName}
                                    onChange={(selectedItem) => updatePurchaseRow(row.id, 'item', selectedItem)}
                                    items={itemsList}
                                    placeholder="Select Snack..."
                                    error={errors[`item_${row.id}`]}
                                  />
                                </div>

                                <div className="md:col-span-1">
                                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">MRP</label>
                                  <input
                                    type="text"
                                    readOnly
                                    value={row.mrp ? `₹${row.mrp}` : '—'}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm text-slate-500 text-center font-semibold select-none"
                                  />
                                </div>

                                <div className="md:col-span-2">
                                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Rate (₹)</label>
                                  <input
                                    type="number" min="0" step="any" required
                                    value={row.rate}
                                    onChange={(e) => updatePurchaseRow(row.id, 'rate', e.target.value)}
                                    placeholder="Rate"
                                    className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${errors[`rate_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                                      }`}
                                  />
                                </div>

                                <div className="md:col-span-1">
                                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Qty</label>
                                  <input
                                    type="number" min="0" required
                                    value={row.quantity}
                                    onChange={(e) => updatePurchaseRow(row.id, 'quantity', e.target.value)}
                                    placeholder="Qty"
                                    className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${errors[`qty_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                                      }`}
                                  />
                                </div>

                                <div className="md:col-span-1">
                                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Disc.</label>
                                  <input
                                    type="number" min="0" step="any"
                                    value={row.discount}
                                    onChange={(e) => updatePurchaseRow(row.id, 'discount', e.target.value)}
                                    placeholder="0"
                                    className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${errors[`disc_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                                      }`}
                                  />
                                </div>

                                <div className="md:col-span-1">
                                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Unit</label>
                                  <select
                                    value={row.discountType}
                                    onChange={(e) => updatePurchaseRow(row.id, 'discountType', e.target.value)}
                                    className="w-full bg-white border border-slate-300 rounded-xl px-2 py-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                                  >
                                    <option value="%">%</option>
                                    <option value="₹">₹</option>
                                  </select>
                                </div>

                                <div className="md:col-span-1">
                                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">GST %</label>
                                  <input
                                    type="number" min="0"
                                    value={row.gst}
                                    onChange={(e) => updatePurchaseRow(row.id, 'gst', e.target.value)}
                                    placeholder="GST"
                                    className={`w-full bg-white border rounded-xl px-2 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${errors[`gst_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                                      }`}
                                  />
                                </div>

                                <div className="md:col-span-2">
                                  <label className="block text-[11px] font-bold text-indigo-600 mb-1.5 uppercase">Total</label>
                                  <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-xs font-extrabold text-right text-indigo-600 select-none">
                                    ₹{rowTotal.toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={addPurchaseRow}
                            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all cursor-pointer"
                          >
                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Item Row
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-end pt-4 border-t border-slate-200">
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 w-full sm:max-w-xs text-right">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Grand Total</span>
                          <div className="text-3xl font-extrabold text-indigo-600 tracking-tight mt-1 flex items-baseline justify-end">
                            <span className="text-indigo-500 text-lg mr-1 font-bold">₹</span>
                            <span>{grandTotal.toFixed(2)}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">Updates live as items edit</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ════════════════════════════════════════════════════════
                      MODE 2 — CLOSING QUANTITY
                  ═══════════════════════════════════════════════════════════ */}
                  {quantityType === 'Closing Quantity' && (
                    <div className="space-y-6">
                      <div className="pb-3 border-b border-slate-200">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2.5 inline-block" />
                          Closing Quantity
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-5">
                          <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Item Name</label>
                            <SearchableDropdown
                              value={closingItem}
                              onChange={handleSelectClosingItem}
                              items={itemsList}
                              placeholder="Select Snack..."
                              error={errors.closingItem}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Godown Qty</label>
                              <input
                                type="number" min="0"
                                value={godownQty}
                                onChange={(e) => {
                                  setGodownQty(e.target.value);
                                  setErrors(prev => ({ ...prev, godownQty: null, closingOverflow: null }));
                                }}
                                placeholder="0"
                                className={`w-full bg-white border rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${errors.godownQty || isClosingOverflow ? 'border-rose-500 ring-2 ring-rose-500/10' : 'border-slate-300 focus:border-indigo-500'
                                  }`}
                              />
                              {errors.godownQty && <span className="text-[11px] text-rose-500 mt-1 block">{errors.godownQty}</span>}
                            </div>
                            <div>
                              <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Counter Qty</label>
                              <input
                                type="number" min="0"
                                value={counterQty}
                                onChange={(e) => {
                                  setCounterQty(e.target.value);
                                  setErrors(prev => ({ ...prev, counterQty: null, closingOverflow: null }));
                                }}
                                placeholder="0"
                                className={`w-full bg-white border rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${errors.counterQty || isClosingOverflow ? 'border-rose-500 ring-2 ring-rose-500/10' : 'border-slate-300 focus:border-indigo-500'
                                  }`}
                              />
                              {errors.counterQty && <span className="text-[11px] text-rose-500 mt-1 block">{errors.counterQty}</span>}
                            </div>
                          </div>

                          {isClosingOverflow && (
                            <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl p-3.5">
                              <svg className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <div>
                                <p className="text-xs font-bold text-rose-700">Stock Overflow — Cannot Submit</p>
                                <p className="text-[11px] text-rose-600 mt-0.5">
                                  You entered <strong>{currentClosingQty}</strong> units but available stock is only <strong>{maxClosingAllowed}</strong> (Opening {closingOpeningQty} + Purchase {closingPurchaseQty}).
                                  Reduce Godown or Counter qty.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-between gap-4">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between py-2 border-b border-slate-200">
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Opening Qty
                                <span className="block text-[10px] font-normal text-slate-400 normal-case">(Yesterday's closing)</span>
                              </span>
                              <span className="text-base font-bold text-slate-700">
                                {isFetchingClosing ? '...' : closingItem ? `${closingOpeningQty} units` : '—'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between py-2 border-b border-slate-200">
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Today's Purchase
                                <span className="block text-[10px] font-normal text-slate-400 normal-case">(Added today)</span>
                              </span>
                              <span className="text-base font-bold text-indigo-600">
                                {closingItem ? `+ ${closingPurchaseQty} units` : '—'}
                              </span>
                            </div>

                            <div className="py-2">
                              <span className="text-xs font-bold text-amber-600 block uppercase tracking-wider">
                                Current Closing (Max Allowed)
                                <span className="block text-[10px] font-normal text-amber-500 normal-case">= Opening + Purchase</span>
                              </span>
                              <div className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1.5 flex items-baseline gap-1.5">
                                <span className={isClosingOverflow ? 'text-rose-600' : ''}>
                                  {closingItem ? maxClosingAllowed : '0'}
                                </span>
                                <span className="text-xs text-slate-500 font-semibold">units</span>
                              </div>
                            </div>

                            {closingItem && (
                              <div className={`flex items-center justify-between py-2 px-3 rounded-lg border ${isClosingOverflow ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'
                                }`}>
                                <span className={`text-xs font-semibold uppercase tracking-wider ${isClosingOverflow ? 'text-rose-600' : 'text-slate-500'}`}>
                                  Entered (Godown + Counter)
                                </span>
                                <span className={`text-lg font-extrabold ${isClosingOverflow ? 'text-rose-600' : 'text-slate-800'}`}>
                                  {currentClosingQty} units
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="text-[10px] text-slate-400 italic bg-white p-2.5 rounded-lg border border-slate-200">
                            * Closing qty (Godown + Counter) cannot exceed Opening + Purchase. Form will be blocked if it does.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ════════════════════════════════════════════════════════
                      MODE 3 — SALE AMOUNT
                  ═══════════════════════════════════════════════════════════ */}
                  {quantityType === 'Sale Amount' && (
                    <div className="space-y-6">
                      <div className="pb-3 border-b border-slate-200">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 mr-2.5 inline-block" />
                          Sale Amount
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                          { label: 'G-Pay Balance (₹)', key: 'gpayBalance', value: gpayBalance, set: setGpayBalance, errKey: 'gpayBalance' },
                          { label: 'Cash Balance (₹)', key: 'cashBalance', value: cashBalance, set: setCashBalance, errKey: 'cashBalance' },
                          { label: 'Expense (₹)', key: 'expense', value: expense, set: setExpense, errKey: 'expense' },
                        ].map(({ label, key, value, set, errKey }) => (
                          <div key={key}>
                            <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">{label}</label>
                            <div className="relative">
                              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm font-semibold select-none">₹</span>
                              <input
                                type="number" min="0" step="any"
                                value={value}
                                onChange={(e) => { set(e.target.value); setErrors(prev => ({ ...prev, [errKey]: null })); }}
                                placeholder="0.00"
                                className={`w-full bg-white border rounded-xl pl-8 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${errors[errKey] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                                  }`}
                              />
                            </div>
                            {errors[errKey] && <span className="text-[11px] text-rose-500 mt-1 block">{errors[errKey]}</span>}
                          </div>
                        ))}
                      </div>

                      <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-5 mt-4 flex items-start space-x-3.5">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg flex-shrink-0">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wide">Sheet Mapping Note</h4>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            Values submitted here map to <span className="font-semibold text-slate-800">VISHAL Snacks Sheet</span>:
                          </p>
                          <ul className="text-xs text-indigo-900 mt-2 space-y-1 font-mono bg-indigo-50/30 p-2.5 rounded-lg border border-indigo-100/50">
                            <li>• G-Pay Balance → <span className="text-indigo-700 font-semibold">Column O</span></li>
                            <li>• Cash Balance → <span className="text-indigo-700 font-semibold">Column P</span></li>
                            <li>• Expense → <span className="text-indigo-700 font-semibold">Column Q</span></li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Submit Button ─────────────────────────────────────── */}
                  <div className="pt-6 border-t border-slate-200 flex gap-4">
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="px-6 py-3 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={quantityType === 'Closing Quantity' && isClosingOverflow}
                      className={`flex-1 inline-flex items-center justify-center px-8 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-300 cursor-pointer ${quantityType === 'Closing Quantity' && isClosingOverflow
                        ? 'bg-slate-300 cursor-not-allowed opacity-60'
                        : 'bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700'
                        }`}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {quantityType === 'Closing Quantity' && isClosingOverflow ? 'Cannot Submit — Stock Overflow' : 'Submit Data'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

      {/* ── Session History Log ──────────────────────────────────────────── */}
      {submitHistory.length > 0 && (
        <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 mb-10">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center">
            <svg className="w-4 h-4 text-slate-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Recent Entries Log (This Session)
          </h3>
          <div className="space-y-3">
            {submitHistory.map((item, idx) => (
              <div
                key={idx}
                className="bg-slate-50 border border-slate-150 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3 font-mono hover:border-slate-200 transition-all text-slate-700"
              >
                <div>
                  <span className="text-slate-400 mr-2">[{item.date}]</span>
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${item.type === 'Purchase Quantity' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                    item.type === 'Closing Quantity' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                      'bg-emerald-50 text-emerald-600 border border-emerald-100'
                    }`}>
                    {item.type}
                  </span>
                </div>
                <div className="text-slate-800">
                  {item.type === 'Purchase Quantity' && (
                    <span>Total: <strong className="text-indigo-600">₹{item.grandTotal.toFixed(2)}</strong> ({item.items.length} items)</span>
                  )}
                  {item.type === 'Closing Quantity' && (
                    <span>
                      <strong className="text-amber-600">{item.itemName}</strong>
                      {' '}| Open: {item.openingQty} + Purch: {item.purchaseQty} → Closing: <strong>{item.currentClosing}</strong> (G:{item.godownQuantity} C:{item.counterQuantity})
                    </span>
                  )}
                  {item.type === 'Sale Amount' && (
                    <span>
                      G-Pay <strong className="text-emerald-600">₹{item.gpay}</strong> | Cash <strong className="text-emerald-600">₹{item.cash}</strong> | Exp <strong className="text-rose-600">₹{item.expense}</strong>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}