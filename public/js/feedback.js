// User feedback → Supabase (no backend to deploy).
//
// The app is hosted statically on GitHub Pages, so there is no server to
// receive feedback. Instead the browser POSTs straight to Supabase's PostgREST
// API, exactly like Tablito. A Postgres trigger then emails each new row via
// Resend — see `supabase/feedback.sql` for the table, RLS and trigger DDL you
// apply by hand on a fresh, piano-trainer-only Supabase project.
//
// The two constants below are SAFE to commit and expose client-side: the
// publishable key only grants what Row-Level Security allows (here: INSERT into
// `feedback`, nothing else — no reads, no other tables). The real secret (the
// Resend API key) lives in Supabase Vault, never in this repo.
//
// Until you paste the new project's values here, `feedbackEnabled` is false and
// the library hides the feedback button — the rest of the app is unaffected.
const SUPABASE_URL = 'https://mtihhulokbhhvkomlmmk.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vIltAWqwpRCJ5_b6Wle3bA_dNgnMRz4'

import { CHANGELOG } from './changelog.js'
import { getLang } from './i18n.js'

export const feedbackEnabled = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)

// The latest changelog date doubles as an app "version": it tells us which
// build the feedback was written against without a separate version constant.
const APP_VERSION = CHANGELOG[0]?.date ?? 'unknown'

// Non-identifying environment captured with every submission, so a bug report
// carries the context to reproduce it. No personal data, no stored identifiers.
export function buildBaseContext() {
  return {
    app_version: APP_VERSION,
    locale: getLang(),
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    viewport:
      typeof window !== 'undefined'
        ? { w: window.innerWidth, h: window.innerHeight }
        : null,
  }
}

// POST one feedback row. Throws on a non-2xx response so the caller can show an
// error state; the Supabase trigger handles the email asynchronously.
export async function submitFeedback({ message, email, category, context }) {
  if (!feedbackEnabled) throw new Error('Feedback disabled (missing configuration)')
  const res = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      message,
      email: email && email.trim() ? email.trim() : null,
      category: category || null,
      context,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail || `HTTP ${res.status}`)
  }
}
