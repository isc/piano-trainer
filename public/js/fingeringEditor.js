export function initFingeringEditor({ getOsmdInstance, getAllNotes, getNoteDataByKey, svgNote, svgNotehead }) {
  let clickHandlers = []

  function findNoteDataByKey(fingeringKey) {
    return getNoteDataByKey().get(fingeringKey) ?? null
  }

  // Build a map from SVG group ID to noteData array by iterating through SourceMeasures.
  // This is more reliable than using noteData.note from allNotes because it directly
  // uses OSMD's GNote lookup on fresh SourceNote objects.
  // Returns Map<svgId, noteData[]> to handle chords (multiple notes per SVG group).
  function buildSvgIdToNoteDataMap() {
    const osmdInstance = getOsmdInstance()
    const svgIdToNoteDatas = new Map()

    for (const measure of osmdInstance.Sheet.SourceMeasures) {
      const measureNumber = measure.MeasureNumberXML
      const noteCounters = new Map()

      for (const container of measure.verticalSourceStaffEntryContainers || []) {
        if (!container.staffEntries) continue

        container.staffEntries.forEach((staffEntry, staffIndex) => {
          if (!staffEntry?.voiceEntries) return

          for (const voiceEntry of staffEntry.voiceEntries) {
            if (!voiceEntry.notes) continue

            const voiceIndex = (voiceEntry.ParentVoice?.VoiceId ?? 1) - 1

            for (const note of voiceEntry.notes) {
              if (!note.pitch || note.isRest?.()) continue

              const counterKey = `${staffIndex}:${voiceIndex}`
              const seqIdx = noteCounters.get(counterKey) ?? 0
              noteCounters.set(counterKey, seqIdx + 1)

              const fingeringKey = `${measureNumber}:${staffIndex}:${voiceIndex}:${seqIdx}`
              const svgGroup = osmdInstance.rules.GNote(note)?.getSVGGElement?.()
              if (!svgGroup?.id) continue

              const noteData = findNoteDataByKey(fingeringKey)
              if (noteData) {
                if (!svgIdToNoteDatas.has(svgGroup.id)) {
                  svgIdToNoteDatas.set(svgGroup.id, [])
                }
                svgIdToNoteDatas.get(svgGroup.id).push(noteData)
              }
            }
          }
        })
      }
    }

    return svgIdToNoteDatas
  }

  function setupFingeringClickHandlers(cbs) {
    const osmdInstance = getOsmdInstance()
    const allNotes = getAllNotes()
    if (!osmdInstance || allNotes.length === 0) return

    removeFingeringClickHandlers()

    const svgIdToNoteDatas = buildSvgIdToNoteDataMap()

    for (const [svgId, noteDatas] of svgIdToNoteDatas) {
      const svgGroup = document.getElementById(svgId)
      if (!svgGroup) continue

      for (const noteData of noteDatas) {
        const notehead = svgGroup.querySelectorAll('.vf-notehead')[noteData.noteheadIndex]
        if (!notehead) continue

        const handler = (e) => {
          e.stopPropagation()
          cbs.onNoteClick?.(noteData)
        }
        notehead.addEventListener('click', handler)
        clickHandlers.push({ element: notehead, handler })
      }
    }
  }

  function removeFingeringClickHandlers() {
    for (const { element, handler } of clickHandlers) {
      element.removeEventListener('click', handler)
    }
    clickHandlers = []
  }

  // Restore note states from a saved state map (fingeringKey -> { played, active })
  function restoreNoteStates(noteStates) {
    for (const { notes } of getAllNotes()) {
      for (const noteData of notes) {
        const savedState = noteStates.get(noteData.fingeringKey)
        if (!savedState) continue

        noteData.played = savedState.played
        noteData.active = savedState.active

        svgNotehead(noteData)?.classList.toggle('played-note', savedState.played)
        svgNotehead(noteData)?.classList.toggle('active-note', savedState.active)
      }
    }
  }

  // Check whether a staff entry contains a given source note
  function staffEntryContainsNote(staffEntry, sourceNote) {
    for (const gve of staffEntry.graphicalVoiceEntries || []) {
      for (const gn of gve.notes || []) {
        if (gn.sourceNote === sourceNote) return true
      }
    }
    return false
  }

  // Find the highest-pitched source note across all voice entries in a staff entry
  function findTopNoteInStaffEntry(staffEntry) {
    let topNote = null
    for (const gve of staffEntry.graphicalVoiceEntries || []) {
      for (const gn of gve.notes || []) {
        if (!topNote || gn.sourceNote?.Pitch?.getHalfTone() > topNote.Pitch?.getHalfTone()) {
          topNote = gn.sourceNote
        }
      }
    }
    return topNote
  }

  // Collect fingering TechnicalInstructions from a staff entry (non-grace voices only)
  function collectFingeringsFromStaffEntry(staffEntry) {
    const fingerings = []
    for (const gve of staffEntry.graphicalVoiceEntries || []) {
      if (gve.parentVoiceEntry?.IsGrace) continue
      for (const ti of gve.parentVoiceEntry?.TechnicalInstructions || []) {
        if (ti.type === 0) fingerings.push(ti)
      }
    }
    return fingerings
  }

  // Determine whether fingerings are placed above or below the staff
  // PlacementEnum: Above=0, Below=1
  function isFingeringsPlacedAbove(graphicalMeasure) {
    const position = getOsmdInstance().rules?.FingeringPosition
    if (position === 0) return true
    if (position === 1) return false
    return graphicalMeasure.isUpperStaffOfInstrument?.() ?? true
  }

  // Find the FingeringEntry for a note by its fingeringKey
  // fingeringKey format: measureNumber:staffIndex:voiceIndex:noteIndex
  function findFingeringEntry(fingeringKey) {
    const osmdInstance = getOsmdInstance()
    if (!osmdInstance?.graphic?.MeasureList) return null

    const [measureNumber, staffIndex] = fingeringKey.split(':').map(Number)

    const sourceMeasures = osmdInstance.Sheet.SourceMeasures
    const sourceMeasureIndex = sourceMeasures.findIndex((m) => m.MeasureNumberXML === measureNumber)
    if (sourceMeasureIndex < 0) return null

    const graphicalMeasure = osmdInstance.graphic.MeasureList[sourceMeasureIndex]?.[staffIndex]
    if (!graphicalMeasure) return null

    const targetNoteData = findNoteDataByKey(fingeringKey)
    if (!targetNoteData) return null

    for (const staffEntry of graphicalMeasure.staffEntries || []) {
      if (!staffEntryContainsNote(staffEntry, targetNoteData.note)) continue

      const fingerings = collectFingeringsFromStaffEntry(staffEntry)
      const targetFingering = fingerings.find((f) => f.sourceNote === targetNoteData.note)
      if (!targetFingering) return null

      // Replicate OSMD's ordering to match FingeringEntries array order
      if (!isFingeringsPlacedAbove(graphicalMeasure)) {
        fingerings.reverse()
      } else if (fingerings[0]?.sourceNote === findTopNoteInStaffEntry(staffEntry)) {
        // When placed above, OSMD reverses if first fingering belongs to the top note
        fingerings.reverse()
      }

      const finalIndex = fingerings.indexOf(targetFingering)
      return staffEntry.FingeringEntries?.[finalIndex] || null
    }

    return null
  }

  // Update an existing fingering's SVG directly without re-rendering
  // Returns true if successful, false if no existing fingering found
  function updateFingeringSVG(fingeringKey, newFinger) {
    const targetNoteData = findNoteDataByKey(fingeringKey)
    if (!targetNoteData) return false

    const fingerText = newFinger.toString()

    // Grace notes don't have FingeringEntries - their fingerings are rendered directly in the stavenote group
    if (targetNoteData.isGrace) {
      const svgGroup = svgNote(targetNoteData.note)
      if (!svgGroup) return false
      // The fingering text is a direct child of the stavenote group
      const textEl = svgGroup.querySelector('text')
      if (!textEl) return false
      textEl.textContent = fingerText
      return true
    }

    // Regular notes use FingeringEntries
    const fingeringEntry = findFingeringEntry(fingeringKey)
    const textEl = fingeringEntry?.SVGNode?.querySelector('text')
    if (!textEl) return false

    textEl.textContent = fingerText

    // Also update the label text for consistency
    if (fingeringEntry.label) {
      fingeringEntry.label.text = fingerText
    }

    // Also update the TechnicalInstruction value so light re-renders stay consistent
    const tis = targetNoteData.voiceEntry?.TechnicalInstructions || []
    const ti = tis.find((t) => t.type === 0 && t.sourceNote === targetNoteData.note)
    if (ti) ti.value = fingerText

    return true
  }

  // Add a fingering to OSMD's internal data model (without re-rendering)
  // This allows a subsequent renderScore() to pick it up via calculateFingerings
  function addFingeringToDataModel(fingeringKey, finger) {
    const noteData = findNoteDataByKey(fingeringKey)
    if (!noteData?.voiceEntry?.TechnicalInstructions) return false

    noteData.voiceEntry.TechnicalInstructions.push({
      type: 0, // TechnicalInstructionType.Fingering
      value: finger.toString(),
      sourceNote: noteData.note,
    })
    return true
  }

  // Remove a fingering from OSMD's internal data model
  function removeFingeringFromDataModel(fingeringKey) {
    const noteData = findNoteDataByKey(fingeringKey)
    if (!noteData?.voiceEntry?.TechnicalInstructions) return false

    const tis = noteData.voiceEntry.TechnicalInstructions
    const index = tis.findIndex((ti) => ti.type === 0 && ti.sourceNote === noteData.note)
    if (index < 0) return false

    tis.splice(index, 1)
    return true
  }

  return {
    setupFingeringClickHandlers,
    removeFingeringClickHandlers,
    restoreNoteStates,
    updateFingeringSVG,
    addFingeringToDataModel,
    removeFingeringFromDataModel,
  }
}
