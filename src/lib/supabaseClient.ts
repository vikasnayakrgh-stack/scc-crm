import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://zshihpvmtvwsbwrjpugy.supabase.co';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaGlocHZtdHZ3c2J3cmpwdWd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NTE3NzQsImV4cCI6MjEwNjUyNzc3NH0.2JFklouU1JlaP2D3HEYyKbDTNXbfLgR8OIGkKUp2NBw';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes('your_supabase') &&
  !supabaseKey.includes('your_new_anon_key') &&
  !supabaseKey.includes('your_supabase_anon_key_here')
);

if (!isSupabaseConfigured) {
  console.warn(
    '⚠️ Supabase credentials are not configured or are placeholder in .env. Running in offline/local mock mode.'
  );
}

// Fallback dummy URL/key to prevent createClient from crashing if unconfigured
const effectiveUrl = isSupabaseConfigured ? supabaseUrl : 'https://placeholder.supabase.co';
const effectiveKey = isSupabaseConfigured ? supabaseKey : 'placeholder-anon-key';

export const supabase: SupabaseClient = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});