let staffState = {
  renderer: null,
  context: null,
  stave: null,
  notes: []
}

export function initStaff() {
  return {
    initStaff: initStaffInternal,
    addNoteToStaff,
    redrawStaff,
    getStaffState
  }
}

function initStaffInternal() {
  const div = document.getElementById('staff')
  div.innerHTML = ''
  const renderer = new VexFlow.Renderer(div, VexFlow.Renderer.Backends.SVG)
  renderer.resize(600, 200)
  const context = renderer.getContext()

  staffState = {
    renderer,
    context,
    stave: new VexFlow.Stave(10, 40, 580),
    notes: []
  }

  staffState.stave.addClef('treble').addTimeSignature('4/4')
  staffState.stave.setContext(context).draw()
}

function addNoteToStaff(noteName) {
  const vexNote = convertToVexFlowNote(noteName)
  staffState.notes.push(vexNote)

  if (staffState.notes.length > 8) {
    staffState.notes.shift()
  }

  redrawStaff()
}

function convertToVexFlowNote(noteName) {
  const isSharp = noteName.includes('#')
  let note = noteName.replace('#', '').slice(0, -1).toLowerCase()
  const octave = parseInt(noteName.slice(-1))

  return { keys: [`${note}/${octave}`], accidental: isSharp ? '#' : null }
}

function redrawStaff() {
  const savedNotes = [...staffState.notes]
  if (savedNotes.length > 0) {
    drawNotesWithVexFlow5(savedNotes)
  }
}

function drawNotesWithVexFlow5(savedNotes) {
  try {
    initStaffInternal()

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
        note.setStave(staffState.stave)
        voice.addTickable(note)
      })

      const formatter = new VexFlow.Formatter()
      formatter.joinVoices([voice])
      formatter.formatToStave([voice], staffState.stave)
      voice.draw(staffState.context, staffState.stave)
    }

    staffState.notes = savedNotes
  } catch (error) {
    console.error('VexFlow 5.0 drawing error:', error)
    staffState.notes = savedNotes
  }
}

function getStaffState() {
  return staffState
}
