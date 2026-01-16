function getElementInt(parent, tagName, defaultValue) {
  const el = parent.querySelector(tagName)
  return el ? parseInt(el.textContent, 10) : defaultValue
}

export function injectFingerings(xmlString, fingerings) {
  if (!fingerings || Object.keys(fingerings).length === 0) {
    return xmlString
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')

  for (const part of doc.querySelectorAll('part')) {
    for (const measure of part.querySelectorAll('measure')) {
      const measureNumber = parseInt(measure.getAttribute('number'), 10)
      const noteCounters = new Map()

      for (const note of measure.querySelectorAll('note')) {
        if (note.querySelector('rest')) continue

        // Convert 1-based MusicXML indices to 0-based
        const staff = getElementInt(note, 'staff', 1) - 1
        const voice = getElementInt(note, 'voice', 1) - 1

        const counterKey = `${staff}:${voice}`
        const noteIndex = noteCounters.get(counterKey) || 0
        noteCounters.set(counterKey, noteIndex + 1)

        const fingeringKey = `${measureNumber}:${staff}:${voice}:${noteIndex}`
        if (fingerings[fingeringKey] !== undefined) {
          injectFingeringIntoNote(doc, note, fingerings[fingeringKey])
        }
      }
    }
  }

  return new XMLSerializer().serializeToString(doc)
}

function getOrCreateChild(doc, parent, tagName) {
  let child = parent.querySelector(tagName)
  if (!child) {
    child = doc.createElement(tagName)
    parent.appendChild(child)
  }
  return child
}

function injectFingeringIntoNote(doc, note, finger) {
  // Find or create <notations> (insert after <type> per MusicXML element order)
  let notations = note.querySelector('notations')
  if (!notations) {
    notations = doc.createElement('notations')
    const typeEl = note.querySelector('type')
    if (typeEl?.nextSibling) {
      note.insertBefore(notations, typeEl.nextSibling)
    } else {
      note.appendChild(notations)
    }
  }

  const technical = getOrCreateChild(doc, notations, 'technical')
  const fingering = getOrCreateChild(doc, technical, 'fingering')
  fingering.textContent = finger.toString()
}
