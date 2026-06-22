import { supabase, isConfigured } from '../lib/supabase';

// Standard fallback/initial snack items list with mock default rates and mock closings
const DEFAULT_SNACKS = [
  { id: '1',  item_name: 'Samosa (Plate)',              unit: 'plate',  lastClosing: 45 },
  { id: '2',  item_name: 'Kachori (Plate)',             unit: 'plate',  lastClosing: 30 },
  { id: '3',  item_name: 'Aloo Tikki (Plate)',          unit: 'plate',  lastClosing: 25 },
  { id: '4',  item_name: 'Potato Chips (Salted) 100g', unit: 'pack',   lastClosing: 120 },
  { id: '5',  item_name: 'Potato Chips (Masala) 100g', unit: 'pack',   lastClosing: 95 },
  { id: '6',  item_name: 'Banana Chips 100g',          unit: 'pack',   lastClosing: 60 },
  { id: '7',  item_name: 'Chakli 200g',                unit: 'pack',   lastClosing: 40 },
  { id: '8',  item_name: 'Special Sev 200g',           unit: 'pack',   lastClosing: 80 },
  { id: '9',  item_name: 'Bhakarwadi 250g',            unit: 'pack',   lastClosing: 75 },
  { id: '10', item_name: 'Dhokla (Plate)',              unit: 'plate',  lastClosing: 35 },
  { id: '11', item_name: 'Paneer Pattice',              unit: 'piece',  lastClosing: 20 },
  { id: '12', item_name: 'Sweet Ladoo (Pack)',          unit: 'pack',   lastClosing: 15 },
  { id: '13', item_name: 'Gulab Jamun (2 pcs)',         unit: 'plate',  lastClosing: 50 },
  { id: '14', item_name: 'Masala Chai',                 unit: 'cup',    lastClosing: 150 },
  { id: '15', item_name: 'Filter Coffee',               unit: 'cup',    lastClosing: 100 },
  { id: '16', item_name: 'Cold Drink (300ml)',          unit: 'bottle', lastClosing: 200 }
];

// Helper to get last closing qty for mock data
export const getDefaultRate = (itemName) => {
  // Rates are now shop-specific (shop_item_rates table).
  // This mock helper is kept for backwards compatibility during development.
  const mockRates = { 'Samosa (Plate)': 25, 'Kachori (Plate)': 25, 'Aloo Tikki (Plate)': 30 };
  return mockRates[itemName] || 0;
};

// Seed snacks into the database if the items table is empty
async function seedItemsIfEmpty() {
  if (!isConfigured) return;
  try {
    const { count, error: countErr } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true });
    
    if (countErr) throw countErr;

    if (count === 0) {
      const itemsToSeed = DEFAULT_SNACKS.map(snack => ({
        item_name: snack.item_name,
        mrp: snack.rate // Seed default rate into the mrp column
      }));

      const { error: insertErr } = await supabase
        .from('items')
        .insert(itemsToSeed);

      if (insertErr) throw insertErr;
      console.log('Successfully seeded database items table.');
    }
  } catch (err) {
    console.error('Failed to seed items table:', err.message);
  }
}

// ----------------------------------------------------
// DATABASE SERVICE METHODS
// ----------------------------------------------------

/**
 * Fetch all active items from items table.
 * Falls back to mock list if database credentials are not set.
 */
export async function getItems() {
  if (!isConfigured) {
    return DEFAULT_SNACKS;
  }

  try {
    // Attempt seed first to guarantee data
    await seedItemsIfEmpty();

    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('item_name', { ascending: true });

    if (error) throw error;

    if (data && data.length > 0) {
      // Note: mrp has been removed. Rates are now per-shop via shop_item_rates.
      return data;
    } else {
      console.warn('Items table returned 0 records. Falling back to default snacks.');
      return DEFAULT_SNACKS;
    }
  } catch (err) {
    console.error('Failed to load database items, using fallback:', err.message);
    return DEFAULT_SNACKS;
  }
}

// ----------------------------------------------------
// VENDORS DATA SEED & SERVICES
// ----------------------------------------------------

const DEFAULT_VENDORS = [
  { id: '1', vendor_name: 'Vishal Snacks Factory' },
  { id: '2', vendor_name: 'Balaji Foods Pune' },
  { id: '3', vendor_name: 'Chitale Bandhu Distributors' },
  { id: '4', vendor_name: 'Haldiram Trading' },
  { id: '5', vendor_name: 'Katraj Dairy Pune' }
];

