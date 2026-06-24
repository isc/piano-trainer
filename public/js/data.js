// Data page: local backup (export/import) + account (magic-link sign-in).
//
// This page is the home for everything data-related. Cloud sync of training
// data builds on the account section here (next step); for now it owns the
// export/import that used to live in the ⚙️ menu, plus passwordless sign-in.
import { initStorage } from './storage.js'
import { t } from './i18n.js'

export function dataApp() {
  const storage = initStorage()
  // Loaded lazily in init() so export/import work without waiting on (or even
  // reaching) the @supabase/supabase-js CDN module.
  let supabase = null
  let authRedirectUrl = null

  return {
    cloudConfigured: false,
    authReady: false,
    user: null, // the signed-in Supabase user, or null
    email: '',
    authStatus: 'idle', // 'idle' | 'sending' | 'sent' | 'error'
    authError: '',

    async init() {
      await storage.init()
      try {
        const mod = await import('./supabaseClient.js')
        supabase = mod.supabase
        authRedirectUrl = mod.authRedirectUrl
        this.cloudConfigured = !!supabase
      } catch (err) {
        console.error('Supabase client failed to load:', err)
        this.cloudConfigured = false
      }
      if (supabase) {
        const { data } = await supabase.auth.getSession()
        this.user = data.session?.user ?? null
        // Keep the UI in sync with sign-in/out and the magic-link redirect.
        supabase.auth.onAuthStateChange((_event, session) => {
          this.user = session?.user ?? null
        })
      }
      this.authReady = true
    },

    async sendMagicLink() {
      const email = this.email.trim()
      if (!email || this.authStatus === 'sending') return
      this.authStatus = 'sending'
      this.authError = ''
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: authRedirectUrl() },
      })
      if (error) {
        this.authStatus = 'error'
        this.authError = error.message
      } else {
        this.authStatus = 'sent'
      }
    },

    async signOut() {
      await supabase?.auth.signOut()
      this.user = null
      this.authStatus = 'idle'
      this.email = ''
    },

    async exportBackup() {
      try {
        const backupData = await storage.exportBackup()
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `piano-trainer-backup-${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        alert(t('library.exportOk'))
      } catch (error) {
        console.error('Export error:', error)
        alert(t('library.exportError', { error: error.message }))
      }
    },

    async importBackup(event) {
      const file = event.target.files[0]
      if (!file) return
      try {
        const backupData = JSON.parse(await file.text())
        const result = await storage.importBackup(backupData)
        if (result.success) {
          alert(
            t('library.importOk', {
              sessions: result.importedSessions,
              aggregates: result.importedAggregates,
              fingerings: result.importedFingerings,
            })
          )
        }
      } catch (error) {
        console.error('Import error:', error)
        alert(t('library.importError', { error: error.message }))
      }
      event.target.value = ''
    },
  }
}
