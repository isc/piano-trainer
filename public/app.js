function midiApp() {
  return {
    bluetoothConnected: false,
    device: null,
    staff: null,
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
      console.log('Adding note to staff:', noteName)
      // Convert note name (like "C3") to VexFlow format
      const vexNote = this.convertToVexFlowNote(noteName)
      this.staff.notes.push(vexNote)
      console.log('Current staff notes:', this.staff.notes)

      // Keep only last 8 notes to fit on staff
      if (this.staff.notes.length > 8) {
        this.staff.notes.shift()
      }

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

          if (noteData.accidental) {
            note.addModifier(new VexFlow.Accidental(noteData.accidental), 0)
          }

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
          // Décodage du message MIDI BLE
          this.parseMidiBLE(value)
        })
        this.bluetoothConnected = true
      } catch (e) {
        console.error('Erreur Bluetooth: ' + e)
      }
    },
    // Décodage des messages MIDI BLE
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

      // Timer pour afficher la durée
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
        const response = await fetch('http://localhost:4567/api/cassettes', {
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
        const response = await fetch('http://localhost:4567/api/cassettes')
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
        const response = await fetch(
          `http://localhost:4567/${this.selectedCassette}`
        )
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
