import React, { useState, useEffect, useMemo, useCallback } from 'react';
import SearchableDropdown from './components/SearchableDropdown';
import Toast from './components/Toast';
import {
  getItems,
  getVendors,
  getShops,
  getStockLedgerSnapshot,
  submitPurchaseTransaction,
  submitClosingStockTransaction,
  submitSaleAmountTransaction,
  getAllShopRates,
  setShopItemRate
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

  // Items & vendors
  const [itemsList, setItemsList] = useState([]);
  const [vendorsList, setVendorsList] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [isLoadingItems, setIsLoadingItems] = useState(true);

  // Shops
  const [shopsList, setShopsList] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [isLoadingShops, setIsLoadingShops] = useState(true);

  // Shop Rates
  const [shopRates, setShopRates] = useState({});
  const [editingRates, setEditingRates] = useState({});
  const [editingDates, setEditingDates] = useState({});

  // Stock ledger snapshot for the selected date
  // { [itemId]: { opening_qty, purchase_qty, closing_qty } }
  const [ledgerSnapshot, setLedgerSnapshot] = useState({});
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState({});

  // ─────────────────────────────────────────────────────────────────────────
  // Load items + vendors + shops on mount
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [items, vendors, shops] = await Promise.all([getItems(), getVendors(), getShops()]);
        setItemsList(items);
        setVendorsList(vendors);
        setShopsList(shops);
        if (shops && shops.length > 0) {
          setSelectedShopId(shops[0].id.toString());
        }
      } catch (err) {
        console.error('Failed to load initial data from DB:', err);
      } finally {
        setIsLoadingItems(false);
        setIsLoadingShops(false);
      }
    }
    loadData();
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
  // Load shop rates whenever shop changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadRates() {
      if (!selectedShopId) return;
      try {
        const rates = await getAllShopRates(selectedShopId);
        setShopRates(rates);
      } catch (err) {
        console.error('Failed to load shop rates:', err);
      }
    }
    loadRates();
  }, [selectedShopId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Keep controlled rates editing states in sync with shopRates and date
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const initialRates = {};
    const initialDates = {};
    itemsList.forEach(item => {
      initialRates[item.id] = (shopRates[item.id] || 0).toString();
      initialDates[item.id] = date;
    });
    setEditingRates(initialRates);
    setEditingDates(initialDates);
  }, [shopRates, itemsList, date]);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived: current available stock for an item
  // = opening_qty + purchase_qty (today so far)
  // This is what "current closing" would be if no more purchases happen
  // ─────────────────────────────────────────────────────────────────────────
  const getAvailableStock = useCallback((itemId) => {
    if (!itemId) return 0;
    const snap = ledgerSnapshot[itemId];
    if (!snap) return 0;
    return (snap.opening_qty || 0) + (snap.purchase_qty || 0);
  }, [ledgerSnapshot]);

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
    { id: '1', itemId: '', itemName: '', rate: '', quantity: '1', discount: '0', discountType: '%', gst: '5' }
  ]);

  const addPurchaseRow = () => {
    setPurchaseRows(prev => [
      ...prev,
      { id: Date.now().toString(), itemId: '', itemName: '', rate: '', quantity: '1', discount: '0', discountType: '%', gst: '5' }
    ]);
  };

  const removePurchaseRow = (id) => {
    if (purchaseRows.length === 1) {
      setPurchaseRows([{ id: '1', itemId: '', itemName: '', rate: '', quantity: '1', discount: '0', discountType: '%', gst: '5' }]);
      return;
    }
    setPurchaseRows(prev => prev.filter(row => row.id !== id));
  };

  const updatePurchaseRow = (id, field, value) => {
    setPurchaseRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      if (field === 'item') {
        const itemId = value.id || '';
        const defaultRate = shopRates[itemId] || 0;
        return {
          ...row,
          itemId,
          itemName: value.item_name || value.name || '',
          rate: defaultRate > 0 ? defaultRate.toString() : ''
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

  // Opening qty for selected closing item (from yesterday's closing → today's opening)
  const [closingOpeningQty, setClosingOpeningQty] = useState(0);
  // Today's purchased qty for the selected closing item
  const [closingPurchaseQty, setClosingPurchaseQty] = useState(0);

  // Max allowed closing = opening + purchase
  const maxClosingAllowed = closingOpeningQty + closingPurchaseQty;

  // Physical count entered
  const currentClosingQty = useMemo(() => {
    const g = parseFloat(godownQty) || 0;
    const c = parseFloat(counterQty) || 0;
    return g + c;
  }, [godownQty, counterQty]);

  // Is closing qty exceeding available stock?
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
          // Item has no ledger entry yet — opening is 0
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

      try {
        const res = await submitPurchaseTransaction(date, selectedVendorId, payload, selectedShopId);
        setSubmitHistory(prev => [{
          date, type: quantityType, items: payload,
          grandTotal, mode: res.mode || 'live'
        }, ...prev]);
        showToast(`Purchase logged! Total: ₹${grandTotal.toFixed(2)} ${res.mode === 'mock' ? '(Local-Only)' : ''}`);
        setPurchaseRows([{ id: '1', itemId: '', itemName: '', rate: '', quantity: '1', discount: '0', discountType: '%', gst: '5' }]);
        setSelectedVendorId('');
        // Re-fetch ledger snapshot
        const snapshot = await getStockLedgerSnapshot(date);
        setLedgerSnapshot(snapshot);
      } catch (err) {
        showToast(`Failed to submit purchase: ${err.message}`, 'error');
      }

    // ── Closing Stock ─────────────────────────────────────────────────────
    } else if (quantityType === 'Closing Quantity') {
      if (!closingItemId) newErrors.closingItem = 'Please select a product';
      if (godownQty !== '' && parseFloat(godownQty) < 0) newErrors.godownQty = 'Cannot be negative';
      if (counterQty !== '' && parseFloat(counterQty) < 0) newErrors.counterQty = 'Cannot be negative';
      if (godownQty === '' && counterQty === '') newErrors.godownQty = 'Enter godown or counter quantity';

      // HARD BLOCK: (Godown + Counter) must NOT exceed (Opening + Purchase)
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

      try {
        const res = await submitClosingStockTransaction(
          date, closingItemId,
          closingOpeningQty,   // last_closing_qty = today's opening
          godownQty || 0, counterQty || 0, currentClosingQty,
          selectedShopId
        );
        setSubmitHistory(prev => [{
          date, type: quantityType,
          itemName: closingItem,
          openingQty: closingOpeningQty,
          purchaseQty: closingPurchaseQty,
          godownQuantity: parseFloat(godownQty) || 0,
          counterQuantity: parseFloat(counterQty) || 0,
          currentClosing: currentClosingQty,
          mode: res.mode || 'live'
        }, ...prev]);
        showToast(`Closing stock saved: ${closingItem} → ${currentClosingQty} units ${res.mode === 'mock' ? '(Local-Only)' : ''}`);
        setClosingItem('');
        setClosingItemId('');
        setClosingOpeningQty(0);
        setClosingPurchaseQty(0);
        setGodownQty('');
        setCounterQty('');
        // Re-fetch ledger snapshot
        const snapshot = await getStockLedgerSnapshot(date);
        setLedgerSnapshot(snapshot);
      } catch (err) {
        showToast(`Failed to submit closing stock: ${err.message}`, 'error');
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

      try {
        const res = await submitSaleAmountTransaction(date, gpayBalance || 0, cashBalance || 0, expense || 0, totalClosing, selectedShopId);
        setSubmitHistory(prev => [{
          date, type: quantityType,
          gpay: parseFloat(gpayBalance) || 0,
          cash: parseFloat(cashBalance) || 0,
          expense: parseFloat(expense) || 0,
          netTotal: totalClosing,
          mode: res.mode || 'live'
        }, ...prev]);
        showToast(`Financial sheet logged: Net = ₹${totalClosing.toFixed(2)} ${res.mode === 'mock' ? '(Local-Only)' : ''}`);
        setGpayBalance('');
        setCashBalance('');
        setExpense('');
      } catch (err) {
        showToast(`Failed to submit sales summary: ${err.message}`, 'error');
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      <Toast notification={notification} onClose={() => setNotification(null)} />

      <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-none overflow-hidden mb-10">

        {/* ── Banner ─────────────────────────────────────────────────────── */}
        <div className="p-6 md:p-8 border-b border-slate-200 bg-slate-50/55 text-center relative overflow-hidden">
          <div className="inline-flex items-center justify-center p-3.5 bg-amber-500 rounded-2xl ring-1 ring-amber-400/20 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">VISHAL Snacks Inventory Form</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Daily operational entry desk</p>

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

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">

          {/* ── Common Header ─────────────────────────────────────────────── */}
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
                <option value="Manage Shop Rates">Manage Shop Rates</option>
              </select>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              MODE 1 — PURCHASE QUANTITY
              Shows current stock (opening + today purchases) per item
          ═══════════════════════════════════════════════════════════════ */}
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
                <button
                  type="button"
                  onClick={addPurchaseRow}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer self-end sm:self-auto"
                >
                  <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Item
                </button>
              </div>

              <div className="space-y-4">
                {purchaseRows.map((row, index) => {
                  const rowTotal = calculateRowTotal(row);
                  const availStock = row.itemId ? getAvailableStock(row.itemId) : null;
                  return (
                    <div
                      key={row.id}
                      className="relative p-5 bg-slate-50/40 border border-slate-200 rounded-xl hover:border-slate-300 transition-all space-y-4 group"
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

                      {/* Item Name + Stock Badge */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        <div className="md:col-span-4">
                          <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Item Name</label>
                          <SearchableDropdown
                            value={row.itemName}
                            onChange={(selectedItem) => updatePurchaseRow(row.id, 'item', selectedItem)}
                            items={itemsList}
                            placeholder="Select Snack..."
                            error={errors[`item_${row.id}`]}
                          />
                          {/* Current stock badge — shown once an item is selected */}
                          {row.itemId && availStock !== null && (
                            <div className={`mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                              availStock === 0
                                ? 'bg-rose-50 text-rose-600 border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                              Current Stock: {availStock} units
                            </div>
                          )}
                        </div>

                        {/* Rate */}
                        <div className="md:col-span-2">
                          <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Rate (₹)</label>
                          <input
                            type="number" min="0" step="any" required
                            value={row.rate}
                            onChange={(e) => updatePurchaseRow(row.id, 'rate', e.target.value)}
                            placeholder="Rate"
                            className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                              errors[`rate_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                            }`}
                          />
                        </div>

                        {/* Qty */}
                        <div className="md:col-span-1">
                          <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Qty</label>
                          <input
                            type="number" min="1" required
                            value={row.quantity}
                            onChange={(e) => updatePurchaseRow(row.id, 'quantity', e.target.value)}
                            placeholder="Qty"
                            className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                              errors[`qty_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                            }`}
                          />
                        </div>

                        {/* Discount */}
                        <div className="md:col-span-1">
                          <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Disc.</label>
                          <input
                            type="number" min="0" step="any"
                            value={row.discount}
                            onChange={(e) => updatePurchaseRow(row.id, 'discount', e.target.value)}
                            placeholder="0"
                            className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                              errors[`disc_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                            }`}
                          />
                        </div>

                        {/* Discount Type */}
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

                        {/* GST */}
                        <div className="md:col-span-1">
                          <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">GST %</label>
                          <input
                            type="number" min="0"
                            value={row.gst}
                            onChange={(e) => updatePurchaseRow(row.id, 'gst', e.target.value)}
                            placeholder="GST"
                            className={`w-full bg-white border rounded-xl px-2 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                              errors[`gst_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                            }`}
                          />
                        </div>

                        {/* Row Total */}
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
              </div>

              {/* Grand Total */}
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

          {/* ══════════════════════════════════════════════════════════════
              MODE 2 — CLOSING QUANTITY
              Rules:
              1. Show opening qty (= yesterday's closing) and today's purchase
              2. Max closing = opening + purchase
              3. Block submit if godown + counter > opening + purchase
              4. Current Closing formula displayed = Opening + Purchase
          ═══════════════════════════════════════════════════════════════ */}
          {quantityType === 'Closing Quantity' && (
            <div className="space-y-6">
              <div className="pb-3 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2.5 inline-block" />
                  Closing Quantity
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Inputs */}
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
                        className={`w-full bg-white border rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                          errors.godownQty || isClosingOverflow ? 'border-rose-500 ring-2 ring-rose-500/10' : 'border-slate-300 focus:border-indigo-500'
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
                        className={`w-full bg-white border rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                          errors.counterQty || isClosingOverflow ? 'border-rose-500 ring-2 ring-rose-500/10' : 'border-slate-300 focus:border-indigo-500'
                        }`}
                      />
                      {errors.counterQty && <span className="text-[11px] text-rose-500 mt-1 block">{errors.counterQty}</span>}
                    </div>
                  </div>

                  {/* Overflow warning */}
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

                {/* Right: Stats Panel */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-between gap-4">
                  <div className="space-y-4">

                    {/* Opening Qty */}
                    <div className="flex items-center justify-between py-2 border-b border-slate-200">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Opening Qty
                        <span className="block text-[10px] font-normal text-slate-400 normal-case">(Yesterday's closing)</span>
                      </span>
                      <span className="text-base font-bold text-slate-700">
                        {isFetchingClosing ? '...' : closingItem ? `${closingOpeningQty} units` : '—'}
                      </span>
                    </div>

                    {/* Today's Purchase */}
                    <div className="flex items-center justify-between py-2 border-b border-slate-200">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Today's Purchase
                        <span className="block text-[10px] font-normal text-slate-400 normal-case">(Added today)</span>
                      </span>
                      <span className="text-base font-bold text-indigo-600">
                        {closingItem ? `+ ${closingPurchaseQty} units` : '—'}
                      </span>
                    </div>

                    {/* Max Allowed / Current Closing */}
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

                    {/* Physical count entered */}
                    {closingItem && (
                      <div className={`flex items-center justify-between py-2 px-3 rounded-lg border ${
                        isClosingOverflow ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'
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

          {/* ══════════════════════════════════════════════════════════════
              MODE 3 — SALE AMOUNT
          ═══════════════════════════════════════════════════════════════ */}
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
                        className={`w-full bg-white border rounded-xl pl-8 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                          errors[errKey] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
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

          {/* ══════════════════════════════════════════════════════════════
              MODE 4 — MANAGE SHOP RATES
          ═══════════════════════════════════════════════════════════════ */}
          {quantityType === 'Manage Shop Rates' && (
            <div className="space-y-6">
              <div className="pb-3 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-600 mr-2.5 inline-block" />
                  Manage Shop Selling Rates
                </h3>
                <p className="text-xs text-slate-500 mt-1">Define item rates for the selected shop location</p>
              </div>

              <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-100/70 text-slate-600 text-xs font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Item Name</th>
                        <th className="px-6 py-4 w-40">Selling Rate (₹)</th>
                        <th className="px-6 py-4 w-48">Effective Date</th>
                        <th className="px-6 py-4 w-28 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {itemsList.map((item) => {
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-900">{item.item_name}</td>
                            <td className="px-6 py-4">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={editingRates[item.id] || ''}
                                onChange={(e) => setEditingRates(prev => ({ ...prev, [item.id]: e.target.value }))}
                                placeholder="0.00"
                                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input
                                type="date"
                                value={editingDates[item.id] || date}
                                onChange={(e) => setEditingDates(prev => ({ ...prev, [item.id]: e.target.value }))}
                                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                              />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                type="button"
                                onClick={async () => {
                                  const rateVal = parseFloat(editingRates[item.id]) || 0;
                                  const dateVal = editingDates[item.id] || date;
                                  try {
                                    await setShopItemRate(selectedShopId, item.id, rateVal, dateVal);
                                    setShopRates(prev => ({ ...prev, [item.id]: rateVal }));
                                    showToast(`Rate updated for ${item.item_name}: ₹${rateVal}`);
                                  } catch (err) {
                                    showToast(`Failed to update rate: ${err.message}`, 'error');
                                  }
                                }}
                                className="inline-flex items-center justify-center px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer"
                              >
                                Save
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Submit Button ─────────────────────────────────────────────── */}
          {quantityType !== 'Manage Shop Rates' && (
            <div className="pt-6 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                disabled={quantityType === 'Closing Quantity' && isClosingOverflow}
                className={`w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-300 cursor-pointer ${
                  quantityType === 'Closing Quantity' && isClosingOverflow
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
          )}
        </form>
      </div>

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
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${
                    item.type === 'Purchase Quantity' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                    item.type === 'Closing Quantity' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    'bg-emerald-50 text-emerald-600 border border-emerald-100'
                  }`}>
                    {item.type}
                  </span>
                  {item.mode === 'mock' && (
                    <span className="ml-1.5 px-1 bg-slate-100 text-slate-500 rounded text-[9px] border border-slate-200">LOCAL</span>
                  )}
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
