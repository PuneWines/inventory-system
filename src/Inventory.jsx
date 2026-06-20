import React, { useState, useEffect, useMemo } from 'react';
import SearchableDropdown from './components/SearchableDropdown';
import Toast from './components/Toast';
import {
  getItems,
  getVendors,
  getLastClosingQty,
  submitPurchaseTransaction,
  submitClosingStockTransaction,
  submitSaleAmountTransaction
} from './services/dbService';

export default function Inventory() {
  const [quantityType, setQuantityType] = useState('Purchase Quantity');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [submitHistory, setSubmitHistory] = useState([]);
  const [notification, setNotification] = useState(null);

  // Modular items/vendors loading
  const [itemsList, setItemsList] = useState([]);
  const [vendorsList, setVendorsList] = useState([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [isLoadingItems, setIsLoadingItems] = useState(true);

  // Validation errors
  const [errors, setErrors] = useState({});

  // ----------------------------------------------------
  // MODE 1 STATE: Purchase Quantity
  // ----------------------------------------------------
  const [purchaseRows, setPurchaseRows] = useState([
    { id: '1', itemId: '', itemName: '', rate: '', quantity: '1', discount: '0', discountType: '%', gst: '5' }
  ]);

  // Load snack items and vendors from DB on mount
  useEffect(() => {
    async function loadData() {
      try {
        const [items, vendors] = await Promise.all([getItems(), getVendors()]);
        setItemsList(items);
        setVendorsList(vendors);
      } catch (err) {
        console.error('Failed to load items/vendors from DB:', err);
      } finally {
        setIsLoadingItems(false);
      }
    }
    loadData();
  }, []);

  const addPurchaseRow = () => {
    setPurchaseRows(prev => [
      ...prev,
      { id: Date.now().toString(), itemId: '', itemName: '', rate: '', quantity: '1', discount: '0', discountType: '%', gst: '5' }
    ]);
  };

  const removePurchaseRow = (id) => {
    if (purchaseRows.length === 1) {
      // Clear instead of delete if only one row left
      setPurchaseRows([{ id: '1', itemId: '', itemName: '', rate: '', quantity: '1', discount: '0', discountType: '%', gst: '5' }]);
      return;
    }
    setPurchaseRows(prev => prev.filter(row => row.id !== id));
  };

  const updatePurchaseRow = (id, field, value) => {
    setPurchaseRows(prev => prev.map(row => {
      if (row.id === id) {
        if (field === 'item') {
          // value is the selected item object from dropdown
          const name = value.item_name || value.name || '';
          return {
            ...row,
            itemId: value.id || '',
            itemName: name,
            rate: value.rate ? value.rate.toString() : ''
          };
        }
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  // Row calculation
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

  // Grand Total Calculation
  const grandTotal = useMemo(() => {
    return purchaseRows.reduce((acc, row) => acc + calculateRowTotal(row), 0);
  }, [purchaseRows]);

  // ----------------------------------------------------
  // MODE 2 STATE: Closing Quantity
  // ----------------------------------------------------
  const [closingItem, setClosingItem] = useState('');
  const [closingItemId, setClosingItemId] = useState('');
  const [lastClosingStock, setLastClosingStock] = useState(0);
  const [godownQty, setGodownQty] = useState('');
  const [counterQty, setCounterQty] = useState('');
  const [isFetchingClosing, setIsFetchingClosing] = useState(false);

  // Fetch last closing stock from DB dynamically when item changes
  const handleSelectClosingItem = async (selectedItem) => {
    const name = selectedItem.item_name || selectedItem.name || '';
    setClosingItem(name);
    setClosingItemId(selectedItem.id || '');
    setErrors(prev => ({ ...prev, closingItem: null }));
    
    if (selectedItem.id || name) {
      setIsFetchingClosing(true);
      try {
        const qty = await getLastClosingQty(selectedItem.id, name);
        setLastClosingStock(qty);
      } catch (err) {
        console.error('Failed to get last closing qty:', err);
        setLastClosingStock(0);
      } finally {
        setIsFetchingClosing(false);
      }
    } else {
      setLastClosingStock(0);
    }
  };

  const currentClosingQty = useMemo(() => {
    const g = parseFloat(godownQty) || 0;
    const c = parseFloat(counterQty) || 0;
    return g + c;
  }, [godownQty, counterQty]);

  // ----------------------------------------------------
  // MODE 3 STATE: Sale Amount
  // ----------------------------------------------------
  const [gpayBalance, setGpayBalance] = useState('');
  const [cashBalance, setCashBalance] = useState('');
  const [expense, setExpense] = useState('');

  // Toast helper
  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // ----------------------------------------------------
  // FORM SUBMISSION (Supabase integrated)
  // ----------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});

    const newErrors = {};

    if (quantityType === 'Purchase Quantity') {
      // Validate purchase rows
      purchaseRows.forEach((row) => {
        if (!row.itemId) {
          newErrors[`item_${row.id}`] = 'Please select a product';
        }
        if (!row.rate || parseFloat(row.rate) < 0) {
          newErrors[`rate_${row.id}`] = 'Enter valid rate';
        }
        if (!row.quantity || parseFloat(row.quantity) <= 0) {
          newErrors[`qty_${row.id}`] = 'Enter quantity';
        }
        if (parseFloat(row.discount) < 0) {
          newErrors[`disc_${row.id}`] = 'Enter valid discount';
        }
        if (parseFloat(row.gst) < 0) {
          newErrors[`gst_${row.id}`] = 'Enter valid GST';
        }
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
        const res = await submitPurchaseTransaction(date, selectedVendorId, payload);
        const logPayload = {
          date,
          type: quantityType,
          items: payload,
          grandTotal: grandTotal,
          mode: res.mode || 'live'
        };

        setSubmitHistory(prev => [logPayload, ...prev]);
        showToast(`Purchase logged successfully! Total: ₹${grandTotal.toFixed(2)} ${res.mode === 'mock' ? '(Local-Only)' : ''}`);
        
        // Reset purchase form
        setPurchaseRows([{ id: '1', itemId: '', itemName: '', rate: '', quantity: '1', discount: '0', discountType: '%', gst: '5' }]);
        setSelectedVendorId('');
      } catch (err) {
        showToast(`Failed to submit purchase transaction: ${err.message}`, 'error');
      }

    } else if (quantityType === 'Closing Quantity') {
      if (!closingItemId) {
        newErrors.closingItem = 'Please select a product';
      }
      if (godownQty !== '' && parseFloat(godownQty) < 0) {
        newErrors.godownQty = 'Cannot be negative';
      }
      if (counterQty !== '' && parseFloat(counterQty) < 0) {
        newErrors.counterQty = 'Cannot be negative';
      }
      if (godownQty === '' && counterQty === '') {
        newErrors.godownQty = 'Enter godown or counter quantity';
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      try {
        const res = await submitClosingStockTransaction(
          date,
          closingItemId,
          lastClosingStock,
          godownQty || 0,
          counterQty || 0,
          currentClosingQty
        );

        const payload = {
          date,
          type: quantityType,
          itemName: closingItem,
          lastClosing: lastClosingStock,
          godownQuantity: parseFloat(godownQty) || 0,
          counterQuantity: parseFloat(counterQty) || 0,
          currentClosing: currentClosingQty,
          mode: res.mode || 'live'
        };

        setSubmitHistory(prev => [payload, ...prev]);
        showToast(`Stock count submitted: ${closingItem} -> ${currentClosingQty} units ${res.mode === 'mock' ? '(Local-Only)' : ''}`);

        // Reset closing form
        setClosingItem('');
        setClosingItemId('');
        setLastClosingStock(0);
        setGodownQty('');
        setCounterQty('');
      } catch (err) {
        showToast(`Failed to submit closing stock: ${err.message}`, 'error');
      }

    } else if (quantityType === 'Sale Amount') {
      if (gpayBalance === '' && cashBalance === '' && expense === '') {
        newErrors.gpayBalance = 'Provide at least one financial entry';
        setErrors(newErrors);
        return;
      }
      if (gpayBalance !== '' && parseFloat(gpayBalance) < 0) {
        newErrors.gpayBalance = 'Cannot be negative';
      }
      if (cashBalance !== '' && parseFloat(cashBalance) < 0) {
        newErrors.cashBalance = 'Cannot be negative';
      }
      if (expense !== '' && parseFloat(expense) < 0) {
        newErrors.expense = 'Cannot be negative';
      }

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }

      const totalClosing = (parseFloat(gpayBalance) || 0) + (parseFloat(cashBalance) || 0) - (parseFloat(expense) || 0);

      try {
        const res = await submitSaleAmountTransaction(
          date,
          gpayBalance || 0,
          cashBalance || 0,
          expense || 0,
          totalClosing
        );

        const payload = {
          date,
          type: quantityType,
          gpay: parseFloat(gpayBalance) || 0,
          cash: parseFloat(cashBalance) || 0,
          expense: parseFloat(expense) || 0,
          netTotal: totalClosing,
          mode: res.mode || 'live'
        };

        setSubmitHistory(prev => [payload, ...prev]);
        showToast(`Financial sheet logged: Net closing = ₹${totalClosing.toFixed(2)} ${res.mode === 'mock' ? '(Local-Only)' : ''}`);

        // Reset financials
        setGpayBalance('');
        setCashBalance('');
        setExpense('');
      } catch (err) {
        showToast(`Failed to submit sales summary: ${err.message}`, 'error');
      }
    }
  };

  return (
    <div className="relative">
      {/* Toast notifications */}
      <Toast notification={notification} onClose={() => setNotification(null)} />

      {/* Main card */}
      <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-none overflow-hidden mb-10">
        
        {/* Banner header */}
        <div className="p-6 md:p-8 border-b border-slate-200 bg-slate-50/55 text-center relative overflow-hidden">
          <div className="inline-flex items-center justify-center p-3.5 bg-amber-500 rounded-2xl ring-1 ring-amber-400/20 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">VISHAL Snacks Inventory Form</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">Daily operational entry desk</p>
          
          {isLoadingItems && (
            <div className="mt-3 inline-flex items-center text-xs font-semibold text-slate-400">
              <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Connecting database...
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
          
          {/* Common Header Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Quantity Type</label>
              <select
                value={quantityType}
                onChange={(e) => {
                  setQuantityType(e.target.value);
                  setErrors({});
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
              >
                <option value="Purchase Quantity">Purchase Quantity</option>
                <option value="Closing Quantity">Closing Quantity</option>
                <option value="Sale Amount">Sale Amount</option>
              </select>
            </div>
          </div>

          {/* Mode 1: Purchase Quantity */}
          {quantityType === 'Purchase Quantity' && (
            <div className="space-y-6 transition-all duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-4">
                <div className="flex items-center space-x-3 w-full sm:w-auto">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 mr-2.5 inline-block" />
                    Purchase Items
                  </h3>
                </div>

                <div className="flex items-center space-x-2.5 w-full sm:max-w-xs self-stretch">
                  <label className="text-xs font-bold uppercase text-slate-500 whitespace-nowrap">Vendor:</label>
                  <select
                    value={selectedVendorId}
                    onChange={(e) => setSelectedVendorId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer shadow-none"
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

              {/* Dynamic Rows list */}
              <div className="space-y-4">
                {purchaseRows.map((row, index) => {
                  const rowTotal = calculateRowTotal(row);
                  return (
                    <div 
                      key={row.id}
                      className="relative p-5 bg-slate-50/40 border border-slate-200 rounded-xl hover:border-slate-300 transition-all grid grid-cols-1 md:grid-cols-12 gap-4 items-end group"
                    >
                      {/* Row Label (mobile helpful) */}
                      <span className="absolute top-2 left-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest md:hidden">
                        Item #{index + 1}
                      </span>

                      {/* Product Select Dropdown (4 Cols) */}
                      <div className="md:col-span-3">
                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Item Name</label>
                        <SearchableDropdown
                          value={row.itemName}
                          onChange={(selectedItem) => {
                            updatePurchaseRow(row.id, 'item', selectedItem);
                          }}
                          items={itemsList}
                          placeholder="Select Snack..."
                          error={errors[`item_${row.id}`]}
                        />
                      </div>

                      {/* Rate (2 Cols) */}
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Rate (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={row.rate}
                          onChange={(e) => updatePurchaseRow(row.id, 'rate', e.target.value)}
                          placeholder="Rate"
                          className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                            errors[`rate_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                          }`}
                        />
                      </div>

                      {/* Quantity (1 Col) */}
                      <div className="md:col-span-1">
                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Qty</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={row.quantity}
                          onChange={(e) => updatePurchaseRow(row.id, 'quantity', e.target.value)}
                          placeholder="Qty"
                          className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                            errors[`qty_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                          }`}
                        />
                      </div>

                      {/* Discount (1.5 Cols) */}
                      <div className="md:col-span-1.5">
                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Discount</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.discount}
                          onChange={(e) => updatePurchaseRow(row.id, 'discount', e.target.value)}
                          placeholder="Discount"
                          className={`w-full bg-white border rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                            errors[`disc_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                          }`}
                        />
                      </div>

                      {/* Discount Type (1 Col) */}
                      <div className="md:col-span-1">
                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Unit</label>
                        <select
                          value={row.discountType}
                          onChange={(e) => updatePurchaseRow(row.id, 'discountType', e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-xl px-2 py-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                        >
                          <option value="%">%</option>
                          <option value="₹">₹</option>
                        </select>
                      </div>

                      {/* GST (1 Col) */}
                      <div className="md:col-span-1">
                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">GST %</label>
                        <input
                          type="number"
                          min="0"
                          value={row.gst}
                          onChange={(e) => updatePurchaseRow(row.id, 'gst', e.target.value)}
                          placeholder="GST"
                          className={`w-full bg-white border rounded-xl px-2 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                            errors[`gst_${row.id}`] ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                          }`}
                        />
                      </div>

                      {/* Calculated Amount (1.5 Cols) */}
                      <div className="md:col-span-1.5">
                        <label className="block text-[11px] font-bold text-indigo-600 mb-1.5 uppercase">Total</label>
                        <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 text-xs font-extrabold text-right text-indigo-600 select-none">
                          ₹{rowTotal.toFixed(2)}
                        </div>
                      </div>

                      {/* Delete Button */}
                      <div className="md:col-span-0.5 flex justify-end pb-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => removePurchaseRow(row.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 transition-colors cursor-pointer"
                          title="Remove Row"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Grand Total Section */}
              <div className="flex justify-end pt-4 border-t border-slate-200">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 w-full sm:max-w-xs text-right relative overflow-hidden">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-505">Grand Total</span>
                  <div className="text-3xl font-extrabold text-indigo-600 tracking-tight mt-1 flex items-baseline justify-end">
                    <span className="text-indigo-500 text-lg mr-1 font-bold">₹</span>
                    <span>{grandTotal.toFixed(2)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Updates live as items edit</p>
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: Closing Quantity */}
          {quantityType === 'Closing Quantity' && (
            <div className="space-y-6 transition-all duration-300">
              <div className="pb-3 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2.5 inline-block" />
                  Closing Quantity
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left Side Inputs */}
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
                        type="number"
                        min="0"
                        value={godownQty}
                        onChange={(e) => {
                          setGodownQty(e.target.value);
                          setErrors(prev => ({ ...prev, godownQty: null }));
                        }}
                        placeholder="Optional"
                        className={`w-full bg-white border rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                          errors.godownQty ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Counter Qty</label>
                      <input
                        type="number"
                        min="0"
                        value={counterQty}
                        onChange={(e) => {
                          setCounterQty(e.target.value);
                          setErrors(prev => ({ ...prev, counterQty: null }));
                        }}
                        placeholder="Optional"
                        className={`w-full bg-white border rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                          errors.counterQty ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Right Side Stats Panel */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 block uppercase tracking-wider">Previous Recorded Stock</span>
                      <div className="text-lg font-bold text-slate-700 mt-1 select-none flex items-center">
                        <svg className="w-4 h-4 text-slate-400 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>
                          {isFetchingClosing ? (
                            <span className="text-xs font-semibold text-slate-450 italic flex items-center">
                              <svg className="animate-spin h-3.5 w-3.5 mr-1.5 text-indigo-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Querying DB...
                            </span>
                          ) : closingItem ? (
                            `${lastClosingStock} units`
                          ) : (
                            '-- select item --'
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200">
                      <span className="text-xs font-bold text-amber-600 block uppercase tracking-wider">Current Closing Quantity</span>
                      <div className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1 flex items-baseline">
                        <span>{closingItem ? currentClosingQty : '0'}</span>
                        <span className="text-xs text-slate-500 font-semibold ml-1.5">units total</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-505 mt-4 italic bg-white p-2.5 rounded-lg border border-slate-200">
                    * Formula: Godown + Counter = Current Closing Quantity
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Mode 3: Sale Amount */}
          {quantityType === 'Sale Amount' && (
            <div className="space-y-6 transition-all duration-300">
              <div className="pb-3 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 mr-2.5 inline-block" />
                  Sale Amount
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">G-Pay Balance (₹)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm font-semibold select-none">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={gpayBalance}
                      onChange={(e) => {
                        setGpayBalance(e.target.value);
                        setErrors(prev => ({ ...prev, gpayBalance: null }));
                      }}
                      placeholder="0.00"
                      className={`w-full bg-white border rounded-xl pl-8 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                        errors.gpayBalance ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Cash Balance (₹)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm font-semibold select-none">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={cashBalance}
                      onChange={(e) => {
                        setCashBalance(e.target.value);
                        setErrors(prev => ({ ...prev, cashBalance: null }));
                      }}
                      placeholder="0.00"
                      className={`w-full bg-white border rounded-xl pl-8 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                        errors.cashBalance ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">Expense (₹)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-sm font-semibold select-none">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={expense}
                      onChange={(e) => {
                        setExpense(e.target.value);
                        setErrors(prev => ({ ...prev, expense: null }));
                      }}
                      placeholder="0.00"
                      className={`w-full bg-white border rounded-xl pl-8 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                        errors.expense ? 'border-rose-500' : 'border-slate-300 focus:border-indigo-500'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Information Note */}
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-5 mt-4 flex items-start space-x-3.5">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wide">Sheet Mapping Note</h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Values submitted through this dashboard automatically map to the active database cells inside <span className="font-semibold text-slate-800">VISHAL Snacks Sheet</span>:
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

          {/* Submit Action */}
          <div className="pt-6 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 transition-all duration-300 cursor-pointer"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Submit Data
            </button>
          </div>

        </form>
      </div>

      {/* History Log Section */}
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
                className="bg-slate-55 border border-slate-150 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-3 font-mono hover:border-slate-250 transition-all text-slate-700"
              >
                <div>
                  <span className="text-slate-400 mr-2">[{item.date}]</span>
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${
                    item.type === 'Purchase Quantity' ? 'bg-indigo-55 text-indigo-600 border border-indigo-100' :
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
                    <span>Total Purchase: <strong className="text-indigo-600">₹{item.grandTotal.toFixed(2)}</strong> ({item.items.length} items)</span>
                  )}
                  {item.type === 'Closing Quantity' && (
                    <span>Closing count: <strong className="text-amber-600">{item.itemName}</strong> → {item.currentClosing} units (Godown: {item.godownQuantity}, Counter: {item.counterQuantity})</span>
                  )}
                  {item.type === 'Sale Amount' && (
                    <span>Fin: G-Pay <strong className="text-emerald-600">₹{item.gpay}</strong> | Cash <strong className="text-emerald-600">₹{item.cash}</strong> | Expense <strong className="text-rose-600">₹{item.expense}</strong></span>
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
