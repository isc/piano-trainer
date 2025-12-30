import { initMidi } from './midi.js'
import { initMusicXML } from './musicxml.js'
import { initCassettes } from './cassettes.js'
import { initStaff } from './staff.js'

export function midiApp() {
  const midi = initMidi()
  const musicxml = initMusicXML()
  const cassettes = initCassettes()
  const staff = initStaff()

  return {
    bluetoothConnected: false,
    device: null,
    osmdInstance: null,
    allNotes: [],
    isRecording: false,
    recordingStartTime: null,
    recordingDuration: 0,
    recordingTimer: null,
    isReplaying: false,
    cassettes: [],
    selectedCassette: '',
    trainingMode: false,
    targetRepeatCount: 3,
    repeatCount: 0,

    // UI states
    scoreTitle: null,
    scoreComposer: null,
    scoreProgress: null,
    extractionStatus: null,
    errorMessage: null,
    trainingComplete: false,
    showScoreCompleteModal: false,

    init() {
      staff.initStaff()
      this.loadCassettesList()

      midi.setCallbacks({
        onNotePlayed: (noteName, midiNote) => {
          staff.addNoteToStaff(noteName)
          musicxml.validatePlayedNote(midiNote)
        },
      })

      musicxml.setCallbacks({
        onNotesExtracted: (notes, metadata) => {
          console.log('onNotesExtracted called with notes:', notes.length)
          this.allNotes = notes
          this.scoreTitle = metadata?.title || undefined
          this.scoreComposer = metadata?.composer || undefined
          const totalNotes = notes.reduce((acc, m) => acc + m.notes.length, 0)
          this.extractionStatus = `✅ Extraction terminée: ${notes.length} mesures, ${totalNotes} notes`
          this.scoreProgress = `Mesure: 1/${notes.length} | Progression: 0/${totalNotes} (0%)`
          console.log('States updated:', this.extractionStatus)
        },
        onMeasureCompleted: (measureIndex) => {
          if (!this.trainingMode && measureIndex >= this.allNotes.length - 1) {
            this.showScoreComplete()
          } else {
            this.updateScoreProgress()
          }
        },
        onNoteError: (expected, played) => {
          this.errorMessage = `❌ Erreur: attendu ${expected}, joué ${played}`
          setTimeout(() => {
            this.errorMessage = ''
          }, 2000)
        },
        onTrainingProgress: (measureIndex, repeatCount, targetRepeatCount) => {
          this.updateTrainingDisplay(
            measureIndex,
            repeatCount,
            targetRepeatCount
          )
        },
        onTrainingComplete: () => {
          this.showTrainingComplete()
        },
      })

      cassettes.setCallbacks({
        onReplayStart: () => {
          this.isReplaying = true
        },
        onReplayEnd: () => {
          this.isReplaying = false
        },
      })

      window.addEventListener('beforeunload', () => {
        if (this.device) this.device.gatt.disconnect()
      })
    },

    updateScoreProgress() {
      const total = this.allNotes.reduce((acc, m) => acc + m.notes.length, 0)
      const completed = this.allNotes.reduce(
        (acc, m) => acc + m.notes.filter((n) => n.played).length,
        0
      )
      const currentMeasure =
        this.allNotes.find((m) => m.notes.some((n) => !n.played))
          ?.measureIndex || this.allNotes.length - 1
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

      if (completed >= total) {
        this.scoreProgress = `🎉 Partition terminée ! (${total}/${total} notes - 100%)`
      } else {
        this.scoreProgress = `Mesure: ${currentMeasure + 1}/${this.allNotes.length} | Progression: ${completed}/${total} (${percentage}%)`
      }
    },

    async scanBluetooth() {
      await midi.connectBluetooth()
      this.bluetoothConnected = midi.state.bluetoothConnected
    },

    startRecording() {
      midi.startRecording()
      this.isRecording = true
      this.recordingStartTime = Date.now()
      this.recordingDuration = 0

      this.recordingTimer = setInterval(() => {
        this.recordingDuration = Math.floor(
          (Date.now() - this.recordingStartTime) / 1000
        )
      }, 1000)
    },

    async stopRecording() {
      const result = await midi.stopRecording()
      this.isRecording = false
      clearInterval(this.recordingTimer)

      if (result) {
        const saveResult = await cassettes.saveCassette(
          result.name,
          result.data
        )

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
      await cassettes.replayCassette(
        this.selectedCassette,
        midi.parseMidiBLE,
        staff
      )
    },

    async loadMusicXML(event) {
      // Load the MusicXML file (this will trigger callbacks that set the state)
      await musicxml.loadMusicXML(event)
      this.osmdInstance = musicxml.getOsmdInstance()
      this.allNotes = musicxml.getNotesByMeasure()

      // Activer le wake lock pour empêcher la mise en veille
      if ('wakeLock' in navigator) {
        try {
          await navigator.wakeLock.request('screen')
        } catch (err) {
          console.warn('Wake lock non disponible:', err)
        }
      }
    },

    clearScore() {
      musicxml.clearScore()
      this.osmdInstance = null
      this.allNotes = []
      this.trainingMode = false
      this.scoreTitle = null
      this.scoreComposer = null
      this.scoreProgress = null
      this.extractionStatus = null
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
        this.updateTrainingDisplay(
          state.currentMeasureIndex,
          state.repeatCount,
          state.targetRepeatCount
        )
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
