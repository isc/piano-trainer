import { initMidi } from './midi.js'
import { initPracticeTracker } from './practiceTracker.js'
import { initStorage } from './storage.js'
import { formatDuration, formatDate, formatRelativeDate, statusLabel, scorePageUrl } from './utils.js'
import { PERIODS, periodLabel, getPeriodForComposer } from './musicalPeriods.js'
import { CHANGELOG } from './changelog.js'
import { t, locale, getLang } from './i18n.js'

const CHANGELOG_SEEN_KEY = 'pt-changelog-seen'
const CHANGELOG_DATE_FORMATTER = new Intl.DateTimeFormat(locale(), {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const MIN_MATCH = 5
const STATUS_ORDER = ['dechiffrage', 'perfectionnement', 'repertoire']
const STATUS_RANK = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i]))
const STALE_DAYS = 7
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000

export function libraryApp() {
  const midi = initMidi()
  const storage = initStorage()
  const practiceTracker = initPracticeTracker(storage)

  let fingerprints = []
  let matchPointers = {}
  let searchResetTimer = null
  let sessionCountByFile = {}

  return {
    scores: [],
    searchQuery: '',
    statusFilter: '',
    composerFilter: '',
    periodFilter: '',    // '' | 'baroque' | 'classique' | 'romantique' | 'moderne' | 'contemporain' | 'traditionnel'
    focusFilter: '',     // '' | 'reinforce' | 'near-mastery' | 'stale'
    sortBy: 'lastPlayed', // 'title' | 'composer' | 'status' | 'practice' | 'lastPlayed'
    sortDir: 'desc',      // 'asc' | 'desc'
    baseUrl: '',
    dailyLogsByDate: [],
    lastPlayedByScore: {},
    aggregatesByScore: {},
    changelog: CHANGELOG,
    showChangelogModal: false,
    hasUnseenChangelog: false,

    async init() {
      // Mark this visitor as a returning user so the landing page (/) can
      // redirect them straight here instead of showing the pitch each time.
      try {
        localStorage.setItem('pt-returning', '1')
      } catch {
        // localStorage unavailable (private mode): no marker, no redirect — fine.
      }

      // Flag the "Nouveautés" button when the latest entry post-dates the last
      // time the user opened the changelog (or has never opened it).
      const latest = CHANGELOG[0]?.date
      const seen = localStorage.getItem(CHANGELOG_SEEN_KEY)
      this.hasUnseenChangelog = !!latest && seen !== latest

      for (const key of ['statusFilter', 'composerFilter', 'periodFilter', 'focusFilter', 'searchQuery']) {
        this.$watch(key, () => this.syncUrl())
      }

      // "/" focuses the search input (GitHub / YouTube convention). Skip when
      // the user is already typing somewhere so the slash isn't swallowed.
      document.addEventListener('keydown', (e) => {
        if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
        if (e.target instanceof Element &&
            e.target.matches('input, textarea, select, [contenteditable="true"]')) return
        const search = document.querySelector('input[type="search"]')
        if (!search) return
        e.preventDefault()
        search.focus()
        search.select()
      })

      midi.setCallbacks({
        onNotePlayed: (_, midiNote) => this.handleSearchNote(midiNote),
      })
      midi.connectMIDI({ silent: true, autoSelectFirst: true })

      const [scoresResponse, fingerprintsResponse] = await Promise.all([
        fetch('data/scores.json'),
        fetch('data/fingerprints.json'),
        practiceTracker.init(),
      ])
      const data = await scoresResponse.json()
      this.baseUrl = data.baseUrl

      const fpData = await fingerprintsResponse.json()
      fingerprints = fpData.fingerprints

      // Build maps from sessions: most recent play time + count per score file
      const sessions = await storage.getSessions()
      for (const session of sessions) {
        const existing = this.lastPlayedByScore[session.scoreId]
        if (!existing || session.startedAt > existing) {
          this.lastPlayedByScore[session.scoreId] = session.startedAt
        }
        if (session.scoreId.startsWith(this.baseUrl)) {
          const file = session.scoreId.slice(this.baseUrl.length)
          sessionCountByFile[file] = (sessionCountByFile[file] ?? 0) + 1
        }
      }

      // Aggregates power the status filter, status pills, and practice-focus banner.
      const aggregates = await storage.getAllAggregates()
      for (const agg of aggregates) {
        if (!agg || (agg.practiceDays || []).length === 0) continue
        this.aggregatesByScore[agg.scoreId] = agg
      }

      this.scores = data.scores

      // Restore filters from URL once the scores are in: x-model on the
      // <select> dropdowns only matches an existing <option>, and those
      // are rendered by an x-for over periodOptions / composerOptions
      // which depend on this.scores. Setting the filters before this
      // makes Alpine bind to a still-empty option list and silently keep
      // the default "Toutes périodes" / "Tous compositeurs". $nextTick
      // gives the template x-for a chance to flush before x-model rebinds.
      await this.$nextTick()
      const params = new URLSearchParams(window.location.search)
      this.statusFilter = params.get('status') || ''
      this.composerFilter = params.get('composer') || ''
      this.periodFilter = params.get('period') || ''
      this.focusFilter = params.get('focus') || ''
      this.searchQuery = params.get('q') || ''

      await this.reloadDailyLogs()
    },

    handleSearchNote(midiNote) {
      if (fingerprints.length === 0) return

      clearTimeout(searchResetTimer)

      let maxPos = 0
      let leader = null
      let leaderSessions = -1

      for (const fp of fingerprints) {
        const pos = matchPointers[fp.file] ?? 0
        const advanced = pos < fp.notes.length && fp.notes[pos] === midiNote
        const currentPos = advanced ? pos + 1 : pos

        if (advanced) matchPointers[fp.file] = currentPos

        if (currentPos > maxPos) {
          maxPos = currentPos
          leader = fp
          leaderSessions = sessionCountByFile[fp.file] ?? 0
        } else if (currentPos === maxPos && currentPos > 0) {
          const count = sessionCountByFile[fp.file] ?? 0
          if (count > leaderSessions) {
            leader = fp
            leaderSessions = count
          } else if (count === leaderSessions) {
            leader = null
          }
        }
      }

      if (maxPos >= MIN_MATCH && leader !== null) {
        window.location.href = scorePageUrl(this.baseUrl + leader.file)
        return
      }

      searchResetTimer = setTimeout(() => this.resetNoteSearch(), 3000)
    },

    resetNoteSearch() {
      matchPointers = {}
      clearTimeout(searchResetTimer)
    },

    get filteredScores() {
      let results = this.scores
      if (this.searchQuery) {
        const regexes = this.searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean).map((w) => new RegExp(`\\b${w}`))
        results = results.filter((score) => {
          const text = `${score.title} ${score.composer}`.toLowerCase()
          return regexes.every((r) => r.test(text))
        })
      }
      if (this.statusFilter)   results = results.filter((s) => this.getStatusFor(s) === this.statusFilter)
      if (this.composerFilter) results = results.filter((s) => s.composer === this.composerFilter)
      if (this.periodFilter)   results = results.filter((s) => getPeriodForComposer(s.composer) === this.periodFilter)
      if (this.focusFilter)    results = results.filter((s) => this.matchesFocus(s, this.focusFilter))
      const dir = this.sortDir === 'asc' ? 1 : -1
      return results.toSorted((a, b) => {
        const va = this.sortKey(a), vb = this.sortKey(b)
        if (this.sortBy === 'status') return ((STATUS_RANK[va] ?? -1) - (STATUS_RANK[vb] ?? -1)) * dir
        if (typeof va === 'number') return (va - vb) * dir
        return (va || '').localeCompare(vb || '', locale()) * dir
      })
    },

    sortKey(score) {
      switch (this.sortBy) {
        case 'title':      return score.title
        case 'composer':   return score.composer
        case 'status':     return this.getStatusFor(score)
        case 'practice':   return this.getPracticeTimeFor(score)
        default:           return this.lastPlayedByScore[this.getScoreUrl(score)] || ''
      }
    },

    toggleSort(column) {
      if (this.sortBy === column) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'
        return
      }
      this.sortBy = column
      // Text columns sort A→Z by default; numeric/date columns biggest/most-recent first.
      this.sortDir = (column === 'title' || column === 'composer') ? 'asc' : 'desc'
    },

    sortArrow(column) {
      if (this.sortBy !== column) return ''
      return this.sortDir === 'asc' ? ' ▲' : ' ▼'
    },

    // Clicking the same value clears the filter — natural toggle for pills.
    setStatusFilter(status)     { this.statusFilter   = (this.statusFilter   === status)   ? '' : status },
    setComposerFilter(composer) { this.composerFilter = (this.composerFilter === composer) ? '' : composer },
    setPeriodFilter(period)     { this.periodFilter   = (this.periodFilter   === period)   ? '' : period },
    setFocusFilter(focus)       { this.focusFilter    = (this.focusFilter    === focus)    ? '' : focus },

    syncUrl() {
      const params = new URLSearchParams()
      if (this.statusFilter)   params.set('status', this.statusFilter)
      if (this.composerFilter) params.set('composer', this.composerFilter)
      if (this.periodFilter)   params.set('period', this.periodFilter)
      if (this.focusFilter)    params.set('focus', this.focusFilter)
      if (this.searchQuery)    params.set('q', this.searchQuery)
      const qs = params.toString()
      const url = qs ? `?${qs}` : window.location.pathname
      window.history.replaceState(null, '', url)
    },

    get statusOptions() {
      const counts = { dechiffrage: 0, perfectionnement: 0, repertoire: 0 }
      for (const score of this.scores) {
        const status = this.getStatusFor(score)
        if (status && counts[status] !== undefined) counts[status]++
      }
      return STATUS_ORDER.map((value) => ({ value, label: statusLabel(value), count: counts[value] }))
    },

    get composerOptions() {
      const set = new Set(this.scores.map((s) => s.composer).filter(Boolean))
      return [...set].sort((a, b) => a.localeCompare(b, locale()))
    },

    // Surface only periods that actually have scores in the library, so the
    // dropdown doesn't list dead-end options.
    get periodOptions() {
      const counts = {}
      for (const score of this.scores) {
        const p = getPeriodForComposer(score.composer)
        if (p) counts[p] = (counts[p] || 0) + 1
      }
      return PERIODS
        .filter((value) => counts[value] > 0)
        .map((value) => ({ value, label: periodLabel(value), count: counts[value] }))
    },

    // Each focus chip filters the table to an actionable subset — the user
    // can immediately see which pieces match, unlike a passive count banner.
    matchesFocus(score, focus) {
      const agg = this.aggregateFor(score)
      if (!agg) return false
      const measures = Object.values(agg.measures || {})
      if (focus === 'reinforce') {
        return measures.some((m) => (m.totalAttempts || 0) >= 2 && (m.errorRate || 0) > 0.4)
      }
      if (focus === 'near-mastery') {
        if (agg.status !== 'perfectionnement' || measures.length === 0) return false
        const clean = measures.filter((m) => (m.cleanAttempts || 0) >= 3).length
        return clean / measures.length >= 0.8
      }
      if (focus === 'stale') {
        return !!agg.lastPlayedAt && Date.now() - new Date(agg.lastPlayedAt).getTime() > STALE_MS
      }
      return false
    },

    get focusOptions() {
      const counts = { reinforce: 0, 'near-mastery': 0, stale: 0 }
      for (const score of this.scores) {
        for (const k of Object.keys(counts)) {
          if (this.matchesFocus(score, k)) counts[k]++
        }
      }
      return [
        { value: 'reinforce',    label: t('focus.reinforce'),                 count: counts.reinforce },
        { value: 'near-mastery', label: t('focus.nearMastery'),               count: counts['near-mastery'] },
        { value: 'stale',        label: t('focus.stale', { n: STALE_DAYS }),  count: counts.stale },
      ].filter((opt) => opt.count > 0)
    },

    // A collection ("recueil", e.g. les 20 exercices de Hanon) is a single
    // library row whose entry has `parts` instead of `file`. Practice data
    // stays keyed per part file; the row aggregates it and opening the row
    // resumes the last-played part.
    isCollection(score) { return Array.isArray(score.parts) },

    lastPlayedPartOf(score) {
      let best = null
      for (const part of score.parts) {
        const at = this.lastPlayedByScore[this.baseUrl + part.file]
        if (at && (!best || at > best.at)) best = { part, at }
      }
      return best?.part
    },

    getScoreUrl(score) {
      const file = this.isCollection(score)
        ? (this.lastPlayedPartOf(score) ?? score.parts[0]).file
        : score.file
      return this.baseUrl + file
    },

    aggregateFor(score) {
      if (!this.isCollection(score)) return this.aggregatesByScore[this.getScoreUrl(score)]
      // Synthesized from the parts: times summed, dates maxed, measures pooled
      // (keys namespaced by part — focus chips only look at the values). No
      // status — statuses live per exercise, not per recueil.
      let agg = null
      for (const part of score.parts) {
        const partAgg = this.aggregatesByScore[this.baseUrl + part.file]
        if (!partAgg) continue
        agg ??= { totalPracticeTimeMs: 0, timesCompleted: 0, lastPlayedAt: null, lastCompletedAt: null, measures: {} }
        agg.totalPracticeTimeMs += partAgg.totalPracticeTimeMs || 0
        agg.timesCompleted += partAgg.timesCompleted || 0
        for (const key of ['lastPlayedAt', 'lastCompletedAt']) {
          if (partAgg[key] && (!agg[key] || partAgg[key] > agg[key])) agg[key] = partAgg[key]
        }
        for (const [index, measure] of Object.entries(partAgg.measures || {})) {
          agg.measures[`${part.file}:${index}`] = measure
        }
      }
      return agg
    },
    getStatusFor(score)        { return this.aggregateFor(score)?.status || null },
    getPracticeTimeFor(score)  { return this.aggregateFor(score)?.totalPracticeTimeMs || 0 },

    // Returns '' (not "0×") for never-completed scores, so Alpine x-show
    // can hide the sub-line entirely instead of leaving an empty row.
    getPracticeSubline(score) {
      const agg = this.aggregateFor(score)
      const last = agg?.lastCompletedAt || agg?.lastPlayedAt
      const times = agg?.timesCompleted || 0
      const parts = []
      if (times > 0) parts.push(t('library.timesPlayed', { n: times }))
      if (last) parts.push(formatRelativeDate(last))
      return parts.join(' · ')
    },

    formatDuration,
    formatDate,
    statusLabel,
    scorePageUrl,

    openChangelog() {
      this.showChangelogModal = true
      // Opening the changelog clears the "unseen" flag until the next entry.
      const latest = CHANGELOG[0]?.date
      if (latest) localStorage.setItem(CHANGELOG_SEEN_KEY, latest)
      this.hasUnseenChangelog = false
    },

    formatChangelogDate(iso) {
      const [y, m, d] = iso.split('-').map(Number)
      return CHANGELOG_DATE_FORMATTER.format(new Date(y, m - 1, d))
    },

    // Changelog entries carry their items per language ({ fr: [...], en: [...] });
    // fall back to the other language, then to a bare array for older entries.
    changelogItems(entry) {
      if (Array.isArray(entry.items)) return entry.items
      return entry.items?.[getLang()] ?? entry.items?.fr ?? entry.items?.en ?? []
    },

    getTotalPracticeTimeForDate(dateEntry) {
      return dateEntry.log.reduce((sum, entry) => sum + entry.totalPracticeTimeMs, 0)
    },

    async importBackup(event) {
      const file = event.target.files[0]
      if (!file) return

      try {
        const text = await file.text()
        const backupData = JSON.parse(text)

        const result = await storage.importBackup(backupData)

        if (result.success) {
          alert(
            t('library.importOk', {
              sessions: result.importedSessions,
              aggregates: result.importedAggregates,
              fingerings: result.importedFingerings,
            })
          )

          await this.reloadDailyLogs()
        }
      } catch (error) {
        console.error('Import error:', error)
        alert(t('library.importError', { error: error.message }))
      }

      event.target.value = ''
    },

    async exportBackup() {
      try {
        const backupData = await storage.exportBackup()

        const blob = new Blob([JSON.stringify(backupData, null, 2)], {
          type: 'application/json',
        })

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

    async reloadDailyLogs() {
      const DAYS_TO_SHOW = 8
      const logPromises = []
      for (let i = 0; i < DAYS_TO_SHOW; i++) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        logPromises.push(
          practiceTracker.getDailyLog(date).then((log) => ({
            date: new Date(date),
            log,
          }))
        )
      }
      this.dailyLogsByDate = await Promise.all(logPromises)
    },
  }
}