async function seedVendorsIfEmpty() {
  if (!isConfigured) return;
  try {
    const { count, error: countErr } = await supabase
      .from('vendors')
      .select('*', { count: 'exact', head: true });
    
    if (countErr) throw countErr;

    if (count === 0) {
      const vendorsToSeed = DEFAULT_VENDORS.map(v => ({
        vendor_name: v.vendor_name,
        shop_id: null
      }));

      const { error: insertErr } = await supabase
        .from('vendors')
        .insert(vendorsToSeed);

      if (insertErr) throw insertErr;
      console.log('Successfully seeded database vendors table.');
    }
  } catch (err) {
    console.error('Failed to seed vendors table:', err.message);
  }
}

export async function getVendors(shopId = null) {
  if (!isConfigured) {
    return DEFAULT_VENDORS;
  }

  try {
    await seedVendorsIfEmpty();

    let query = supabase
      .from('vendors')
      .select('*');

    if (shopId) {
      query = query.eq('shop_id', parseInt(shopId, 10));
    }

    const { data, error } = await query
      .order('vendor_name', { ascending: true });

    if (error) throw error;

    if (data && data.length > 0) {
      return data;
    } else {
      console.warn('Vendors table returned 0 records. Falling back to default vendors.');
      return DEFAULT_VENDORS;
    }
  } catch (err) {
    console.error('Failed to load database vendors, using fallback:', err.message);
    return DEFAULT_VENDORS;
  }
}

/**
 * Fetch the latest recorded closing stock total quantity for a given itemId.
 * Queries public.closing_stock_items ordered by created_at.
 */
export async function getLastClosingQty(itemId, itemName) {
  if (!isConfigured || !itemId) {
    // If mock, return fallback last closing stock
    const matched = DEFAULT_SNACKS.find(s => s.item_name === itemName);
    return matched ? matched.lastClosing : 0;
  }

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
    return 0;
  }
}

/**
 * Submit Purchase Transaction (Mode 1)
 */
export async function submitPurchaseTransaction(date, vendorId, itemsList, shopId) {
  if (!isConfigured) {
    // Simulated mock delay
    await new Promise(resolve => setTimeout(resolve, 800));
    return { success: true, mode: 'mock' };
  }

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
  if (!isConfigured) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return { success: true, mode: 'mock' };
  }

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
  if (!isConfigured) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return { success: true, mode: 'mock' };
  }

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
// SHOP ITEM RATES
// ----------------------------------------------------

/**
 * Get the current rate for an item at a specific shop.
 * Returns the most recent rate with effective_from <= today.
 * Falls back to 0 if no rate is configured.
 */
export async function getShopItemRate(shopId, itemId) {
  if (!isConfigured || !shopId || !itemId) return 0;

  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('shop_item_rates')
      .select('rate, effective_from')
      .eq('shop_id', shopId)
      .eq('item_id', itemId)
      .lte('effective_from', today)
      .order('effective_from', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data && data.length > 0 ? parseFloat(data[0].rate) : 0;
  } catch (err) {
    console.error(`Failed to get shop item rate (shop=${shopId}, item=${itemId}):`, err.message);
    return 0;
  }
}

/**
 * Set (upsert) the rate for an item at a specific shop.
 * Pass effectiveFrom as 'YYYY-MM-DD'. Defaults to today.
 */
export async function setShopItemRate(shopId, itemId, rate, effectiveFrom = null) {
  if (!isConfigured) return { success: true, mode: 'mock' };

  const today = effectiveFrom || new Date().toISOString().split('T')[0];
  try {
    const { error } = await supabase
      .from('shop_item_rates')
      .upsert(
        { shop_id: shopId, item_id: itemId, rate: parseFloat(rate), effective_from: today },
        { onConflict: 'shop_id,item_id,effective_from' }
      );

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Failed to set shop item rate:', err.message);
    throw err;
  }
}

/**
 * Get all current rates for every item at a given shop.
 * Returns an object: { [itemId]: rate }
 */
