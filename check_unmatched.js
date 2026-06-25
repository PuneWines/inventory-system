import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envText = readFileSync('.env', 'utf-8');
const env = {};
envText.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data: items } = await supabase.from('items').select('item_name, mrp');
  const { data: sales } = await supabase.from('sale_history').select('item_name');

  const itemNames = new Set(items.map(i => i.item_name.trim().toLowerCase()));
  const unmatched = [];
  
  sales.forEach(s => {
    const name = s.item_name.trim().toLowerCase();
    if (!itemNames.has(name)) {
      unmatched.push(s.item_name);
    }
  });

  console.log('UNMATCHED ITEMS IN SALE HISTORY:', Array.from(new Set(unmatched)));
}
check();
