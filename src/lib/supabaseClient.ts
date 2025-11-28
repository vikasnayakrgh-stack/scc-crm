import { createClient } from '@supabase/supabase-js';

// Credentials provided for the production build
const SUPABASE_URL = 'https://chqxlalplhhypnfnipom.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNocXhsYWxwbGhoeXBuZm5pcG9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNzAyNzAsImV4cCI6MjA3OTg0NjI3MH0.vGTdF6kZZPmxoSboYSFqtxHgMggJZDhhnutXFNeVn9U';

// Use env vars if available (e.g. in dev), otherwise use provided production credentials
const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase environment variables are missing!");
}

export const supabase = createClient(supabaseUrl, supabaseKey);