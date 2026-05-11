import { initMidi } from './midi.js'
import { initMusicXML } from './musicxml.js'
import { initFingeringEditor } from './fingeringEditor.js'
import { initCassettes } from './cassettes.js'
import { initPracticeTracker } from './practiceTracker.js'
import { formatDuration, formatDate, applyStickyOffset } from './utils.js'
import { initStorage } from './storage.js'
import { loadMxlAsXml } from './mxlLoader.js'
import { injectFingerings } from './fingeringInjector.js'
import { initPlayback, getBPM } from './playback.js'
import { initStrictPlaythrough } from './strictPlaythrough.js'

export function midiApp() {
  const midi = initMidi()
  const musicxml = initMusicXML()
  const fingeringEditor = initFingeringEditor({
    getOsmdInstance: musicxml.getOsmdInstance,
    getAllNotes: musicxml.getAllNotes,
    getNoteDataByKey: musicxml.getNoteDataByKey,
    svgNote: musicxml.svgNote,
    svgNotehead: musicxml.svgNotehead,
  })
  const cassettes = initCassettes()
  const storage = initStorage()
  const practiceTracker = initPracticeTracker(storage)
  const playback = initPlayback(midi.state)
  const strictPlaythrough = initStrictPlaythrough()

  return {
    bluetoothConnected: false,
    midiDeviceName: null,
    osmdInstance: null,
    isRecording: false,
    isReplaying: false,
    replayEnded: false,
    isPlaying: false,
    isStrictPlaying: false,
    strictBpm: 120,
    strictResult: null,
    cassettes: [],
    selectedCassette: '',
    cassetteApiAvailable: false,
    trainingMode: false,

    // Practice tracking (only for scores loaded via URL, not uploads)
    scoreUrl: null,
    scoreTitle: null,
    scoreComposer: null,

    // Hand selection (both active by default)
    rightHandActive: true,
    leftHandActive: true,

    // UI states
    errorMessage: null,
    showHistoryModal: false,
    scoreHistory: [],
    historyTotalMs: 0,
    historyHotMeasures: [],
    measuresToReinforce: [],
    reinforcementMode: false,
    showMidiHelpModal: false,
    settingsMenuOpen: false,

    // Unified result modal (replaces showScoreCompleteModal,
    // showStrictResultModal, showReinforcementCompleteModal,
    // and the inline trainingComplete banner).
    showResultModal: false,
    resultMode: null, // 'free' | 'training' | 'strict' | 'reinforcement'
    currentPlaythroughDuration: null,
    previousPlaythroughs: [],

    // Fingering annotation
    fingeringEnabled: false,
    showFingeringModal: false,
    selectedNoteKey: null,
    fingeringSequence: '',
    fingeringKeydownHandler: null,

    async init() {
      playback.setOnPlaybackEnd(() => { this.isPlaying = false })

      // Sticky-bar offset feeds the cursor's scroll-margin-top (CSS) and
      // scrollToMeasure() (JS). Update on init, on resize, and whenever the
      // mode-context band toggles visibility (which happens via currentMode).
      // Don't $watch osmdInstance directly — Alpine deep-compares via
      // JSON.stringify, and OSMD has circular references (note ↔ voiceEntry).
      // afterScoreLoad() calls applyStickyOffset() explicitly instead.
      applyStickyOffset()
      window.addEventListener('resize', applyStickyOffset)
      // $nextTick (not queueMicrotask) — the context band toggles via x-show,
      // and Alpine flips its `display` style on the next tick. A microtask
      // fires too early and we measure 0 for the band that's about to appear.
      this.$watch('currentMode', () => this.$nextTick(applyStickyOffset))
      this.$watch('reinforcementMode', () => this.$nextTick(applyStickyOffset))

      await this.loadCassettesList()

      await storage.init()
      await practiceTracker.init()

      // Auto-connect to MIDI device silently
      await midi.connectMIDI({ silent: true, autoSelectFirst: true })
      this.syncMidiState()

      const NAVIGATE_HOME_KEY = 21 // A0 - lowest piano key

      midi.setCallbacks({
        onNotePlayed: (noteName, midiNote) => {
          if (midiNote === NAVIGATE_HOME_KEY) {
            window.location.href = 'index.html'
            return
          }
          if (strictPlaythrough.isPlaying) {
            strictPlaythrough.handleNoteOn(midiNote)
            return
          }
          musicxml.activateNote(midiNote)
        },
        onNoteReleased: (noteName, midiNote) => {
          if (strictPlaythrough.isPlaying) return
          musicxml.deactivateNote(midiNote)
        },
      })

      musicxml.setCallbacks({
        onScoreCompleted: async () => {
          practiceTracker.markScoreCompleted()
          await practiceTracker.endSession()

          const allPlaythroughs = this.scoreUrl ? await practiceTracker.getAllPlaythroughs(this.scoreUrl) : []
          window.scrollTo({ top: 0, behavior: 'smooth' })
          this.showScoreComplete(allPlaythroughs)

          // Start new session for next playthrough
          const metadata = musicxml.getScoreMetadata()
          practiceTracker.startSession(this.scoreUrl, metadata.title, metadata.composer, 'free', metadata.totalMeasures)

          // Refresh reinforcement suggestions from the just-completed session
          await this.refreshReinforcementSuggestions()
        },
        onNoteError: (expected, played) => {
          this.errorMessage = `Attendu ${expected}, joué ${played}`
          setTimeout(() => {
            this.errorMessage = ''
          }, 2000)
        },
        onTrainingComplete: async () => {
          this.openResultModal('training')
          await practiceTracker.endSession()
          // Start new session for next playthrough
          const metadata = musicxml.getScoreMetadata()
          practiceTracker.startSession(this.scoreUrl, metadata.title, metadata.composer, 'training', metadata.totalMeasures)
        },
        onMeasureStarted: (sourceMeasureIndex) => {
          practiceTracker.startMeasureAttempt(sourceMeasureIndex)
        },
        onMeasureCompleted: (data) => {
          practiceTracker.endMeasureAttempt(data.clean)
        },
        onWrongNote: () => {
          practiceTracker.recordWrongNote()
        },
        onPlaythroughRestart: () => {
          practiceTracker.restartPlaythrough()
        },
        onReinforcementComplete: async () => {
          this.reinforcementMode = false
          this.trainingMode = false
          musicxml.setTrainingMode(false)
          await practiceTracker.endSession()
          this.openResultModal('reinforcement')

          // Start new free session so subsequent play is tracked
          const metadata = musicxml.getScoreMetadata()
          practiceTracker.startSession(this.scoreUrl, metadata.title, metadata.composer, 'free', metadata.totalMeasures)
        },
      })

      cassettes.setCallbacks({
        onReplayStart: () => {
          this.isReplaying = true
          this.replayEnded = false
        },
        onReplayEnd: () => {
          this.isReplaying = false
          this.replayEnded = true
        },
      })

      // Check URL parameter for score to load (after callbacks are set)
      const urlParams = new URLSearchParams(window.location.search)
      const scoreUrl = urlParams.get('url')
      if (scoreUrl) {
        await this.loadScoreFromURL(scoreUrl)
      }

      // Save session when leaving the page
      window.addEventListener('beforeunload', () => {
        practiceTracker.endSession()
      })
    },

    syncMidiState() {
      this.bluetoothConnected = midi.state.midiConnected
      this.midiDeviceName = midi.state.midiInput?.name || null
    },

    async connectMIDI() {
      const result = await midi.connectMIDI()
      this.syncMidiState()
      if (result?.status === 'no_devices') {
        this.showMidiHelpModal = true
      }
    },

    detectedOS() {
      const ua = navigator.userAgent
      if (/Mac/.test(ua)) return 'mac'
      if (/Win/.test(ua)) return 'windows'
      return 'other'
    },

    startRecording() {
      midi.startRecording()
      this.isRecording = true
    },

    async stopRecording() {
      const result = await midi.stopRecording()
      this.isRecording = false

      if (result) {
        const saveResult = await cassettes.saveCassette(result.name, result.data)

        if (saveResult.success) {
          alert(`Cassette "${saveResult.name}" sauvegardée avec succès !`)
          await this.loadCassettesList()
        } else {
          alert(`Erreur: ${saveResult.error}`)
        }
      }
    },

    async loadCassettesList() {
      const result = await cassettes.loadCassettesList()
      this.cassetteApiAvailable = result.success
      this.cassettes = result.cassettes
    },

    async replayCassette() {
      if (!this.selectedCassette) return
      await cassettes.replayCassette(this.selectedCassette, midi.parseMidiMessage)
    },

    async loadMusicXML(event) {
      this.fingeringEnabled = false
      this.scoreUrl = null
      await musicxml.loadMusicXML(event)
      await this.afterScoreLoad()
      this.captureScoreMetadata()
    },

    async loadScoreFromURL(url) {
      this.scoreUrl = url
      this.fingeringEnabled = true

      await this.renderScoreWithFingerings()
      this.captureScoreMetadata()

      const metadata = musicxml.getScoreMetadata()
      practiceTracker.startSession(url, metadata.title, metadata.composer, 'free', metadata.totalMeasures)

      // Load reinforcement suggestions from last completed playthrough
      await this.refreshReinforcementSuggestions()
    },

    captureScoreMetadata() {
      if (!this.osmdInstance) return
      const metadata = musicxml.getScoreMetadata()
      this.scoreTitle = metadata.title || null
      this.scoreComposer = metadata.composer || null
      if (metadata.title) {
        document.title = `${metadata.title}${metadata.composer ? ' — ' + metadata.composer : ''} · Piano Trainer`
      }
    },

    async renderScoreWithFingerings() {
      const { fingerings } = await storage.getFingerings(this.scoreUrl)
      const xml = await loadMxlAsXml(this.scoreUrl)
      const modified = injectFingerings(xml, fingerings)
      await musicxml.renderMusicXML(modified)
      await this.afterScoreLoad()
      this.setupFingeringHandlers()
    },

    async afterScoreLoad() {
      this.osmdInstance = musicxml.getOsmdInstance()
      // Wait for Alpine to update DOM (show #score container), then render
      await this.$nextTick()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      musicxml.renderScore()
      document.getElementById('score').dataset.renderComplete = Date.now()
      this.strictBpm = Math.round(getBPM(this.osmdInstance))
      // Modebar / context band become visible only after the score loads, so
      // recompute the sticky offset now (cf. note in init()).
      applyStickyOffset()
      await this.requestWakeLock()
    },

    async requestWakeLock() {
      if ('wakeLock' in navigator) {
        try {
          await navigator.wakeLock.request('screen')
        } catch (err) {
          console.warn('Wake lock non disponible:', err)
        }
      }
    },

    async togglePlayback() {
      if (this.isStrictPlaying) this.toggleStrictPlaythrough()
      await playback.togglePlayback(musicxml.getAllNotes(), musicxml.getOsmdInstance())
      this.isPlaying = playback.isPlaying
    },

    toggleStrictPlaythrough() {
      if (strictPlaythrough.isPlaying) {
        strictPlaythrough.stop()
        return
      }

      if (this.isPlaying) playback.stop()
      this.isPlaying = false
      if (this.trainingMode) {
        this.trainingMode = false
        musicxml.setTrainingMode(false)
      }

      strictPlaythrough.setActiveHands({ right: this.rightHandActive, left: this.leftHandActive })
      this.isStrictPlaying = true

      strictPlaythrough.start({
        bpm: this.strictBpm,
        allNotes: musicxml.getAllNotes(),
        osmdInstance: musicxml.getOsmdInstance(),
        onComplete: (result) => {
          this.isStrictPlaying = false
          this.strictResult = result
          if (!result.aborted) this.openResultModal('strict')
        },
      })
    },

    // Returns the active practice mode for the segmented control and
    // contextual band. Reinforcement is a *flavor* of training, not a
    // separate radio option, so the segmented stays on 'training' for it.
    get currentMode() {
      if (this.isStrictPlaying) return 'strict'
      if (this.trainingMode) return 'training'
      return 'free'
    },

    // Centralized mode switcher used by the segmented control. Stops any
    // active mode before activating the next one.
    setMode(name) {
      if (this.currentMode === name && name !== 'free') return
      if (name === 'free') {
        if (this.isStrictPlaying) this.toggleStrictPlaythrough()
        if (this.trainingMode) this.toggleTrainingMode()
        return
      }
      if (name === 'training') {
        if (this.isStrictPlaying) this.toggleStrictPlaythrough()
        if (!this.trainingMode) this.toggleTrainingMode()
        return
      }
      if (name === 'strict') {
        if (this.trainingMode) {
          this.trainingMode = false
          musicxml.setTrainingMode(false)
        }
        if (!this.isStrictPlaying) this.toggleStrictPlaythrough()
        return
      }
    },

    strictAccuracyPercent() {
      if (!this.strictResult || !this.strictResult.total) return 0
      return Math.round((this.strictResult.hit / this.strictResult.total) * 100)
    },

    strictOffTempoTotal() {
      const r = this.strictResult
      if (!r) return 0
      return (r.offTempoEarly ?? 0) + (r.offTempoLate ?? 0)
    },

    async toggleTrainingMode() {
      this.trainingMode = !this.trainingMode

      const mode = this.trainingMode ? 'training' : 'free'
      await practiceTracker.toggleMode(mode)
      musicxml.setTrainingMode(this.trainingMode)
    },

    showScoreComplete(allPlaythroughs) {
      const sorted = [...allPlaythroughs].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      const mostRecent = sorted[0] || null

      this.currentPlaythroughDuration = mostRecent?.durationMs || null

      // Sort all playthroughs by duration (fastest first), marking the current one
      this.previousPlaythroughs = allPlaythroughs
        .map((pt) => ({ ...pt, isCurrent: pt === mostRecent }))
        .sort((a, b) => a.durationMs - b.durationMs)

      this.openResultModal('free')
    },

    openResultModal(mode) {
      this.resultMode = mode
      this.showResultModal = true
    },

    closeResultModal() {
      this.showResultModal = false
    },

    resultTitle() {
      switch (this.resultMode) {
        case 'strict':         return '⏱ Playthrough strict terminé'
        case 'training':       return '🎉 Félicitations — Entraînement terminé'
        case 'reinforcement':  return '🎯 Renforcement terminé'
        default:               return '🎉 Partition terminée'
      }
    },

    async refreshReinforcementSuggestions() {
      if (!this.scoreUrl) {
        this.measuresToReinforce = []
        return
      }
      const lastSession = await practiceTracker.getLastCompletedSession(this.scoreUrl)
      this.measuresToReinforce = practiceTracker.analyzeMeasuresFromSession(lastSession)
    },

    startReinforcementMode() {
      this.reinforcementMode = true
      this.trainingMode = true

      // Start new training session before activating reinforcement mode
      const metadata = musicxml.getScoreMetadata()
      practiceTracker.startSession(this.scoreUrl, metadata.title, metadata.composer, 'training', metadata.totalMeasures)

      musicxml.setReinforcementMode(this.measuresToReinforce)
    },

    updateActiveHands() {
      const hands = { right: this.rightHandActive, left: this.leftHandActive }
      musicxml.setActiveHands(hands)
      strictPlaythrough.setActiveHands(hands)
    },

    async openScoreHistory() {
      if (!this.scoreUrl) return
      this.scoreHistory = await practiceTracker.getScoreHistory(this.scoreUrl)
      this.historyTotalMs = this.scoreHistory.reduce((sum, d) => sum + (d.totalPracticeTimeMs || 0), 0)
      this.historyHotMeasures = await this.computeHotMeasures()
      this.showHistoryModal = true
    },

    // Top measures with the highest error rate, surfaced inside the
    // history modal so practiced measures with persistent trouble are
    // visible without diving into the data.
    async computeHotMeasures() {
      const agg = await storage.getAggregate(this.scoreUrl)
      if (!agg || !agg.measures) return []
      const entries = Object.entries(agg.measures)
        .map(([idx, m]) => ({
          index: Number(idx),
          attempts: m.totalAttempts || 0,
          errorRate: m.errorRate || 0,
        }))
        .filter((m) => m.attempts >= 2 && m.errorRate > 0)
        .sort((a, b) => b.errorRate - a.errorRate)
      return entries.slice(0, 5)
    },

    toggleSettingsMenu() {
      this.settingsMenuOpen = !this.settingsMenuOpen
    },

    closeSettingsMenu() {
      this.settingsMenuOpen = false
    },

    formatDate,
    formatDuration,

    formatPlaythroughs(playthroughs) {
      const formatter = new Intl.ListFormat('fr', { style: 'long', type: 'conjunction' })
      // Reverse to show chronological order (oldest first)
      const durations = [...playthroughs].reverse().map((pt) => formatDuration(pt.durationMs))
      return `${playthroughs.length}× en entier (${formatter.format(durations)})`
    },

    // Builds the playthrough-duration evolution chart as an SVG string.
    // Built as a string (not <template x-for>) because Alpine's templates
    // render in HTML namespace and won't show up inside an <svg>.
    // Returns '' when there aren't enough points to plot.
    playthroughChartSvg() {
      const all = this.scoreHistory.flatMap((d) => d.fullPlaythroughs)
      if (all.length < 2) return ''

      const sorted = [...all].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))
      const durs = sorted.map((p) => p.durationMs)
      const dMin = Math.min(...durs)
      const dMax = Math.max(...durs)
      const yMin = Math.max(0, dMin - (dMax - dMin) * 0.1)
      const yMax = (dMax + (dMax - dMin) * 0.1) || dMax * 1.1

      const W = 600
      const H = 200
      const PAD = { top: 12, right: 12, bottom: 28, left: 56 }
      const innerW = W - PAD.left - PAD.right
      const innerH = H - PAD.top - PAD.bottom
      // Evenly spaced by playthrough index: gaps between dates aren't shown.
      const n = sorted.length
      const xScale = (i) =>
        PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
      const yScale = (d) =>
        PAD.top + innerH - ((d - yMin) / (yMax - yMin || 1)) * innerH

      const points = sorted.map((p, i) => ({
        x: xScale(i),
        y: yScale(p.durationMs),
        duration: formatDuration(p.durationMs),
        date: new Date(p.startedAt).toLocaleDateString('fr-FR'),
      }))
      const fmtAxis = (iso) =>
        new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

      const axisY = PAD.top + innerH
      const xMin = PAD.left
      const xMax = PAD.left + innerW

      const yLabels = [
        `<text x="${xMin - 8}" y="${yScale(yMax) + 4}" text-anchor="end" class="chart-label">${formatDuration(yMax)}</text>`,
        `<text x="${xMin - 8}" y="${yScale(yMin) + 4}" text-anchor="end" class="chart-label">${formatDuration(yMin)}</text>`,
      ].join('')
      const xLabels = [
        `<text x="${xMin}" y="${H - 8}" text-anchor="start" class="chart-label">${fmtAxis(sorted[0].startedAt)}</text>`,
        `<text x="${xMax}" y="${H - 8}" text-anchor="end" class="chart-label">${fmtAxis(sorted[n - 1].startedAt)}</text>`,
      ].join('')
      const circles = points
        .map(
          (p) =>
            `<circle cx="${p.x}" cy="${p.y}" r="4" class="chart-point"><title>${p.date} — ${p.duration}</title></circle>`,
        )
        .join('')

      return `<svg viewBox="0 0 ${W} ${H}" class="playthrough-chart" role="img" aria-label="Évolution du temps de jeu par playthrough">
        <line x1="${xMin}" x2="${xMax}" y1="${axisY}" y2="${axisY}" class="chart-axis" />
        ${yLabels}
        ${xLabels}
        ${circles}
      </svg>`
    },

    // Fingering annotation methods
    setupFingeringHandlers() {
      if (!this.fingeringEnabled) return
      fingeringEditor.setupFingeringClickHandlers({
        onNoteClick: (noteData) => this.openFingeringModal(noteData),
      })
    },

    openFingeringModal(noteData) {
      this.selectedNoteKey = noteData.fingeringKey
      this.fingeringSequence = ''
      this.showFingeringModal = true

      this.fingeringKeydownHandler = (e) => {
        if (e.key >= '1' && e.key <= '5') {
          e.preventDefault()
          this.appendFinger(parseInt(e.key, 10))
        } else if (e.key === 'Backspace') {
          e.preventDefault()
          this.fingeringSequence = this.fingeringSequence.slice(0, -1)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          this.validateFingering()
        } else if (e.key === 'Escape') {
          this.closeFingeringModal()
        }
      }
      document.addEventListener('keydown', this.fingeringKeydownHandler)
    },

    appendFinger(digit) {
      this.fingeringSequence += digit
    },

    closeFingeringModal() {
      this.showFingeringModal = false
      document.removeEventListener('keydown', this.fingeringKeydownHandler)
    },

    async validateFingering() {
      if (!this.fingeringSequence) return
      await this.selectFingering(parseInt(this.fingeringSequence, 10))
    },

    async selectFingering(finger) {
      await storage.setFingering(this.scoreUrl, this.selectedNoteKey, finger)
      this.closeFingeringModal()

      // Try to update SVG directly if fingering already exists (instant update)
      if (!fingeringEditor.updateFingeringSVG(this.selectedNoteKey, finger)) {
        // No existing SVG: inject into OSMD's data model and do a light re-render
        // (skips XML fetch/parse/load — just layout recalc + SVG redraw)
        fingeringEditor.addFingeringToDataModel(this.selectedNoteKey, finger)
        this.rerenderScore()
      }
    },

    async removeFingering() {
      await storage.removeFingering(this.scoreUrl, this.selectedNoteKey)
      this.closeFingeringModal()
      fingeringEditor.removeFingeringFromDataModel(this.selectedNoteKey)
      this.rerenderScore()
    },

    rerenderScore() {
      const scrollY = window.scrollY
      const { currentMeasureIndex } = musicxml.getTrainingState()
      const playedSourceMeasures = musicxml.getPlayedSourceMeasures()

      const noteStates = new Map()
      for (const { notes } of musicxml.getAllNotes()) {
        for (const { fingeringKey, played, active } of notes) {
          if (played || active) {
            noteStates.set(fingeringKey, { played, active })
          }
        }
      }

      musicxml.renderScore()
      this.setupFingeringHandlers()
      fingeringEditor.restoreNoteStates(noteStates)
      musicxml.setCurrentMeasureIndex(currentMeasureIndex)
      musicxml.setPlayedSourceMeasures(playedSourceMeasures)
      window.scrollTo(0, scrollY)
    },
  }
}
