import { supabase } from '../lib/supabase';

// ----------------------------------------------------
// DATABASE SERVICE METHODS
// ----------------------------------------------------

/**
 * Fetch all active items from items table.
 */
export async function getItems(shopId = null) {
  try {
    let query = supabase
      .from('items')
      .select('*');

    if (shopId) {
      query = query.eq('shop_id', parseInt(shopId, 10));
    }

    const { data, error } = await query
      .order('item_name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to load database items:', err.message);
    throw err;
  }
}

// ----------------------------------------------------
// VENDORS SERVICES
// ----------------------------------------------------

export async function getVendors(shopId = null) {
  try {
    let query = supabase
      .from('vendors')
      .select('*');

    if (shopId) {
      query = query.eq('shop_id', parseInt(shopId, 10));
    }

    const { data, error } = await query
      .order('vendor_name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to load database vendors:', err.message);
    throw err;
  }
}

/**
 * Fetch the latest recorded closing stock total quantity for a given itemId.
 * Queries public.closing_stock_items ordered by created_at.
 */
export async function getLastClosingQty(itemId) {
  try {
    const { data, error } = await supabase
      .from('closing_stock_items')
      .select('total_qty')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (data && data.length > 0) {
      return parseFloat(data[0].total_qty) || 0;
    }
    return 0;
  } catch (err) {
    console.error(`Failed to get last closing qty for item ID ${itemId}:`, err.message);
    throw err;
  }
}

/**
 * Submit Purchase Transaction (Mode 1)
 */
export async function submitPurchaseTransaction(date, vendorId, itemsList, shopId) {
  try {
    // 1. Insert transaction
    const { data: tx, error: txErr } = await supabase
      .from('inventory_transactions')
      .insert([{ 
        transaction_date: date, 
        transaction_type: 'purchase',
        shop_id: shopId ? parseInt(shopId, 10) : null
      }])
      .select()
      .single();

    if (txErr) throw txErr;

    // 2. Map items with transaction ID and vendor ID
    const purchaseItems = itemsList.map(item => ({
      transaction_id: tx.id,
      item_id: item.itemId,
      vendor_id: vendorId ? parseInt(vendorId, 10) : null,
      purchase_rate: parseFloat(item.rate) || 0,
      quantity: parseFloat(item.quantity) || 0,
      gst_percent: parseFloat(item.gst) || 0,
      discount: parseFloat(item.discount) || 0,
      discount_type: item.discountType,
      total_amount: parseFloat(item.total) || 0
    }));

    // 3. Insert items detail
    const { error: detailsErr } = await supabase
      .from('purchase_items')
      .insert(purchaseItems);

    if (detailsErr) throw detailsErr;
    return { success: true, transactionId: tx.id };
  } catch (err) {
    console.error('Purchase transaction insert failed:', err.message);
    throw err;
  }
}

/**
 * Submit Closing Stock Transaction (Mode 2)
 */
export async function submitClosingStockTransaction(date, itemId, lastClosing, godownQty, counterQty, totalQty, shopId) {
  try {
    // 1. Insert transaction
    const { data: tx, error: txErr } = await supabase
      .from('inventory_transactions')
      .insert([{ 
        transaction_date: date, 
        transaction_type: 'closing_stock',
        shop_id: shopId ? parseInt(shopId, 10) : null
      }])
      .select()
      .single();

    if (txErr) throw txErr;

    // 2. Insert detail
    const { error: detailErr } = await supabase
      .from('closing_stock_items')
      .insert([{
        transaction_id: tx.id,
        item_id: itemId,
        shop_id: shopId ? parseInt(shopId, 10) : null,
        last_closing_qty: parseFloat(lastClosing) || 0,
        godown_qty: parseFloat(godownQty) || 0,
        counter_qty: parseFloat(counterQty) || 0,
        total_qty: parseFloat(totalQty) || 0
      }]);

    if (detailErr) throw detailErr;
    return { success: true, transactionId: tx.id };
  } catch (err) {
    console.error('Closing stock transaction failed:', err.message);
    throw err;
  }
}

