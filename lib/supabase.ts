import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Single browser client. The Streamlit app talks to Supabase directly with the
// anon key (RLS is disabled on the app tables), so we do the same here — no
// separate backend needed, which is what lets the whole app run on Vercel.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};
