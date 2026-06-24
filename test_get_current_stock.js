import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

try {
  const envText = readFileSync('.env', 'utf-8');
  const env = {};
  envText.split('\n').forEach(line => {
    const [k, v] = line.split('=');
    if (k && v) env[k.trim()] = v.trim();
  });

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  console.log('Running getCurrentStockItems simulation...');
  
  // Step 1: Fetch items
  const { data: itemsData, error: itemsError } = await supabase
    .from('items')
    .select(`
      *,
      shop:shop(id, shop_name)
    `)
    .order('item_name', { ascending: true });

  if (itemsError) {
    console.error('Items query error:', itemsError);
  } else {
    console.log(`Fetched ${itemsData?.length} items.`);
  }

  // Step 2: Fetch latest purchase rates
  console.log('\nFetching latest purchase rates...');
  const { data: latestRates, error: ratesError } = await supabase
    .from('purchase_items')
    .select('item_id, purchase_rate')
    .order('created_at', { ascending: false });

  if (ratesError) {
    console.error('Rates query error:', ratesError);
  } else {
    console.log(`Fetched ${latestRates?.length} purchase_items rows.`);
  }

  const rateMap = {};
  if (!ratesError && latestRates) {
    latestRates.forEach(r => {
      if (rateMap[r.item_id] === undefined) {
        rateMap[r.item_id] = parseFloat(r.purchase_rate) || 0;
      }
    });
  }

  console.log('\nRate map sample (first 10 keys):', Object.entries(rateMap).slice(0, 10));

  // Step 3: Combine
  const result = (itemsData || []).map(row => {
    const dbRate = parseFloat(row.purchase_rate) || 0;
    const latestRate = rateMap[row.id] !== undefined ? rateMap[row.id] : dbRate;
    return {
      id: row.id,
      item_name: row.item_name,
      db_purchase_rate: dbRate,
      mapped_purchase_rate: latestRate
    };
  });

  console.log('\nSample mapped items (first 10):');
  console.log(result.slice(0, 10));

  console.log('\nChecking target items from user request:');
  const targets = [
    'ZERO SUGAR JAMUN MRP 55',
    'AMERICAN MRP 12',
    'AMUL CHEESE MRP 20',
    'Apple chips Mrp 100'
  ];
  
  result.forEach(item => {
    if (targets.includes(item.item_name)) {
      console.log(`- ${item.item_name}: ID=${item.id}, DB Rate=${item.db_purchase_rate}, Mapped Rate=${item.mapped_purchase_rate}`);
    }
  });

} catch (err) {
  console.error('Error in simulation:', err);
}