/**
 * Submit Daily Sales Summary Transaction (Mode 3)
 */
export async function submitSaleAmountTransaction(date, gpay, cash, expense, totalClosing, shopId) {
  try {
    // 1. Insert transaction
    const { data: tx, error: txErr } = await supabase
      .from('inventory_transactions')
      .insert([{ 
        transaction_date: date, 
        transaction_type: 'sale_amount',
        shop_id: shopId ? parseInt(shopId, 10) : null
      }])
      .select()
      .single();

    if (txErr) throw txErr;

    // 2. Insert detail
    const { error: detailErr } = await supabase
      .from('daily_sales_summary')
      .insert([{
        transaction_id: tx.id,
        gpay_amount: parseFloat(gpay) || 0,
        cash_amount: parseFloat(cash) || 0,
        expense_amount: parseFloat(expense) || 0,
        total_closing_amount: parseFloat(totalClosing) || 0
      }]);

    if (detailErr) throw detailErr;
    return { success: true, transactionId: tx.id };
  } catch (err) {
    console.error('Daily sales transaction failed:', err.message);
    throw err;
  }
}



// ----------------------------------------------------
// STOCK LEDGER
// ----------------------------------------------------

/**
 * Fetch stock ledger rows for a given date range.
 * Returns rows matching the UI columns:
 *   Item Name | Date | Date For Opening | Opening Qty | Purchase Qty | Sale Qty | Closing Qty
 */
export async function getStockLedger({ fromDate, toDate, itemId, limit = 500 } = {}) {
  try {
    let query = supabase
      .from('stock_ledger')
      .select(`
        id,
        item_id,
        item_name,
        ledger_date,
        date_for_opening,
        opening_qty,
        purchase_qty,
        sale_qty,
        closing_qty,
        updated_at
      `)
      .order('ledger_date', { ascending: false })
      .order('item_name',   { ascending: true })
      .limit(limit);

    if (fromDate) query = query.gte('ledger_date', fromDate);
    if (toDate)   query = query.lte('ledger_date', toDate);
    if (itemId)   query = query.eq('item_id', itemId);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to load stock ledger:', err.message);
    throw err;
  }
}

/**
 * Update a stock ledger row by ID.
 */
