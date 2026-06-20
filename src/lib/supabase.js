import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

let supabase = null
let isConfigured = false

if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project-id')) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey)
    isConfigured = true
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err)
  }
} else {
  console.warn(
    'Supabase environment variables are missing or default. Seeding and transactions will operate in mock/session mode.'
  )
}

export { supabase, isConfigured }
