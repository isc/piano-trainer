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
    currentNoteIndex: 0,
    allNotes: [],
    isRecording: false,
    recordingData: [],
    recordingStartTime: null,
    recordingDuration: 0,
    recordingTimer: null,
    isReplaying: false,
    cassettes: [],
    selectedCassette: '',

    init() {
      staff.initStaff()
      this.loadCassettesList()

      midi.setCallbacks({
        onNotePlayed: (noteName, midiNote) => {
          staff.addNoteToStaff(noteName)
          musicxml.validatePlayedNote(midiNote)
        }
      })

      musicxml.setCallbacks({
        onNotesExtracted: notes => {
          this.allNotes = notes
          console.log(`Extracted ${notes.length} notes from score`)
        }
      })

      cassettes.setCallbacks({
        onReplayStart: () => {
          this.isReplaying = true
        },
        onReplayEnd: () => {
          this.isReplaying = false
        }
      })

      window.addEventListener('beforeunload', () => {
        if (this.device) this.device.gatt.disconnect()
      })
    },

    async scanBluetooth() {
      await midi.connectBluetooth()
      this.bluetoothConnected = midi.state.bluetoothConnected
    },

    startRecording() {
      midi.startRecording()
      this.isRecording = true
      this.recordingData = []
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
      await cassettes.replayCassette(this.selectedCassette, midi.parseMidiBLE, staff)
    },

    async loadMusicXML(event) {
      await musicxml.loadMusicXML(event)
      this.osmdInstance = musicxml.getOsmdInstance()
      this.allNotes = musicxml.getAllNotes()
      this.currentNoteIndex = musicxml.getCurrentNoteIndex()
    },

    clearScore() {
      musicxml.clearScore()
      this.osmdInstance = null
      this.allNotes = []
      this.currentNoteIndex = 0
    }
  }
}
