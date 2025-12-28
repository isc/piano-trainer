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
        trainingInfo.setAttribute('aria-live', 'polite')
        
        const scoreContainer = document.getElementById('score')
        scoreContainer.insertBefore(trainingInfo, scoreContainer.firstChild)
      }
      
      const measureNum = measureIndex + 1
      const totalMeasures = this.allNotes.length
      const progress = Math.round((repeatCount / targetRepeatCount) * 100)
      
      trainingInfo.ariaValueNow = progress
      trainingInfo.innerHTML = `
        <article>
          <header>
            <strong>🔄 Mode Entraînement</strong>
          </header>
          <p>Mesure: ${measureNum}/${totalMeasures} | Répétition: ${repeatCount}/${targetRepeatCount}</p>
          <progress value="${repeatCount}" max="${targetRepeatCount}"></progress>
        </article>
      `
    },

    showTrainingComplete() {
      const trainingInfo = document.getElementById('training-info')
      if (trainingInfo) {
        trainingInfo.innerHTML = `
          <article class="success">
            <header>
              <strong>🎉 Félicitations !</strong>
            </header>
            <p>Vous avez complété toutes les mesures du morceau !</p>
            <button onclick="document.querySelector('[x-data]').__x.$data.toggleTrainingMode()">Quitter le mode entraînement</button>
          </article>
        `
      }
    },

    showScoreComplete() {
      const congratsDiv = document.createElement('article')
      congratsDiv.className = 'success'
      congratsDiv.innerHTML = '<strong>🎉 Félicitations !</strong><br>Partition terminée !'

      const modal = document.createElement('dialog')
      modal.appendChild(congratsDiv)
      document.body.appendChild(modal)
      modal.showModal()

      setTimeout(() => {
        modal.close()
        document.body.removeChild(modal)
      }, 3000)
    }
  }
}
