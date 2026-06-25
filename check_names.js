import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envText = readFileSync('.env', 'utf-8');
const env = {};
envText.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkNames() {
  try {
    const { data: items } = await supabase.from('items').select('item_name, mrp, shop_id');
    const { data: sales } = await supabase.from('sale_history').select('item_name, sale_qty, transaction_date');
    const { data: purchases } = await supabase.from('purchase_items').select('items(item_name), quantity');

    console.log('ITEMS IN DATABASE:', items);
    console.log('SALES IN DATABASE:', sales);
    console.log('PURCHASES IN DATABASE:', purchases);
  } catch (err) {
    console.error(err);
  }
}

checkNames();
