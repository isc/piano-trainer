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
        // Implicit flow (session tokens in the URL hash), NOT pkce: Supabase's
        // email magic link is a /auth/v1/verify link that redirects back with
        // `#access_token=…`. PKCE would need a code-verifier stored in the same
        // browser that requested the link, which breaks magic links opened on
        // another device (or triggered server-side).
        flowType: 'implicit',
      },
    })
  : null

// Where the magic-link email should send the user back to — the data page on
// whatever origin they started from (works on localhost and GitHub Pages, both
// allow-listed in the project's auth config).
export function authRedirectUrl() {
  return new URL('data.html', window.location.href).href
}