export async function updateStockLedgerRow(rowId, fields) {
  try {
    const { data, error } = await supabase
      .from('stock_ledger')
      .update({
        opening_qty: parseFloat(fields.opening_qty) || 0,
        purchase_qty: parseFloat(fields.purchase_qty) || 0,
        closing_qty: parseFloat(fields.closing_qty) || 0,
        sale_qty: parseFloat(fields.sale_qty) || 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', rowId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error(`Failed to update stock ledger row ID ${rowId}:`, err.message);
    throw err;
  }
}

/**
 * Fetch the stock ledger using the live VIEW (stock_ledger_view).
 * This always reflects raw transaction data — useful for auditing.
 * Column names match the SQL view exactly.
 */
export async function getStockLedgerView({ fromDate, toDate, itemName } = {}) {
  try {
    let query = supabase
      .from('stock_ledger_view')
      .select('*')
      .order('Date', { ascending: false })
      .limit(500);

    if (fromDate)  query = query.gte('Date', fromDate);
    if (toDate)    query = query.lte('Date', toDate);
    if (itemName)  query = query.eq('Item Name', itemName);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to load stock ledger view:', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOPS SERVICES
// ─────────────────────────────────────────────────────────────────────────────

export async function getShops() {
  try {
    const { data, error } = await supabase
      .from('shop')
      .select('*')
      .order('shop_name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to load database shops:', err.message);
    throw err;
  }
}

/**
 * Fetches the stock ledger snapshot for a specific date.
 * Resolves opening stock from the most recent closing stock in history.
 */
export async function getStockLedgerSnapshot(date) {
  try {
    const { data, error } = await supabase
      .from('stock_ledger')
      .select('item_id, ledger_date, opening_qty, purchase_qty, closing_qty')
      .lte('ledger_date', date)
      .order('ledger_date', { ascending: true });

    if (error) throw error;

    const snapshot = {};
    (data || []).forEach(row => {
      if (row.ledger_date === date) {
        snapshot[row.item_id] = {
          opening_qty: parseFloat(row.opening_qty) || 0,
          purchase_qty: parseFloat(row.purchase_qty) || 0,
          closing_qty: parseFloat(row.closing_qty) || 0,
        };
      } else {
        snapshot[row.item_id] = {
          opening_qty: parseFloat(row.closing_qty) || 0,
          purchase_qty: 0,
          closing_qty: 0,
        };
      }
    });

    return snapshot;
  } catch (err) {
    console.error('Failed to build stock ledger snapshot:', err.message);
    return {};
  }
}

/**
 * Fetch purchased items list from database with details.
 * Performs joins to retrieve related item, vendor, and shop info.
 */
export async function getPurchasedItems({ fromDate, toDate, itemId, vendorId, shopId, limit = 500 } = {}) {
  try {
    let query = supabase
      .from('purchase_items')
      .select(`
        id,
        purchase_rate,
        quantity,
        gst_percent,
        discount,
        discount_type,
        total_amount,
        created_at,
        inventory_transactions!inner(
          transaction_date,
          shop:shop(id, shop_name)
        ),
        items!inner(
          item_name
        ),
        vendors(
          vendor_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fromDate) query = query.gte('inventory_transactions.transaction_date', fromDate);
    if (toDate)   query = query.lte('inventory_transactions.transaction_date', toDate);
    if (itemId)   query = query.eq('item_id', itemId);
    if (vendorId) query = query.eq('vendor_id', vendorId);
    if (shopId)   query = query.eq('inventory_transactions.shop_id', shopId);

    const { data, error } = await query;
    if (error) throw error;

    // Flatten data for UI
    return (data || []).map(row => ({
      id: row.id,
      transaction_date: row.inventory_transactions?.transaction_date,
      shop_name: row.inventory_transactions?.shop?.shop_name || 'Global / Unknown',
      item_name: row.items?.item_name,
      vendor_name: row.vendors?.vendor_name || 'N/A',
      purchase_rate: parseFloat(row.purchase_rate) || 0,
      quantity: parseFloat(row.quantity) || 0,
      gst_percent: parseFloat(row.gst_percent) || 0,
      discount: parseFloat(row.discount) || 0,
      discount_type: row.discount_type || '%',
      total_amount: parseFloat(row.total_amount) || 0
    }));
  } catch (err) {
    console.error('Failed to fetch purchased items:', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD OPERATIONS FOR ITEMS
// ─────────────────────────────────────────────────────────────────────────────

export async function addItem(itemName, mrp, shopId = null) {
  const { data, error } = await supabase
    .from('items')
    .insert([{ 
      item_name: itemName, 
      mrp: parseFloat(mrp) || 0,
      shop_id: shopId ? parseInt(shopId, 10) : null
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateItem(itemId, itemName, mrp, shopId = null) {
  const { data, error } = await supabase
    .from('items')
    .update({ 
      item_name: itemName, 
      mrp: parseFloat(mrp) || 0,
      shop_id: shopId ? parseInt(shopId, 10) : null
    })
    .eq('id', itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteItem(itemId) {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', itemId);

  if (error) throw error;
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD OPERATIONS FOR VENDORS
// ─────────────────────────────────────────────────────────────────────────────

export async function addVendor(vendorName, contactNumber, shopId = null) {
  const { data, error } = await supabase
    .from('vendors')
    .insert([{ 
      vendor_name: vendorName, 
      contact_number: contactNumber || '', 
      shop_id: shopId ? parseInt(shopId, 10) : null 
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateVendor(vendorId, vendorName, contactNumber, shopId = null) {
  const { data, error } = await supabase
    .from('vendors')
    .update({ 
      vendor_name: vendorName, 
      contact_number: contactNumber || '', 
      shop_id: shopId ? parseInt(shopId, 10) : null 
    })
    .eq('id', vendorId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteVendor(vendorId) {
  const { error } = await supabase
    .from('vendors')
    .delete()
    .eq('id', vendorId);

  if (error) throw error;
  return { success: true };
}
