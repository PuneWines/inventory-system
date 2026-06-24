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

  const targetItems = [
    'ZERO SUGAR JAMUN MRP 55',
    'AMERICAN MRP 12',
    'AMUL CHEESE MRP 20',
    'Apple chips Mrp 100'
  ];

  console.log('Searching for target items...');
  const { data: items, error: itemsErr } = await supabase
    .from('items')
    .select('id, item_name')
    .in('item_name', targetItems);

  if (itemsErr) {
    console.error('Error fetching items:', itemsErr);
  } else {
    console.log('Found items:', items);
    
    if (items && items.length > 0) {
      const itemIds = items.map(i => i.id);
      
      console.log('\nFetching purchase_items entries for these item IDs:', itemIds);
      const { data: purchases, error: purchasesErr } = await supabase
        .from('purchase_items')
        .select('id, item_id, purchase_rate, created_at')
        .in('item_id', itemIds)
        .order('created_at', { ascending: false });

      if (purchasesErr) {
        console.error('Error fetching purchase_items:', purchasesErr);
      } else {
        console.log('Purchase entries found:', purchases);
      }
    } else {
      console.log('No matching items found in items table! Let us list a few items to check the exact names.');
      const { data: allItems } = await supabase.from('items').select('id, item_name').limit(20);
      console.log('All items sample:', allItems);
    }
  }

} catch (err) {
  console.error('Error in script:', err);
}
