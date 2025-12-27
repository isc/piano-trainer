import {
  initMidi,
  NOTE_ON,
  NOTE_OFF,
  MIDI_BLE_UUID,
  NOTE_NAMES
} from './midi.js'
import { initMusicXML, NOTE_NAMES as MUSICXML_NOTE_NAMES } from './musicxml.js'
import { initUI } from './ui.js'
import { initStaff } from './staff.js'

const midi = initMidi()
const musicxml = initMusicXML()
const ui = initUI()
const staff = initStaff()

midi.setCallbacks({
  onNotePlayed: (noteName, midiNote) => {
    staff.addNoteToStaff(noteName)
    musicxml.validatePlayedNote(midiNote)
  }
})

musicxml.setCallbacks({
  onNotesExtracted: notes => {
    console.log(`Extracted ${notes.length} notes from score`)
  }
})

export function midiApp() {
  return {
    bluetoothConnected: false,
    device: null,
    staff: null,
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
      this.initStaff()
      this.loadCassettesList()

      window.addEventListener('beforeunload', () => {
        if (this.device) this.device.gatt.disconnect()
      })
    },

    initStaff() {
      staff.initStaff()
    },

    async loadCassettesList() {
      const response = await fetch('/api/cassettes')
      this.cassettes = await response.json()
    },

    async replayCassette() {
      if (!this.selectedCassette) return
      this.isReplaying = true

      try {
        const response = await fetch(`/${this.selectedCassette}`)
        const cassette = await response.json()

        this.staff.notes = []
        staff.redrawStaff()

        // Play back each message with proper timing
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

    // Connect Bluetooth MIDI
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
      if (result) {
        // Save to server
        const response = await fetch('/api/cassettes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result)
        })

        if (response.ok) {
          alert(`Cassette "${result.name}" sauvegardée avec succès !`)
          this.loadCassettesList()
        }
      }
      this.isRecording = false
    },

    async loadMusicXML(event) {
      await musicxml.loadMusicXML(event)
      this.osmdInstance = musicxml.osmdInstance
    },

    clearScore() {
      musicxml.clearScore()
      this.osmdInstance = null
    }
  }
}

const NOTE_ON = 144
const NOTE_OFF = 128
const MIDI_BLE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700'
const NOTE_NAMES = 'C C# D D# E F F# G G# A A# B'.split(' ')

export { NOTE_ON, NOTE_OFF, MIDI_BLE_UUID, NOTE_NAMES }
