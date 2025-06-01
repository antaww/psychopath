import { createClient } from '@supabase/supabase-js';

// Retrieve these values from your environment variables
// Ideally, for production, use environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables for Psychopath project');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
    realtime: {
        params: {
            eventsPerSecond: 15, 
        },
        reconnectAfterMs: (retries: number) => { 
            const backoffMs = Math.min(1000 * Math.pow(2, retries), 30000);
            return backoffMs;
        },
    },
    global: {
        headers: { 
            'X-Client-Info': 'psychopath-game',
        },
    },
});