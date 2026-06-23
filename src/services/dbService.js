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
export async function submitClosingStockTransaction(date, itemId, itemName, lastClosing, godownQty, counterQty, totalQty, salesQty, shopId) {
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

    // 3. Insert sale history log
    const { error: saleErr } = await supabase
      .from('sale_history')
      .insert([{
        transaction_date: date,
        item_name: itemName,
        sale_qty: parseFloat(salesQty) || 0,
        shop_id: shopId ? parseInt(shopId, 10) : null
      }]);

    if (saleErr) throw saleErr;

    return { success: true, transactionId: tx.id };
  } catch (err) {
    console.error('Closing stock transaction failed:', err.message);
    throw err;
  }
}

/**
 * Fetch all sale history records, optionally filtering by shop and date range.
 */
export async function getSaleHistory({ fromDate, toDate, shopId, itemName, limit = 500 } = {}) {
  try {
    let query = supabase
      .from('sale_history')
      .select(`
        id,
        created_at,
        transaction_date,
        item_name,
        sale_qty,
        shop:shop(id, shop_name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fromDate) query = query.gte('transaction_date', fromDate);
    if (toDate)   query = query.lte('transaction_date', toDate);
    if (shopId)   query = query.eq('shop_id', parseInt(shopId, 10));
    if (itemName) query = query.eq('item_name', itemName);

    const { data, error } = await query;
    if (error) throw error;
    
    // Flatten data for UI
    return (data || []).map(row => ({
      id: row.id,
      created_at: row.created_at,
      transaction_date: row.transaction_date,
      item_name: row.item_name,
      sale_qty: parseFloat(row.sale_qty) || 0,
      shop_name: row.shop?.shop_name || 'Global / Unknown'
    }));
  } catch (err) {
    console.error('Failed to load sale history:', err.message);
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
 * Fetch unique items present in stock_ledger, optionally filtering by shop.
 */
export async function getStockLedgerItems(shopId = null) {
  try {
    let query = supabase
      .from('stock_ledger')
      .select('item_id, item_name, items!inner(shop_id)');

    if (shopId) {
      query = query.eq('items.shop_id', parseInt(shopId, 10));
    }

    const { data, error } = await query;
    if (error) throw error;

    const unique = [];
    const seen = new Set();

    // Sort in-memory alphabetically by item name
    const sortedData = (data || []).sort((a, b) => 
      (a.item_name || '').localeCompare(b.item_name || '')
    );

    for (const row of sortedData) {
      if (row.item_id && !seen.has(row.item_id)) {
        seen.add(row.item_id);
        unique.push({
          id: row.item_id,
          item_name: row.item_name,
          name: row.item_name
        });
      }
    }
    return unique;
  } catch (err) {
    console.error('Failed to load stock ledger items:', err.message);
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

/**
 * Fetch closing stock items list from database with details.
 * Performs joins to retrieve related item, transaction, and shop info.
 */
export async function getClosingStockItems({ fromDate, toDate, itemId, shopId, limit = 500 } = {}) {
  try {
    let query = supabase
      .from('closing_stock_items')
      .select(`
        id,
        last_closing_qty,
        godown_qty,
        counter_qty,
        total_qty,
        created_at,
        inventory_transactions!inner(
          transaction_date,
          shop:shop(id, shop_name)
        ),
        items!inner(
          item_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fromDate) query = query.gte('inventory_transactions.transaction_date', fromDate);
    if (toDate)   query = query.lte('inventory_transactions.transaction_date', toDate);
    if (itemId)   query = query.eq('item_id', itemId);
    if (shopId)   query = query.eq('inventory_transactions.shop_id', shopId);

    const { data, error } = await query;
    if (error) throw error;

    // Flatten data for UI
    return (data || []).map(row => ({
      id: row.id,
      transaction_date: row.inventory_transactions?.transaction_date,
      shop_name: row.inventory_transactions?.shop?.shop_name || 'Global / Unknown',
      item_name: row.items?.item_name,
      last_closing_qty: parseFloat(row.last_closing_qty) || 0,
      godown_qty: parseFloat(row.godown_qty) || 0,
      counter_qty: parseFloat(row.counter_qty) || 0,
      total_qty: parseFloat(row.total_qty) || 0
    }));
  } catch (err) {
    console.error('Failed to fetch closing stock items:', err.message);
    throw err;
  }
}

/**
 * Update a purchase item row by ID.
 * Also updates the corresponding stock ledger record to keep purchase_qty in sync.
 */
export async function updatePurchaseItemRow(rowId, fields) {
  try {
    // 1. Fetch current (old) purchase item details to calculate diff and find date
    const { data: oldRow, error: fetchErr } = await supabase
      .from('purchase_items')
      .select(`
        item_id,
        quantity,
        inventory_transactions(transaction_date)
      `)
      .eq('id', rowId)
      .single();

    if (fetchErr) throw fetchErr;

    const oldQty = parseFloat(oldRow.quantity) || 0;
    const newQty = parseFloat(fields.quantity) || 0;
    const qtyDiff = newQty - oldQty;
    const itemId = oldRow.item_id;
    const ledgerDate = oldRow.inventory_transactions?.transaction_date;

    // 2. Update the purchase_items row
    const { data, error } = await supabase
      .from('purchase_items')
      .update({
        purchase_rate: parseFloat(fields.purchase_rate) || 0,
        quantity: newQty,
        gst_percent: parseFloat(fields.gst_percent) || 0,
        discount: parseFloat(fields.discount) || 0,
        discount_type: fields.discount_type || '%',
        total_amount: parseFloat(fields.total_amount) || 0,
      })
      .eq('id', rowId)
      .select()
      .single();

    if (error) throw error;

    // 3. Update the stock ledger if the quantity changed
    if (qtyDiff !== 0 && ledgerDate && itemId) {
      // Find current stock ledger row
      const { data: ledgerRow, error: ledgerFetchErr } = await supabase
        .from('stock_ledger')
        .select('id, purchase_qty, opening_qty, closing_qty')
        .eq('item_id', itemId)
        .eq('ledger_date', ledgerDate)
        .single();

      if (!ledgerFetchErr && ledgerRow) {
        const updatedPurchaseQty = Math.max(0, (parseFloat(ledgerRow.purchase_qty) || 0) + qtyDiff);
        const op = parseFloat(ledgerRow.opening_qty) || 0;
        const cl = parseFloat(ledgerRow.closing_qty) || 0;
        const updatedSaleQty = op + updatedPurchaseQty - cl;

        await supabase
          .from('stock_ledger')
          .update({
            purchase_qty: updatedPurchaseQty,
            sale_qty: updatedSaleQty,
            updated_at: new Date().toISOString()
          })
          .eq('id', ledgerRow.id);
      }
    }

    return data;
  } catch (err) {
    console.error(`Failed to update purchase item row ID ${rowId}:`, err.message);
    throw err;
  }
}

/**
 * Delete a purchase item row by ID.
 * Also updates the corresponding stock ledger record to keep purchase_qty in sync.
 * Cleans up the parent inventory transaction if this was the last item in it.
 */
export async function deletePurchaseItemRow(rowId) {
  try {
    // 1. Fetch details of the purchase item to be deleted
    const { data: row, error: fetchErr } = await supabase
      .from('purchase_items')
      .select(`
        item_id,
        quantity,
        transaction_id,
        inventory_transactions(transaction_date)
      `)
      .eq('id', rowId)
      .single();

    if (fetchErr) throw fetchErr;

    const itemId = row.item_id;
    const deletedQty = parseFloat(row.quantity) || 0;
    const ledgerDate = row.inventory_transactions?.transaction_date;
    const txId = row.transaction_id;

    // 2. Delete the row from purchase_items
    const { error: deleteErr } = await supabase
      .from('purchase_items')
      .delete()
      .eq('id', rowId);

    if (deleteErr) throw deleteErr;

    // 3. Update the stock ledger
    if (deletedQty !== 0 && ledgerDate && itemId) {
      const { data: ledgerRow, error: ledgerFetchErr } = await supabase
        .from('stock_ledger')
        .select('id, purchase_qty, opening_qty, closing_qty')
        .eq('item_id', itemId)
        .eq('ledger_date', ledgerDate)
        .single();

      if (!ledgerFetchErr && ledgerRow) {
        const updatedPurchaseQty = Math.max(0, (parseFloat(ledgerRow.purchase_qty) || 0) - deletedQty);
        const op = parseFloat(ledgerRow.opening_qty) || 0;
        const cl = parseFloat(ledgerRow.closing_qty) || 0;
        const updatedSaleQty = op + updatedPurchaseQty - cl;

        await supabase
          .from('stock_ledger')
          .update({
            purchase_qty: updatedPurchaseQty,
            sale_qty: updatedSaleQty,
            updated_at: new Date().toISOString()
          })
          .eq('id', ledgerRow.id);
      }
    }

    // 4. Clean up transaction header if no other items exist
    if (txId) {
      const { count, error: countErr } = await supabase
        .from('purchase_items')
        .select('*', { count: 'exact', head: true })
        .eq('transaction_id', txId);

      if (!countErr && count === 0) {
        await supabase
          .from('inventory_transactions')
          .delete()
          .eq('id', txId);
      }
    }

    return { success: true };
  } catch (err) {
    console.error(`Failed to delete purchase item row ID ${rowId}:`, err.message);
    throw err;
  }
}

/**
 * Update a closing stock item row by ID.
 * Also updates the corresponding stock ledger record to keep closing_qty and sale_qty in sync.
 * Propagates the closing_qty as opening_qty to the next day's stock ledger row.
 */
export async function updateClosingStockItemRow(rowId, fields) {
  try {
    // 1. Fetch old details
    const { data: oldRow, error: fetchErr } = await supabase
      .from('closing_stock_items')
      .select(`
        item_id,
        inventory_transactions(transaction_date)
      `)
      .eq('id', rowId)
      .single();

    if (fetchErr) throw fetchErr;

    const itemId = oldRow.item_id;
    const ledgerDate = oldRow.inventory_transactions?.transaction_date;
    const newTotal = (parseFloat(fields.godown_qty) || 0) + (parseFloat(fields.counter_qty) || 0);

    // 2. Update closing_stock_items
    const { data, error } = await supabase
      .from('closing_stock_items')
      .update({
        godown_qty: parseFloat(fields.godown_qty) || 0,
        counter_qty: parseFloat(fields.counter_qty) || 0,
        total_qty: newTotal
      })
      .eq('id', rowId)
      .select()
      .single();

    if (error) throw error;

    // 3. Update stock_ledger's closing_qty and sale_qty
    if (ledgerDate && itemId) {
      const { data: ledgerRow, error: ledgerFetchErr } = await supabase
        .from('stock_ledger')
        .select('id, opening_qty, purchase_qty')
        .eq('item_id', itemId)
        .eq('ledger_date', ledgerDate)
        .single();

      if (!ledgerFetchErr && ledgerRow) {
        const op = parseFloat(ledgerRow.opening_qty) || 0;
        const pu = parseFloat(ledgerRow.purchase_qty) || 0;
        const updatedSaleQty = op + pu - newTotal;

        await supabase
          .from('stock_ledger')
          .update({
            closing_qty: newTotal,
            sale_qty: updatedSaleQty,
            updated_at: new Date().toISOString()
          })
          .eq('id', ledgerRow.id);
      }

      // 4. Propagate to next day's opening_qty (if it exists)
      const { data: nextLedgerRow, error: nextFetchErr } = await supabase
        .from('stock_ledger')
        .select('id, purchase_qty, closing_qty')
        .eq('item_id', itemId)
        .gt('ledger_date', ledgerDate)
        .order('ledger_date', { ascending: true })
        .limit(1);

      if (!nextFetchErr && nextLedgerRow && nextLedgerRow.length > 0) {
        const nextRow = nextLedgerRow[0];
        const nextPu = parseFloat(nextRow.purchase_qty) || 0;
        const nextCl = parseFloat(nextRow.closing_qty) || 0;
        const nextSale = newTotal + nextPu - nextCl;

        await supabase
          .from('stock_ledger')
          .update({
            opening_qty: newTotal,
            sale_qty: nextSale,
            updated_at: new Date().toISOString()
          })
          .eq('id', nextRow.id);
      }
    }

    return data;
  } catch (err) {
    console.error(`Failed to update closing stock item row ID ${rowId}:`, err.message);
    throw err;
  }
}

/**
 * Delete a closing stock item row by ID.
 * Also cleans up the corresponding inventory_transaction.
 * Updates stock_ledger's closing_qty to 0 and propagates opening_qty = 0 to next day's ledger.
 */
export async function deleteClosingStockItemRow(rowId) {
  try {
    // 1. Fetch old details
    const { data: oldRow, error: fetchErr } = await supabase
      .from('closing_stock_items')
      .select(`
        item_id,
        transaction_id,
        inventory_transactions(transaction_date)
      `)
      .eq('id', rowId)
      .single();

    if (fetchErr) throw fetchErr;

    const itemId = oldRow.item_id;
    const txId = oldRow.transaction_id;
    const ledgerDate = oldRow.inventory_transactions?.transaction_date;

    // 2. Delete closing_stock_items row
    const { error: deleteErr } = await supabase
      .from('closing_stock_items')
      .delete()
      .eq('id', rowId);

    if (deleteErr) throw deleteErr;

    // 3. Delete parent transaction
    if (txId) {
      await supabase
        .from('inventory_transactions')
        .delete()
        .eq('id', txId);
    }

    // 4. Update stock_ledger's closing_qty and sale_qty to 0
    if (ledgerDate && itemId) {
      const { data: ledgerRow, error: ledgerFetchErr } = await supabase
        .from('stock_ledger')
        .select('id, opening_qty, purchase_qty')
        .eq('item_id', itemId)
        .eq('ledger_date', ledgerDate)
        .single();

      if (!ledgerFetchErr && ledgerRow) {
        const op = parseFloat(ledgerRow.opening_qty) || 0;
        const pu = parseFloat(ledgerRow.purchase_qty) || 0;
        const updatedSaleQty = op + pu; // closing is now 0

        await supabase
          .from('stock_ledger')
          .update({
            closing_qty: 0,
            sale_qty: updatedSaleQty,
            updated_at: new Date().toISOString()
          })
          .eq('id', ledgerRow.id);
      }

      // 5. Propagate opening_qty = 0 to next day's stock_ledger (if it exists)
      const { data: nextLedgerRow, error: nextFetchErr } = await supabase
        .from('stock_ledger')
        .select('id, purchase_qty, closing_qty')
        .eq('item_id', itemId)
        .gt('ledger_date', ledgerDate)
        .order('ledger_date', { ascending: true })
        .limit(1);

      if (!nextFetchErr && nextLedgerRow && nextLedgerRow.length > 0) {
        const nextRow = nextLedgerRow[0];
        const nextPu = parseFloat(nextRow.purchase_qty) || 0;
        const nextCl = parseFloat(nextRow.closing_qty) || 0;
        const nextSale = 0 + nextPu - nextCl;

        await supabase
          .from('stock_ledger')
          .update({
            opening_qty: 0,
            sale_qty: nextSale,
            updated_at: new Date().toISOString()
          })
          .eq('id', nextRow.id);
      }
    }

    return { success: true };
  } catch (err) {
    console.error(`Failed to delete closing stock item row ID ${rowId}:`, err.message);
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
