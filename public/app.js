function midiApp() {
  return {
    bluetoothConnected: false,
    device: null,
    staff: null,
    // Partition MusicXML
    hasScore: false,
    osmdInstance: null,
    currentNoteIndex: 0,
    allNotes: [],
    // Enregistrement
    isRecording: false,
    recordingData: [],
    recordingStartTime: null,
    recordingDuration: 0,
    recordingTimer: null,
    // Rejeu
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
      const div = document.getElementById('staff')
      div.innerHTML = '' // Clear previous staff
      const renderer = new VexFlow.Renderer(div, VexFlow.Renderer.Backends.SVG)
      renderer.resize(600, 200)
      const context = renderer.getContext()

      this.staff = {
        renderer,
        context,
        stave: new VexFlow.Stave(10, 40, 580),
        notes: []
      }

      this.staff.stave.addClef('treble').addTimeSignature('4/4')
      this.staff.stave.setContext(context).draw()
    },
    addNoteToStaff(noteName) {
      // Convert note name (like "C3") to VexFlow format
      const vexNote = this.convertToVexFlowNote(noteName)
      this.staff.notes.push(vexNote)

      // Keep only last 8 notes to fit on staff
      if (this.staff.notes.length > 8) this.staff.notes.shift()

      this.redrawStaff()
    },
    convertToVexFlowNote(noteName) {
      // Convert "C#4" to VexFlow format
      const isSharp = noteName.includes('#')
      let note = noteName.replace('#', '').slice(0, -1).toLowerCase() // Remove # and get note letter
      const octave = parseInt(noteName.slice(-1))

      console.log(
        `Converting ${noteName} to ${note}/${octave} ${
          isSharp ? 'with sharp' : ''
        }`
      )
      return {
        keys: [`${note}/${octave}`],
        accidental: isSharp ? '#' : null
      }
    },
    redrawStaff() {
      console.log('Redrawing staff...')
      const savedNotes = [...this.staff.notes]
      console.log('Saved notes before redraw:', savedNotes)

      if (savedNotes.length > 0) {
        console.log('Drawing notes on staff:', savedNotes)
        try {
          this.drawNotesWithVexFlow5(savedNotes)
        } catch (error) {
          console.error('Error drawing notes:', error)
        }
      } else {
        console.log('No notes to draw')
      }
    },

    drawNotesWithVexFlow5(savedNotes) {
      try {
        this.initStaff()

        const vfNotes = savedNotes.map(noteData => {
          const note = new VexFlow.StaveNote({
            clef: 'treble',
            keys: noteData.keys,
            duration: 'q'
          })

          if (noteData.accidental)
            note.addModifier(new VexFlow.Accidental(noteData.accidental), 0)

          return note
        })

        if (vfNotes.length > 0) {
          const voice = new VexFlow.Voice({ num_beats: 4, beat_value: 4 })

          voice.setStrict(false)

          vfNotes.forEach(note => {
            note.setStave(this.staff.stave)
            voice.addTickable(note)
          })

          const formatter = new VexFlow.Formatter()
          formatter.joinVoices([voice])
          formatter.formatToStave([voice], this.staff.stave)

          voice.draw(this.staff.context, this.staff.stave)

          console.log(`${vfNotes.length} notes affichées`)
        }

        // Restaurer les notes dans l'état
        this.staff.notes = savedNotes
      } catch (error) {
        console.error('VexFlow 5.0 drawing error:', error)
        // Fallback : juste sauvegarder les notes sans les afficher
        this.staff.notes = savedNotes
      }
    },

    async loadMusicXML(event) {
      const file = event.target.files[0]
      if (!file) return

      try {
        const xmlContent = await file.text()
        console.log('MusicXML chargé:', file.name)

        if (
          !xmlContent.includes('score-partwise') &&
          !xmlContent.includes('score-timewise')
        ) {
          alert('Ce fichier ne semble pas être un fichier MusicXML valide')
          return
        }

        this.hasScore = true

        await this.renderMusicXML(xmlContent)
      } catch (error) {
        console.error('Erreur lors du chargement du MusicXML:', error)
        alert('Erreur lors du chargement du fichier MusicXML')
      }
    },

    async renderMusicXML(xmlContent) {
      try {
        const scoreContainer = document.getElementById('score')

        const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(
          scoreContainer
        )

        await osmd.load(xmlContent)
        osmd.render()
        this.osmdInstance = osmd
        window.osmdInstance = osmd
        this.extractNotesFromScore()
        this.highlightNextNote()
        this.addPlaybackControls(osmd)
      } catch (error) {
        console.error('Erreur lors du rendu MusicXML avec OSMD:', error)
      }
    },

    addPlaybackControls(osmd) {
      const scoreContainer = document.getElementById('score')

      // Ajouter des contrôles de base
      const controlsDiv = document.createElement('div')
      controlsDiv.style.cssText =
        'margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;'

      const info = document.createElement('div')
      info.innerHTML = `
        <strong>Partition chargée avec succès !</strong><br>
        <small>Titre: ${JSON.stringify(osmd.Sheet?.Title) || 'Non spécifié'} |
        Compositeur: ${osmd.Sheet?.Composer || 'Non spécifié'}</small>
      `
      controlsDiv.appendChild(info)

      // Ajouter un bouton pour réinitialiser les couleurs
      const resetColorsBtn = document.createElement('button')
      resetColorsBtn.textContent = '🎨 Réinitialiser'
      resetColorsBtn.style.cssText =
        'margin-left: 10px; padding: 5px 10px; font-size: 12px;'
      resetColorsBtn.onclick = () => this.resetProgress()
      controlsDiv.appendChild(resetColorsBtn)

      // Ajouter un indicateur de progression
      const progressDiv = document.createElement('div')
      progressDiv.id = 'score-progress'
      progressDiv.style.cssText = 'margin-top: 10px; font-weight: bold;'
      this.updateProgressDisplay()
      controlsDiv.appendChild(progressDiv)

      // Ajouter un indicateur pour les tests
      const statusDiv = document.createElement('div')
      statusDiv.id = 'extraction-status'
      statusDiv.style.cssText =
        'margin-top: 10px; padding: 5px; background: #e8f5e8; border-radius: 3px; color: #2d5a2d;'
      statusDiv.textContent = `✅ Extraction terminée: ${this.allNotes.length} notes trouvées`
      controlsDiv.appendChild(statusDiv)

      document.body.appendChild(controlsDiv)
    },

    resetProgress() {
      if (!this.osmdInstance || !this.hasScore) {
        console.log('Pas de partition pour réinitialiser la progression')
        return
      }

      try {
        this.currentNoteIndex = 0

        for (const noteData of this.allNotes) {
          noteData.note.NoteheadColor = '#000000'
          noteData.note.StemColor = '#000000'
        }

        this.highlightNextNote()
        this.updateProgressDisplay()
        console.log('Progression réinitialisée')
      } catch (error) {
        console.error(
          'Erreur lors de la réinitialisation de la progression:',
          error
        )
      }
    },

    clearScore() {
      this.hasScore = false
      this.osmdInstance = null
      this.currentNoteIndex = 0
      this.allNotes = []
      const scoreContainer = document.getElementById('score')
      scoreContainer.innerHTML = ''
      document.getElementById('musicxml-upload').value = ''
    },

    extractNotesFromScore() {
      this.allNotes = []
      this.extractFromSourceMeasures(this.osmdInstance.Sheet.SourceMeasures)
      this.allNotes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    },

    extractFromSourceMeasures(sourceMeasures) {
      sourceMeasures.forEach((measure, measureIndex) => {
        measure.verticalSourceStaffEntryContainers.forEach(container =>
          this.extractNotesFromContainer(container, measureIndex)
        )
      })
    },

    extractNotesFromContainer(container, measureIndex) {
      if (container.staffEntries) {
        for (const staffEntry of container.staffEntries) {
          if (!staffEntry?.voiceEntries) continue
          for (const voiceEntry of staffEntry.voiceEntries) {
            this.extractNotesFromVoiceEntry(
              voiceEntry,
              measureIndex,
              staffEntry.timestamp || 0
            )
          }
        }
      }
    },

    extractNotesFromVoiceEntry(voiceEntry, measureIndex, baseTimestamp) {
      if (!voiceEntry.notes) return
      for (const note of voiceEntry.notes) {
        if (!note.pitch) continue
        const noteInfo = this.pitchToMidiFromSourceNote(note.pitch)
        this.allNotes.push({
          note: note,
          midiNumber: noteInfo.midiNote,
          noteName: noteInfo.noteName,
          timestamp: baseTimestamp + measureIndex * 1000,
          measureIndex: measureIndex
        })
      }
    },

    pitchToMidiFromSourceNote(pitch) {
      const midiNote = pitch.halfTone + 12
      const noteNamesMidi = [
        'C',
        'C#',
        'D',
        'D#',
        'E',
        'F',
        'F#',
        'G',
        'G#',
        'A',
        'A#',
        'B'
      ]
      const noteNameStd = noteNamesMidi[midiNote % 12]
      const octaveStd = Math.floor(midiNote / 12) - 1
      return {
        noteName: `${noteNameStd}${octaveStd}`,
        midiNote: midiNote
      }
    },

    highlightNextNote() {
      if (!this.osmdInstance || this.allNotes.length === 0) return

      try {
        for (const noteData of this.allNotes) {
          if (noteData.note) {
            noteData.note.NoteheadColor = '#000000'
            noteData.note.StemColor = '#000000'
          }
        }

        for (let i = 0; i < this.currentNoteIndex; i++) {
          if (this.allNotes[i]?.note) {
            this.allNotes[i].note.NoteheadColor = '#22c55e'
            this.allNotes[i].note.StemColor = '#22c55e'
          }
        }

        this.osmdInstance.render()
        this.updateProgressDisplay()
      } catch (error) {
        console.error(
          'Erreur lors de la mise en évidence de la prochaine note:',
          error
        )
      }
    },

    updateProgressDisplay() {
      const progressDiv = document.getElementById('score-progress')
      if (!progressDiv) return

      if (this.allNotes.length === 0) {
        progressDiv.innerHTML = 'Aucune note détectée dans la partition'
        return
      }

      const total = this.allNotes.length
      const completed = this.currentNoteIndex
      const percentage = Math.round((completed / total) * 100)

      if (completed >= total) {
        progressDiv.innerHTML = `🎉 Partition terminée ! (${total}/${total} notes - 100%)`
        progressDiv.style.color = '#22c55e'
      } else {
        const nextNote = this.allNotes[this.currentNoteIndex]?.noteName || '?'
        progressDiv.innerHTML = `Note suivante: <strong>${nextNote}</strong> | Progression: ${completed}/${total} (${percentage}%)`
        progressDiv.style.color = '#3b82f6'
      }
    },

    validatePlayedNote(midiNote) {
      if (!this.osmdInstance || !this.hasScore || this.allNotes.length === 0) {
        console.log('Pas de partition chargée pour la validation')
        return
      }
      const expectedNote = this.allNotes[this.currentNoteIndex]

      if (this.currentNoteIndex >= this.allNotes.length) return

      const playedNoteName = this.noteName(midiNote)

      if (expectedNote.midiNumber === midiNote) {
        if (expectedNote.note) {
          expectedNote.note.NoteheadColor = '#22c55e'
          expectedNote.note.StemColor = '#22c55e'
        }

        this.currentNoteIndex++
        this.highlightNextNote()

        if (this.currentNoteIndex >= this.allNotes.length)
          this.showCompletionMessage()
      } else this.showErrorFeedback(expectedNote.noteName, playedNoteName)
    },

    showCompletionMessage() {
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
    },

    showErrorFeedback(expected, played) {
      const progressDiv = document.getElementById('score-progress')
      if (progressDiv) {
        const originalContent = progressDiv.innerHTML
        const originalColor = progressDiv.style.color

        progressDiv.innerHTML = `❌ Erreur: attendu <strong>${expected}</strong>, joué <strong>${played}</strong>`
        progressDiv.style.color = '#ef4444'

        setTimeout(() => {
          progressDiv.innerHTML = originalContent
          progressDiv.style.color = originalColor
        }, 2000)
      }
    },

    async scanBluetooth() {
      if (!navigator.bluetooth) {
        console.error('Web Bluetooth API non supportée')
        return
      }
      try {
        this.device = await navigator.bluetooth.requestDevice({
          filters: [
            { services: ['03b80e5a-ede8-4b33-a751-6ce34ec4c700'] } // MIDI BLE UUID
          ],
          optionalServices: ['battery_service']
        })
        const server = await this.device.gatt.connect()
        const service = await server.getPrimaryService(
          '03b80e5a-ede8-4b33-a751-6ce34ec4c700'
        )
        const characteristic = await service.getCharacteristic(
          '7772e5db-3868-4112-a1a9-f2669d106bf3'
        )
        await characteristic.startNotifications()
        characteristic.addEventListener('characteristicvaluechanged', event => {
          const value = event.target.value
          this.parseMidiBLE(value)
        })
        this.bluetoothConnected = true
      } catch (e) {
        console.error('Erreur Bluetooth: ' + e)
      }
    },
    parseMidiBLE(dataView, isReplay = false) {
      // Debug : affichage du contenu brut du paquet
      let arr = []
      for (let k = 0; k < dataView.byteLength; k++)
        arr.push(dataView.getUint8(k))
      console.log(`MIDI BLE ${isReplay ? 'replay ' : ''}packet:`, arr)

      // Enregistrer les données brutes si l'enregistrement est actif (et pas en rejeu)
      if (this.isRecording && !isReplay) {
        const timestamp = Date.now() - this.recordingStartTime
        this.recordingData.push({
          timestamp: timestamp,
          data: arr
        })
      }

      // Nouveau parsing : chaque paquet fait 5 octets
      if (arr.length === 5) {
        const status = arr[2] // Le vrai status MIDI est à l'index 2
        const note = arr[3] // La note est à l'index 3
        const velocity = arr[4] // La vélocité est à l'index 4
        console.log('status:', status, 'note:', note, 'velocity:', velocity)
        if (status >= 0x80 && status <= 0xef) {
          // Note On
          if (status === 144 && velocity > 0 && note < 128 && velocity < 128) {
            const noteName = this.noteName(note)
            this.addNoteToStaff(noteName)

            // Valider la note dans la partition MusicXML si elle est chargée
            this.validatePlayedNote(note)

            console.log(
              `Note ON ${isReplay ? 'replayed' : 'detected'}:`,
              noteName
            )
          }
          // Note Off
          if (status === 128) {
            console.log(
              `Note OFF ${isReplay ? 'replayed' : 'detected'}:`,
              this.noteName(note)
            )
          }
        }
      }
    },
    noteName(n) {
      const notes = [
        'C',
        'C#',
        'D',
        'D#',
        'E',
        'F',
        'F#',
        'G',
        'G#',
        'A',
        'A#',
        'B'
      ]
      const octave = Math.floor(n / 12) - 1
      return notes[n % 12] + octave
    },

    // === ENREGISTREMENT ===
    startRecording() {
      this.isRecording = true
      this.recordingData = []
      this.recordingStartTime = Date.now()
      this.recordingDuration = 0

      this.recordingTimer = setInterval(() => {
        this.recordingDuration = Math.floor(
          (Date.now() - this.recordingStartTime) / 1000
        )
      }, 1000)

      console.log('Enregistrement démarré')
    },

    async stopRecording() {
      this.isRecording = false
      clearInterval(this.recordingTimer)

      if (this.recordingData.length === 0) {
        alert('Aucune donnée enregistrée !')
        return
      }

      // Demander le nom de la cassette
      const cassetteName = prompt(
        'Nom de la cassette :',
        `Cassette_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}`
      )

      if (!cassetteName) {
        console.log('Enregistrement annulé')
        return
      }

      try {
        const response = await fetch('/api/cassettes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: cassetteName,
            data: this.recordingData
          })
        })

        const result = await response.json()

        if (response.ok) {
          alert(`Cassette "${cassetteName}" sauvegardée avec succès !`)
          this.loadCassettesList() // Recharger la liste
        } else {
          alert(`Erreur: ${result.error}`)
        }
      } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error)
        alert('Erreur lors de la sauvegarde de la cassette')
      }

      console.log(
        `Enregistrement arrêté. ${this.recordingData.length} messages enregistrés`
      )
    },

    // === GESTION DES CASSETTES ===
    async loadCassettesList() {
      try {
        const response = await fetch('/api/cassettes')
        if (response.ok) {
          this.cassettes = await response.json()
          console.log('Cassettes chargées:', this.cassettes)
        } else {
          console.error('Erreur lors du chargement des cassettes')
        }
      } catch (error) {
        console.error('Erreur lors du chargement des cassettes:', error)
      }
    },

    // === REJEU ===
    async replayCassette() {
      if (!this.selectedCassette) return

      this.isReplaying = true

      try {
        // Charger les données de la cassette
        const response = await fetch(`/${this.selectedCassette}`)
        const cassette = await response.json()

        console.log(`Début du rejeu de la cassette: ${cassette.name}`)
        console.log(`${cassette.data.length} messages à rejouer`)

        // Vider la partition avant le rejeu
        this.staff.notes = []
        this.redrawStaff()

        // Rejouer chaque message avec le bon timing
        for (let i = 0; i < cassette.data.length; i++) {
          const message = cassette.data[i]

          // Attendre le bon moment
          if (i > 0) {
            const delay = message.timestamp - cassette.data[i - 1].timestamp
            if (delay > 0) {
              await new Promise(resolve => setTimeout(resolve, delay))
            }
          }

          // Simuler la réception du message MIDI
          const uint8Array = new Uint8Array(message.data)
          const dataView = new DataView(uint8Array.buffer)
          this.parseMidiBLE(dataView, true) // true = mode rejeu
        }

        console.log('Rejeu terminé')
      } catch (error) {
        console.error('Erreur lors du rejeu:', error)
        alert('Erreur lors du rejeu de la cassette')
      }

      this.isReplaying = false
    }
  }
}
