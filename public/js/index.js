import { initMidi } from './midi.js'
import { initMusicXML } from './musicxml.js'
import { initUI } from './ui.js'
import { initStaff } from './staff.js'

document.addEventListener('DOMContentLoaded', function () {
  console.log('Initializing Piano Trainer...')

  const midi = initMidi()
  const musicxml = initMusicXML()
  const ui = initUI()
  const staff = initStaff()

  window.pianoTrainer = {
    midi,
    musicxml,
    ui,
    staff
  }

  console.log('Piano Trainer initialized')
})
