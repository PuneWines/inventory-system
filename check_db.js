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

console.log('URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  try {
    const { data: shops, error: err1 } = await supabase.from('shop').select('*');
    console.log('Shops count:', shops?.length, 'Data:', shops, 'Error:', err1);

    const { data: vendors, error: err2 } = await supabase.from('vendors').select('*').limit(3);
    console.log('Vendors:', vendors, 'Error:', err2);

    const { data: ledger, error: err3 } = await supabase.from('stock_ledger').select('*').limit(3);
    console.log('Ledger:', ledger, 'Error:', err3);
  } catch (e) {
    console.error(e);
  }
}

check();
