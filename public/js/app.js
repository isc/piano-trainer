import { initMidi } from './midi.js'
import { initMusicXML } from './musicxml.js'
import { initCassettes } from './cassettes.js'
import { initPracticeTracker } from './practiceTracker.js'

export function midiApp() {
  const midi = initMidi()
  const musicxml = initMusicXML()
  const cassettes = initCassettes()
  const practiceTracker = initPracticeTracker()

  return {
    bluetoothConnected: false,
    midiDeviceName: null,
    osmdInstance: null,
    isRecording: false,
    recordingStartTime: null,
    recordingDuration: 0,
    recordingTimer: null,
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

    async init() {
      this.loadCassettesList()

      // Initialize practice tracking
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
        onScoreCompleted: async (measureIndex) => {
          if (!this.trainingMode) {
            this.showScoreComplete()
          }
          await practiceTracker.endSession()
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
      this.recordingStartTime = Date.now()
      this.recordingDuration = 0

      this.recordingTimer = setInterval(() => {
        this.recordingDuration = Math.floor((Date.now() - this.recordingStartTime) / 1000)
      }, 1000)
    },

    async stopRecording() {
      const result = await midi.stopRecording()
      this.isRecording = false
      clearInterval(this.recordingTimer)

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
      await musicxml.loadMusicXML(event)
      await this.afterScoreLoad()
    },

    async loadScoreFromURL(url) {
      this.scoreUrl = url
      await musicxml.loadFromURL(url)
      await this.afterScoreLoad()

      // Start practice tracking session in free mode
      const metadata = musicxml.getScoreMetadata()
      practiceTracker.startSession(url, metadata.title, metadata.composer, 'free')
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

      // Restart session with new mode
      await practiceTracker.endSession()
      const metadata = musicxml.getScoreMetadata()
      const mode = this.trainingMode ? 'training' : 'free'
      practiceTracker.startSession(this.scoreUrl, metadata.title, metadata.composer, mode)

      if (this.trainingMode) {
        musicxml.setTrainingMode(true)
        this.trainingComplete = false
      } else {
        musicxml.setTrainingMode(false)
        musicxml.resetProgress()
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
  }
}
