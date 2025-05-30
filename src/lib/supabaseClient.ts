import { createClient } from '@supabase/supabase-js';

// Retrieve these values from your environment variables
// Ideally, for production, use environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey); 