export async function getAllShopRates(shopId) {
  if (!isConfigured || !shopId) return {};

  try {
    const today = new Date().toISOString().split('T')[0];
    // Get the latest rate per item (effective_from <= today)
    const { data, error } = await supabase
      .from('shop_item_rates')
      .select('item_id, rate, effective_from')
      .eq('shop_id', shopId)
      .lte('effective_from', today)
      .order('item_id, effective_from', { ascending: false });

    if (error) throw error;

    // Deduplicate: keep only the latest effective rate per item
    const rateMap = {};
    (data || []).forEach(row => {
      if (!rateMap[row.item_id]) {
        rateMap[row.item_id] = parseFloat(row.rate);
      }
    });
    return rateMap;
  } catch (err) {
    console.error(`Failed to get all shop rates for shop ${shopId}:`, err.message);
    return {};
  }
}

// ----------------------------------------------------
// STOCK LEDGER
// ----------------------------------------------------

/**
 * Fetch stock ledger rows for a given date range.
 * Returns rows matching the UI columns:
 *   Item Name | Date | Date For Opening | Opening Qty | Purchase Qty | Sale Qty | Closing Qty
 *
 * @param {Object} options
 * @param {string} [options.fromDate]  - Start date 'YYYY-MM-DD'
 * @param {string} [options.toDate]    - End date 'YYYY-MM-DD'
 * @param {number} [options.itemId]    - Filter by specific item
 * @param {number} [options.limit]     - Max rows to return (default 500)
 */
export async function getStockLedger({ fromDate, toDate, itemId, limit = 500 } = {}) {
  if (!isConfigured) {
    // Return mock empty ledger for development
    return [];
  }

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
 * Fetch the stock ledger using the live VIEW (stock_ledger_view).
 * This always reflects raw transaction data — useful for auditing.
 * Column names match the SQL view exactly.
 */
export async function getStockLedgerView({ fromDate, toDate, itemName } = {}) {
  if (!isConfigured) return [];

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
// SHOPS SEED & SERVICES
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SHOPS = [
  { id: 1, shop_name: 'Pune Main Branch' },
  { id: 2, shop_name: 'Kothrud Outlet' }
];

async function seedShopsIfEmpty() {
  if (!isConfigured) return;
  try {
    const { count, error: countErr } = await supabase
      .from('shop')
      .select('*', { count: 'exact', head: true });
    
    if (countErr) throw countErr;

    if (count === 0) {
      const { error: insertErr } = await supabase
        .from('shop')
        .insert(DEFAULT_SHOPS);

      if (insertErr) throw insertErr;
      console.log('Successfully seeded database shop table.');
    }
  } catch (err) {
    console.error('Failed to seed shop table:', err.message);
  }
}

export async function getShops() {
  if (!isConfigured) {
    return DEFAULT_SHOPS;
  }

  try {
    await seedShopsIfEmpty();

    const { data, error } = await supabase
      .from('shop')
      .select('*')
      .order('shop_name', { ascending: true });

    if (error) throw error;
    return data && data.length > 0 ? data : DEFAULT_SHOPS;
  } catch (err) {
    console.error('Failed to load database shops, using fallback:', err.message);
    return DEFAULT_SHOPS;
  }
}

/**
 * Fetches the stock ledger snapshot for a specific date.
 * Resolves opening stock from the most recent closing stock in history.
 */
export async function getStockLedgerSnapshot(date) {
  if (!isConfigured) {
    // Return mock data for development
    const snapshot = {};
    DEFAULT_SNACKS.forEach(s => {
      snapshot[s.id] = {
        opening_qty: s.lastClosing,
        purchase_qty: 0,
        closing_qty: 0
      };
    });
    return snapshot;
  }

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
  if (!isConfigured) {
    // Return mock data for development
    return [
      {
        id: 1,
        transaction_date: '2026-06-20',
        item_name: 'Samosa (Plate)',
        vendor_name: 'Vishal Snacks Factory',
        shop_name: 'Pune Main Branch',
        purchase_rate: 15,
        quantity: 100,
        gst_percent: 5,
        discount: 2,
        discount_type: '%',
        total_amount: 1470
      },
      {
        id: 2,
        transaction_date: '2026-06-20',
        item_name: 'Kachori (Plate)',
        vendor_name: 'Balaji Foods Pune',
        shop_name: 'Kothrud Outlet',
        purchase_rate: 15,
        quantity: 50,
        gst_percent: 5,
        discount: 0,
        discount_type: '₹',
        total_amount: 787.50
      }
    ];
  }

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


