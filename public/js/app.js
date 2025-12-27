import { initMidi } from './midi.js'
import { initMusicXML } from './musicxml.js'
import { initUI } from './ui.js'
import { initStaff } from './staff.js'

export function midiApp() {
  const midi = initMidi()
  const musicxml = initMusicXML()
  const ui = initUI()
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
        try {
          const response = await fetch('/api/cassettes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
          })

          if (response.ok) {
            alert(`Cassette "${result.name}" sauvegardée avec succès !`)
            await this.loadCassettesList()
          } else {
            const error = await response.json()
            alert(`Erreur: ${error.error}`)
          }
        } catch (error) {
          console.error('Erreur lors de la sauvegarde:', error)
          alert('Erreur lors de la sauvegarde de la cassette')
        }
      }
    },

    async loadCassettesList() {
      try {
        const response = await fetch('/api/cassettes')
        this.cassettes = await response.json()
      } catch (error) {
        console.error('Erreur lors du chargement des cassettes:', error)
        this.cassettes = []
      }
    },

    async replayCassette() {
      if (!this.selectedCassette) return
      this.isReplaying = true

      try {
        const response = await fetch(`/${this.selectedCassette}`)
        const cassette = await response.json()

        staff.getStaffState().notes = []
        staff.redrawStaff()

        for (let i = 0; i < cassette.data.length; i++) {
          const message = cassette.data[i]

          if (i > 0) {
            const delay = message.timestamp - cassette.data[i - 1].timestamp
            if (delay > 0) {
              await new Promise(resolve => setTimeout(resolve, delay))
            }
          }

          const uint8Array = new Uint8Array(message.data)
          const dataView = new DataView(uint8Array.buffer)
          midi.parseMidiBLE(dataView, true)
        }
      } catch (error) {
        console.error('Erreur lors du rejeu:', error)
      }

      this.isReplaying = false
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
