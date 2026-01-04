import { initMidi } from './midi.js'
import { initMusicXML } from './musicxml.js'
import { initCassettes } from './cassettes.js'

export function midiApp() {
  const midi = initMidi()
  const musicxml = initMusicXML()
  const cassettes = initCassettes()

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
    targetRepeatCount: 3,
    repeatCount: 0,

    // UI states
    errorMessage: null,
    trainingComplete: false,
    showScoreCompleteModal: false,

    async init() {
      this.loadCassettesList()

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
        onScoreCompleted: (measureIndex) => {
          if (!this.trainingMode) {
            this.showScoreComplete()
          }
        },
        onNoteError: (expected, played) => {
          this.errorMessage = `❌ Erreur: attendu ${expected}, joué ${played}`
          setTimeout(() => {
            this.errorMessage = ''
          }, 2000)
        },
        onTrainingProgress: (measureIndex, repeatCount, targetRepeatCount) => {
          this.updateTrainingDisplay(measureIndex, repeatCount, targetRepeatCount)
        },
        onTrainingComplete: () => {
          this.showTrainingComplete()
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
      await musicxml.loadFromURL(url)
      await this.afterScoreLoad()
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
        elem.requestFullscreen().catch(err => {
          console.warn('Fullscreen non disponible:', err)
        })
      }
    },

    clearScore() {
      musicxml.clearScore()
      this.osmdInstance = null
      this.trainingMode = false
      this.errorMessage = null
      const trainingInfo = document.getElementById('training-info')
      if (trainingInfo) trainingInfo.remove()
    },

    toggleTrainingMode() {
      this.trainingMode = !this.trainingMode

      if (this.trainingMode) {
        musicxml.setTrainingMode(true)
        this.trainingComplete = false
        this.repeatCount = 0
        const state = musicxml.getTrainingState()
        this.updateTrainingDisplay(state.currentMeasureIndex, state.repeatCount, state.targetRepeatCount)
      } else {
        musicxml.setTrainingMode(false)
        musicxml.resetProgress()
        this.trainingComplete = false
        this.repeatCount = 0
      }
    },

    updateTrainingDisplay(measureIndex, repeatCount, targetRepeatCount) {
      this.repeatCount = repeatCount
      musicxml.updateRepeatIndicators()
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
  }
}
