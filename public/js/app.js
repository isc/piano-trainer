import { initMidi } from './midi.js'
import { initMusicXML } from './musicxml.js'
import { initCassettes } from './cassettes.js'
import { initPracticeTracker } from './practiceTracker.js'
import { formatDuration, formatDate } from './utils.js'
import { initStorage } from './storage.js'
import { loadMxlAsXml } from './mxlLoader.js'
import { injectFingerings } from './fingeringInjector.js'

export function midiApp() {
  const midi = initMidi()
  const musicxml = initMusicXML()
  const cassettes = initCassettes()
  const storage = initStorage()
  const practiceTracker = initPracticeTracker(storage)

  return {
    bluetoothConnected: false,
    midiDeviceName: null,
    osmdInstance: null,
    isRecording: false,
    isReplaying: false,
    replayEnded: false,
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

    // Fingering annotation
    fingeringEnabled: false,
    showFingeringModal: false,
    selectedNoteKey: null,

    async init() {
      await this.loadCassettesList()

      await storage.init()
      await practiceTracker.init()

      // Auto-connect to MIDI device silently
      await midi.connectMIDI({ silent: true, autoSelectFirst: true })
      this.syncMidiState()

      midi.setCallbacks({
        onNotePlayed: (noteName, midiNote) => {
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

          if (!this.trainingMode) {
            const allPlaythroughs = this.scoreUrl ? await practiceTracker.getAllPlaythroughs(this.scoreUrl) : []
            this.showScoreComplete(allPlaythroughs)
          }

          // Start new session for next playthrough
          const metadata = musicxml.getScoreMetadata()
          practiceTracker.startSession(this.scoreUrl, metadata.title, metadata.composer, 'free', metadata.totalMeasures)
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
      await midi.connectMIDI()
      this.syncMidiState()
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

    requestFullscreen() {
      const elem = document.documentElement
      if (elem.requestFullscreen) {
        elem.requestFullscreen().catch((err) => {
          console.warn('Fullscreen non disponible:', err)
        })
      }
    },

    async toggleTrainingMode() {
      this.trainingMode = !this.trainingMode

      const mode = this.trainingMode ? 'training' : 'free'
      await practiceTracker.toggleMode(mode)

      if (this.trainingMode) {
        musicxml.setTrainingMode(true)
        this.trainingComplete = false
      } else {
        musicxml.setTrainingMode(false)
        this.trainingComplete = false
      }
    },

    showTrainingComplete() {
      this.trainingComplete = true
    },

    showScoreComplete(allPlaythroughs) {
      // Find the most recent playthrough (the one just completed)
      const mostRecent = allPlaythroughs.reduce(
        (latest, pt) => (!latest || new Date(pt.startedAt) > new Date(latest.startedAt) ? pt : latest),
        null
      )

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

    // Fingering annotation methods
    setupFingeringHandlers() {
      if (!this.fingeringEnabled) return
      musicxml.setupFingeringClickHandlers({
        onNoteClick: (noteData) => this.openFingeringModal(noteData),
      })
    },

    fingeringKeydownHandler: null,

    openFingeringModal(noteData) {
      this.selectedNoteKey = noteData.fingeringKey
      this.showFingeringModal = true

      this.fingeringKeydownHandler = (e) => {
        if (e.key >= '1' && e.key <= '5') {
          e.preventDefault()
          this.selectFingering(parseInt(e.key, 10))
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault()
          this.removeFingering()
        } else if (e.key === 'Escape') {
          this.closeFingeringModal()
        }
      }
      document.addEventListener('keydown', this.fingeringKeydownHandler)
    },

    closeFingeringModal() {
      this.showFingeringModal = false
      document.removeEventListener('keydown', this.fingeringKeydownHandler)
    },

    async selectFingering(finger) {
      await storage.setFingering(this.scoreUrl, this.selectedNoteKey, finger)
      this.closeFingeringModal()
      await this.reloadWithFingerings()
    },

    async removeFingering() {
      await storage.removeFingering(this.scoreUrl, this.selectedNoteKey)
      this.closeFingeringModal()
      await this.reloadWithFingerings()
    },

    async reloadWithFingerings() {
      const scrollY = window.scrollY

      const noteStates = new Map()
      for (const { notes } of musicxml.getAllNotes()) {
        for (const { fingeringKey, played, active } of notes) {
          if (played || active) {
            noteStates.set(fingeringKey, { played, active })
          }
        }
      }

      await this.renderScoreWithFingerings()
      musicxml.restoreNoteStates(noteStates)
      window.scrollTo(0, scrollY)
    },
  }
}
