import { supabase, isConfigured } from '../lib/supabase';

// Standard fallback/initial snack items list with mock default rates and mock closings
const DEFAULT_SNACKS = [
  { id: '1', item_name: 'Samosa (Plate)', unit: 'plate', rate: 25, lastClosing: 45 },
  { id: '2', item_name: 'Kachori (Plate)', unit: 'plate', rate: 25, lastClosing: 30 },
  { id: '3', item_name: 'Aloo Tikki (Plate)', unit: 'plate', rate: 30, lastClosing: 25 },
  { id: '4', item_name: 'Potato Chips (Salted) 100g', unit: 'pack', rate: 40, lastClosing: 120 },
  { id: '5', item_name: 'Potato Chips (Masala) 100g', unit: 'pack', rate: 45, lastClosing: 95 },
  { id: '6', item_name: 'Banana Chips 100g', unit: 'pack', rate: 50, lastClosing: 60 },
  { id: '7', item_name: 'Chakli 200g', unit: 'pack', rate: 80, lastClosing: 40 },
  { id: '8', item_name: 'Special Sev 200g', unit: 'pack', rate: 70, lastClosing: 80 },
  { id: '9', item_name: 'Bhakarwadi 250g', unit: 'pack', rate: 90, lastClosing: 75 },
  { id: '10', item_name: 'Dhokla (Plate)', unit: 'plate', rate: 30, lastClosing: 35 },
  { id: '11', item_name: 'Paneer Pattice', unit: 'piece', rate: 20, lastClosing: 20 },
  { id: '12', item_name: 'Sweet Ladoo (Pack)', unit: 'pack', rate: 120, lastClosing: 15 },
  { id: '13', item_name: 'Gulab Jamun (2 pcs)', unit: 'plate', rate: 30, lastClosing: 50 },
  { id: '14', item_name: 'Masala Chai', unit: 'cup', rate: 12, lastClosing: 150 },
  { id: '15', item_name: 'Filter Coffee', unit: 'cup', rate: 18, lastClosing: 100 },
  { id: '16', item_name: 'Cold Drink (300ml)', unit: 'bottle', rate: 20, lastClosing: 200 }
];

// Helper to get standard rate for mock data
export const getDefaultRate = (itemName) => {
  const matched = DEFAULT_SNACKS.find(s => s.item_name === itemName);
  return matched ? matched.rate : 0;
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
      // Map item rows to include rates from mrp or fallback default rates
      return data.map(item => ({
        ...item,
        rate: item.mrp || getDefaultRate(item.item_name)
      }));
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
        is_active: true
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

export async function getVendors() {
  if (!isConfigured) {
    return DEFAULT_VENDORS;
  }

  try {
    await seedVendorsIfEmpty();

    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('is_active', true)
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
export async function submitPurchaseTransaction(date, vendorId, itemsList) {
  if (!isConfigured) {
    // Simulated mock delay
    await new Promise(resolve => setTimeout(resolve, 800));
    return { success: true, mode: 'mock' };
  }

  try {
    // 1. Insert transaction
    const { data: tx, error: txErr } = await supabase
      .from('inventory_transactions')
      .insert([{ transaction_date: date, transaction_type: 'purchase' }])
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
export async function submitClosingStockTransaction(date, itemId, lastClosing, godownQty, counterQty, totalQty) {
  if (!isConfigured) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return { success: true, mode: 'mock' };
  }

  try {
    // 1. Insert transaction
    const { data: tx, error: txErr } = await supabase
      .from('inventory_transactions')
      .insert([{ transaction_date: date, transaction_type: 'closing_stock' }])
      .select()
      .single();

    if (txErr) throw txErr;

    // 2. Insert detail
    const { error: detailErr } = await supabase
      .from('closing_stock_items')
      .insert([{
        transaction_id: tx.id,
        item_id: itemId,
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
export async function submitSaleAmountTransaction(date, gpay, cash, expense, totalClosing) {
  if (!isConfigured) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return { success: true, mode: 'mock' };
  }

  try {
    // 1. Insert transaction
    const { data: tx, error: txErr } = await supabase
      .from('inventory_transactions')
      .insert([{ transaction_date: date, transaction_type: 'sale_amount' }])
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
