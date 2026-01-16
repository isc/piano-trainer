export function injectFingerings(xmlString, fingerings) {
  if (!fingerings || Object.keys(fingerings).length === 0) {
    return xmlString
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')

  const parts = doc.querySelectorAll('part')

  for (const part of parts) {
    const measures = part.querySelectorAll('measure')

    for (const measure of measures) {
      const measureNumber = parseInt(measure.getAttribute('number'), 10)

      // Track sequential note index for each (staff, voice) combination
      const noteCounters = new Map()

      const notes = measure.querySelectorAll('note')

      for (const note of notes) {
        // Skip rests
        if (note.querySelector('rest')) continue

        // Get staff (default to 1 if not specified, convert to 0-indexed)
        const staffEl = note.querySelector('staff')
        const staff = staffEl ? parseInt(staffEl.textContent, 10) - 1 : 0

        // Get voice (default to 1 if not specified, convert to 0-indexed)
        const voiceEl = note.querySelector('voice')
        const voice = voiceEl ? parseInt(voiceEl.textContent, 10) - 1 : 0

        // Get sequential note index for this (staff, voice) combination
        const counterKey = `${staff}:${voice}`
        if (!noteCounters.has(counterKey)) {
          noteCounters.set(counterKey, 0)
        }
        const noteIndex = noteCounters.get(counterKey)
        noteCounters.set(counterKey, noteIndex + 1)

        // Build the fingering key
        const fingeringKey = `${measureNumber}:${staff}:${voice}:${noteIndex}`

        if (fingerings[fingeringKey] !== undefined) {
          injectFingeringIntoNote(doc, note, fingerings[fingeringKey])
        }
      }
    }
  }

  const serializer = new XMLSerializer()
  return serializer.serializeToString(doc)
}

function injectFingeringIntoNote(doc, note, finger) {
  // Find or create <notations>
  let notations = note.querySelector('notations')
  if (!notations) {
    notations = doc.createElement('notations')
    // Insert notations after certain elements but before others
    // MusicXML order: pitch/rest, duration, tie, chord, type, ..., notations, lyric
    const typeEl = note.querySelector('type')
    if (typeEl && typeEl.nextSibling) {
      note.insertBefore(notations, typeEl.nextSibling)
    } else {
      note.appendChild(notations)
    }
  }

  // Find or create <technical>
  let technical = notations.querySelector('technical')
  if (!technical) {
    technical = doc.createElement('technical')
    notations.appendChild(technical)
  }

  // Find or create <fingering>
  let fingering = technical.querySelector('fingering')
  if (!fingering) {
    fingering = doc.createElement('fingering')
    technical.appendChild(fingering)
  }

  // Set the finger value
  fingering.textContent = finger.toString()
}
