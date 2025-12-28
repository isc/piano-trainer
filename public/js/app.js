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
    recordingData: [],
    recordingStartTime: null,
    recordingDuration: 0,
    recordingTimer: null,
    isReplaying: false,
    cassettes: [],
    selectedCassette: '',
    trainingMode: false,
    targetRepeatCount: 3,

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
          console.log(`Extracted ${notes.length} measures from score`)
        },
        onMeasureCompleted: (measureIndex) => {
          if (!this.trainingMode && measureIndex >= this.allNotes.length - 1) {
            this.showScoreComplete()
          }
        },
        onTrainingProgress: (measureIndex, repeatCount, targetRepeatCount) => {
          this.updateTrainingDisplay(measureIndex, repeatCount, targetRepeatCount)
        },
        onTrainingComplete: () => {
          this.showTrainingComplete()
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
      this.allNotes = musicxml.getNotesByMeasure()
    },

    clearScore() {
      musicxml.clearScore()
      this.osmdInstance = null
      this.allNotes = []
      this.trainingMode = false
      const trainingInfo = document.getElementById('training-info')
      if (trainingInfo) trainingInfo.remove()
    },

    toggleTrainingMode() {
      this.trainingMode = !this.trainingMode
      
      if (this.trainingMode) {
        musicxml.setTrainingMode(true)
        const state = musicxml.getTrainingState()
        this.updateTrainingDisplay(state.currentMeasureIndex, state.repeatCount, state.targetRepeatCount)
      } else {
        musicxml.setTrainingMode(false)
        musicxml.resetProgress()
        const trainingInfo = document.getElementById('training-info')
        if (trainingInfo) trainingInfo.remove()
      }
    },

    updateTrainingDisplay(measureIndex, repeatCount, targetRepeatCount) {
      let trainingInfo = document.getElementById('training-info')
      if (!trainingInfo) {
        trainingInfo = document.createElement('div')
        trainingInfo.id = 'training-info'
        trainingInfo.style.cssText = 'margin: 10px 0; padding: 15px; background: #dbeafe; border-radius: 5px; color: #1e40af;'
        
        const scoreContainer = document.getElementById('score')
        scoreContainer.insertBefore(trainingInfo, scoreContainer.firstChild)
      }
      
      const measureNum = measureIndex + 1
      const totalMeasures = this.allNotes.length
      const progress = Math.round((repeatCount / targetRepeatCount) * 100)
      
      trainingInfo.innerHTML = `
        <strong>🔄 Mode Entraînement</strong><br>
        <small>Mesure: ${measureNum}/${totalMeasures} | Répétition: ${repeatCount}/${targetRepeatCount}</small>
        <div style="margin-top: 5px; background: #93c5fd; height: 10px; border-radius: 5px; overflow: hidden;">
          <div style="background: #3b82f6; height: 100%; width: ${progress}%; transition: width 0.3s;"></div>
        </div>
      `
    },

    showTrainingComplete() {
      const trainingInfo = document.getElementById('training-info')
      if (trainingInfo) {
        trainingInfo.innerHTML = `
          <strong>🎉 Félicitations !</strong><br>
          <small>Vous avez complété toutes les mesures du morceau !</small>
          <br><br>
          <button onclick="document.querySelector('[x-data]').__x.$data.toggleTrainingMode()">Quitter le mode entraînement</button>
        `
        trainingInfo.style.background = '#dcfce7'
        trainingInfo.style.color = '#166534'
      }
    },

    showScoreComplete() {
      const scoreContainer = document.getElementById('score')
      const congratsDiv = document.createElement('div')
      congratsDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #22c55e;
        color: white;
        padding: 20px 40px;
        border-radius: 10px;
        font-size: 18px;
        font-weight: bold;
        z-index: 1000;
        text-align: center;
      `
      congratsDiv.innerHTML = '🎉 Félicitations !<br>Partition terminée !'

      document.body.appendChild(congratsDiv)

      setTimeout(() => {
        document.body.removeChild(congratsDiv)
      }, 3000)
    }
  }
}
