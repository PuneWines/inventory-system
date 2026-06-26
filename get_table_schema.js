import { readFileSync } from 'fs';

const envText = readFileSync('.env', 'utf-8');
const env = {};
envText.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;

async function getHelp() {
  const url = `${supabaseUrl}/rest/v1/`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    const data = await res.json();
    console.log('OpenAPI definitions keys:', Object.keys(data.definitions || {}));
    if (data.definitions && data.definitions.manager_report) {
      console.log('manager_report definition:', JSON.stringify(data.definitions.manager_report, null, 2));
    } else {
      console.log('manager_report definition not found in OpenAPI spec.');
    }
  } catch (e) {
    console.error('Error fetching OpenAPI spec:', e);
  }
}

getHelp();
