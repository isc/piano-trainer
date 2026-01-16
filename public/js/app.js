import { initMidi } from './midi.js'
import { initMusicXML } from './musicxml.js'
import { initCassettes } from './cassettes.js'
import { initPracticeTracker } from './practiceTracker.js'
import { formatDuration, formatDate } from './utils.js'
import { initFingeringStorage } from './fingeringStorage.js'
import { loadMxlAsXml } from './mxlLoader.js'
import { injectFingerings } from './fingeringInjector.js'

export function midiApp() {
  const midi = initMidi()
  const musicxml = initMusicXML()
  const cassettes = initCassettes()
  const practiceTracker = initPracticeTracker()
  const fingeringStorage = initFingeringStorage()

  return {
    bluetoothConnected: false,
    midiDeviceName: null,
    osmdInstance: null,
    isRecording: false,
    isReplaying: false,
    replayEnded: false,
    cassettes: [],
    selectedCassette: '',
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
    showHistoryModal: false,
    scoreHistory: [],

    // Fingering annotation
    fingeringEnabled: false,
    showFingeringModal: false,
    selectedNoteKey: null,
    selectedNoteName: '',

    async init() {
      this.loadCassettesList()

      await practiceTracker.init()
      await fingeringStorage.init()

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
        onScoreCompleted: async (measureIndex) => {
          if (!this.trainingMode) {
            this.showScoreComplete()
          }
          await practiceTracker.endSession()
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
      this.cassettes = await cassettes.loadCassettesList()
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

      const stored = await fingeringStorage.getFingerings(url)
      const hasFingerings = Object.keys(stored?.fingerings || {}).length > 0

      if (hasFingerings) {
        const xml = await loadMxlAsXml(url)
        const modified = injectFingerings(xml, stored.fingerings)
        await musicxml.renderMusicXML(modified)
      } else {
        await musicxml.loadFromURL(url)
      }

      await this.afterScoreLoad()
      this.setupFingeringHandlers()

      // Start practice tracking session in free mode
      const metadata = musicxml.getScoreMetadata()
      practiceTracker.startSession(url, metadata.title, metadata.composer, 'free', metadata.totalMeasures)
    },

    async afterScoreLoad() {
      this.osmdInstance = musicxml.getOsmdInstance()
      // Wait for Alpine to update DOM (show #score container), then render
      await this.$nextTick()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      musicxml.renderScore()
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

    showScoreComplete() {
      this.showScoreCompleteModal = true
      setTimeout(() => {
        this.showScoreCompleteModal = false
      }, 3000)
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

    // Fingering annotation methods
    setupFingeringHandlers() {
      if (!this.fingeringEnabled) return
      musicxml.setupFingeringClickHandlers({
        onNoteClick: (noteData) => this.openFingeringModal(noteData),
        onFingeringClick: (noteData) => this.openFingeringModal(noteData),
      })
    },

    fingeringKeydownHandler: null,

    openFingeringModal(noteData) {
      this.selectedNoteKey = noteData.fingeringKey
      this.selectedNoteName = noteData.noteName
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
      await fingeringStorage.setFingering(this.scoreUrl, this.selectedNoteKey, finger)
      this.closeFingeringModal()
      await this.reloadWithFingerings()
    },

    async removeFingering() {
      await fingeringStorage.removeFingering(this.scoreUrl, this.selectedNoteKey)
      this.closeFingeringModal()
      await this.reloadWithFingerings()
    },

    async reloadWithFingerings() {
      const scrollY = window.scrollY

      const noteStates = new Map()
      for (const measureData of musicxml.getAllNotes()) {
        for (const noteData of measureData.notes) {
          if (noteData.played || noteData.active) {
            noteStates.set(noteData.fingeringKey, {
              played: noteData.played,
              active: noteData.active,
            })
          }
        }
      }

      const stored = await fingeringStorage.getFingerings(this.scoreUrl)
      const xml = await loadMxlAsXml(this.scoreUrl)
      const modified = injectFingerings(xml, stored?.fingerings || {})
      await musicxml.renderMusicXML(modified)
      await this.afterScoreLoad()
      this.setupFingeringHandlers()
      musicxml.restoreNoteStates(noteStates)

      window.scrollTo(0, scrollY)
    },
  }
}
