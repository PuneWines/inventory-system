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

async function testQuery() {
  try {
    const fromDate = '2026-06-01';
    const toDate = '2026-06-30';

    let query = supabase
      .from('purchase_items')
      .select(`
        id,
        purchase_rate,
        quantity,
        total_amount,
        inventory_transactions!inner(
          transaction_date
        )
      `)
      .gte('inventory_transactions.transaction_date', fromDate)
      .lte('inventory_transactions.transaction_date', toDate)
      .limit(5);

    const { data, error } = await query;
    console.log('QUERY RESULT:', data);
    console.log('ERROR:', error);
  } catch (err) {
    console.error('CATCH ERROR:', err);
  }
}

testQuery();
