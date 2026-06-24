// Browser Supabase client for auth + cloud sync (data page only).
//
// Imported solely by the data page so the library/score pages don't pull in the
// @supabase/supabase-js bundle. The client persists the session in localStorage
// and auto-refreshes the token; detectSessionInUrl lets it pick up the
// magic-link token when the user lands back on data.html after clicking it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, supabaseConfigured } from './supabaseConfig.js'

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

// Where the magic-link email should send the user back to — the data page on
// whatever origin they started from (works on localhost and GitHub Pages, both
// allow-listed in the project's auth config).
export function authRedirectUrl() {
  return new URL('data.html', window.location.href).href
}
