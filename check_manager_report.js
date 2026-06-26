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

async function check() {
  try {
    const { data, error } = await supabase.from('manager_report').select('*').limit(5);
    if (error) {
      console.error('Error fetching manager_report:', error);
    } else {
      console.log('Manager Report Data:', JSON.stringify(data, null, 2));
      if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
      } else {
        console.log('No rows found in manager_report.');
      }
    }
  } catch (e) {
    console.error(e);
  }
}

check();
