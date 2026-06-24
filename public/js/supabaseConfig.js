// Supabase project config — URL + publishable (anon) key.
//
// These are SAFE to commit and expose client-side: the publishable key grants
// only what Row-Level Security allows — anonymous INSERT into `feedback`, and
// nothing on the per-user sync tables (training_sessions / user_fingerings)
// without an authenticated session (see supabase/sync.sql). The real secrets
// (Resend API key, SMTP password) live in Supabase, never in this repo.
//
// Kept in its own tiny module (no heavy imports) so feedback.js can read the
// constants without dragging in the @supabase/supabase-js client, which only
// the data page (supabaseClient.js) needs.
export const SUPABASE_URL = 'https://mtihhulokbhhvkomlmmk.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vIltAWqwpRCJ5_b6Wle3bA_dNgnMRz4'

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)
