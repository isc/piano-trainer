import { initMidi } from './midi.js'
import { initMusicXML } from './musicxml.js'
import { initFingeringEditor } from './fingeringEditor.js'
import { initCassettes } from './cassettes.js'
import { initPracticeTracker } from './practiceTracker.js'
import { formatDuration, formatDate } from './utils.js'
import { initStorage } from './storage.js'
import { loadMxlAsXml } from './mxlLoader.js'
import { injectFingerings } from './fingeringInjector.js'
import { initPlayback } from './playback.js'

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

  return {
    bluetoothConnected: false,
    midiDeviceName: null,
    osmdInstance: null,
    isRecording: false,
    isReplaying: false,
    replayEnded: false,
    isPlaying: false,
    cassettes: [],
    selectedCassette: '',
    cassetteApiAvailable: false,
    trainingMode: false,

    // Practice tracking (only for scores loaded via URL, not uploads)
    scoreUrl: null,

    // Hand selection (both active by default)
    rightHandActive: true,
    leftHandActive: true,

    // UI states
    errorMessage: null,
    trainingComplete: false,
    showScoreCompleteModal: false,
    currentPlaythroughDuration: null,
    previousPlaythroughs: [],
    showHistoryModal: false,
    scoreHistory: [],
    measuresToReinforce: [],
    reinforcementMode: false,
    showReinforcementCompleteModal: false,
    showMidiHelpModal: false,

    // Fingering annotation
    fingeringEnabled: false,
    showFingeringModal: false,
    selectedNoteKey: null,
    fingeringSequence: '',
    fingeringKeydownHandler: null,

    async init() {
      playback.setOnPlaybackEnd(() => { this.isPlaying = false })

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
          musicxml.activateNote(midiNote)
        },
        onNoteReleased: (noteName, midiNote) => {
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
          this.errorMessage = `❌ Erreur: attendu ${expected}, joué ${played}`
          setTimeout(() => {
            this.errorMessage = ''
          }, 2000)
        },
        onTrainingComplete: async () => {
          this.showTrainingComplete()
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
          this.showReinforcementCompleteModal = true

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
    },

    async loadScoreFromURL(url) {
      this.scoreUrl = url
      this.fingeringEnabled = true

      await this.renderScoreWithFingerings()

      const metadata = musicxml.getScoreMetadata()
      practiceTracker.startSession(url, metadata.title, metadata.composer, 'free', metadata.totalMeasures)

      // Load reinforcement suggestions from last completed playthrough
      await this.refreshReinforcementSuggestions()
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
      await playback.togglePlayback(musicxml.getAllNotes(), musicxml.getOsmdInstance())
      this.isPlaying = playback.isPlaying
    },

    async toggleTrainingMode() {
      this.trainingMode = !this.trainingMode
      this.trainingComplete = false

      const mode = this.trainingMode ? 'training' : 'free'
      await practiceTracker.toggleMode(mode)
      musicxml.setTrainingMode(this.trainingMode)
    },

    showTrainingComplete() {
      this.trainingComplete = true
    },

    showScoreComplete(allPlaythroughs) {
      // Find the most recent playthrough (the one just completed)
      const sorted = [...allPlaythroughs].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      const mostRecent = sorted[0] || null

      this.currentPlaythroughDuration = mostRecent?.durationMs || null

      // Sort all playthroughs by duration (fastest first), marking the current one
      this.previousPlaythroughs = allPlaythroughs
        .map((pt) => ({ ...pt, isCurrent: pt === mostRecent }))
        .sort((a, b) => a.durationMs - b.durationMs)

      this.showScoreCompleteModal = true
    },

    closeScoreCompleteModal() {
      this.showScoreCompleteModal = false
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
      musicxml.setActiveHands({
        right: this.rightHandActive,
        left: this.leftHandActive,
      })
    },

    async openScoreHistory() {
      if (!this.scoreUrl) return
      this.scoreHistory = await practiceTracker.getScoreHistory(this.scoreUrl)
      this.showHistoryModal = true
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
