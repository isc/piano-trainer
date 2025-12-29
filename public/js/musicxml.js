import { NOTE_NAMES, noteName } from './midi.js'

let osmdInstance = null;
let allNotes = [];
let currentMeasureIndex = 0;
let trainingMode = false;
let targetRepeatCount = 3;
let repeatCount = 0;
let currentRepetitionIsClean = true;

let callbacks = {
  onNotesExtracted: null,
  onNoteValidation: null,
  onMeasureCompleted: null,
  onNoteError: null,
  onTrainingProgress: null,
  onTrainingComplete: null
};

export function initMusicXML() {
  return {
    loadMusicXML,
    renderMusicXML,
    extractNotesFromScore,
    validatePlayedNote,
    resetProgress,
    clearScore,
    setCallbacks,
    getOsmdInstance: () => osmdInstance,
    getAllNotes: () => allNotes,
    getNotesByMeasure: () => allNotes,
    getTrainingState: () => ({ trainingMode, currentMeasureIndex, repeatCount, targetRepeatCount }),
    setTrainingMode: (enabled) => {
      trainingMode = enabled
      repeatCount = 0
      currentMeasureIndex = 0
      currentRepetitionIsClean = true
      resetProgress()
      updateMeasureCursor()
    },
    resetMeasureProgress: () => {
      for (const measureData of allNotes) {
        for (const noteData of measureData.notes) {
          noteData.played = false
        }
      }
    }
  };
}

function setCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs };
}

async function loadMusicXML(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const xmlContent = await file.text();

    if (!xmlContent.includes('score-partwise') && !xmlContent.includes('score-timewise')) {
      alert('Ce fichier ne semble pas être un fichier MusicXML valide');
      return;
    }

    await renderMusicXML(xmlContent);
  } catch (error) {
    console.error('Erreur lors du chargement du MusicXML:', error);
    alert('Erreur lors du chargement du fichier MusicXML');
  }
}

async function renderMusicXML(xmlContent) {
  try {
    const scoreContainer = document.getElementById('score');
    const osmdContainer = scoreContainer.querySelector('.osmd-container') || scoreContainer;
    const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(osmdContainer);

    await osmd.load(xmlContent);
    osmdInstance = osmd;
    window.osmdInstance = osmd;

    extractNotesFromScore();

  } catch (error) {
    console.error('Erreur lors du rendu MusicXML avec OSMD:', error);
  }
}

function extractNotesFromScore() {
  allNotes = [];
  currentMeasureIndex = 0;
  trainingMode = false;
  repeatCount = 0;
  currentRepetitionIsClean = true;

  if (!osmdInstance) return;

  const sheet = osmdInstance.Sheet;
  extractFromSourceMeasures(sheet.SourceMeasures);

  if (callbacks.onNotesExtracted) {
    console.log('Calling onNotesExtracted callback');
    callbacks.onNotesExtracted(allNotes, {
      title: sheet.Title?.text || '',
      composer: sheet.Composer || ''
    });
  }
}

function extractFromSourceMeasures(sourceMeasures) {
  sourceMeasures.forEach((measure, measureIndex) => {
    const measureNotes = [];
    
    measure.verticalSourceStaffEntryContainers.forEach(container => {
      if (container.staffEntries) {
        for (const staffEntry of container.staffEntries) {
          if (!staffEntry?.voiceEntries) continue;
          for (const voiceEntry of staffEntry.voiceEntries) {
            if (!voiceEntry.notes) continue;
            for (const note of voiceEntry.notes) {
              if (!note.pitch) continue;
              const noteInfo = pitchToMidiFromSourceNote(note.pitch);
              measureNotes.push({
                note: note,
                midiNumber: noteInfo.midiNote,
                noteName: noteInfo.noteName,
                timestamp: measureIndex + voiceEntry.timestamp.realValue,
                measureIndex: measureIndex,
                played: false
              });
            }
          }
        }
      }
    });
    
    if (measureNotes.length > 0) {
      allNotes.push({
        measureIndex: measureIndex,
        notes: measureNotes
      });
    }
  });
}

function pitchToMidiFromSourceNote(pitch) {
  const midiNote = pitch.halfTone + 12;
  const noteNameStd = NOTE_NAMES[midiNote % 12];
  const octaveStd = Math.floor(midiNote / 12) - 1;
  return { noteName: `${noteNameStd}${octaveStd}`, midiNote: midiNote };
}

function resetMeasureProgress() {
  if (currentMeasureIndex >= allNotes.length) return;

  const measureData = allNotes[currentMeasureIndex];
  if (!measureData) return;

  for (const noteData of measureData.notes) {
    svgNote(noteData.note).classList.remove('played-note');
    noteData.played = false;
  }
}

function updateMeasureCursor() {
  if (!osmdInstance) return;

  // Remove existing highlight rectangle
  const existingHighlight = document.getElementById('measure-highlight-rect');
  if (existingHighlight) {
    existingHighlight.remove();
  }

  if (trainingMode && currentMeasureIndex < allNotes.length) {
    const measureData = allNotes[currentMeasureIndex];
    if (measureData && measureData.notes && measureData.notes.length > 0) {
      // Get bounding boxes of all notes in the measure
      const noteElements = measureData.notes.map(n => svgNote(n.note));
      const boxes = noteElements.map(el => el.getBBox());

      if (boxes.length > 0) {
        // Calculate combined bounding box
        const minX = Math.min(...boxes.map(b => b.x));
        const minY = Math.min(...boxes.map(b => b.y));
        const maxX = Math.max(...boxes.map(b => b.x + b.width));
        const maxY = Math.max(...boxes.map(b => b.y + b.height));

        // Create highlight rectangle
        const svg = noteElements[0].ownerSVGElement;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('id', 'measure-highlight-rect');
        rect.setAttribute('x', minX - 10);
        rect.setAttribute('y', minY - 10);
        rect.setAttribute('width', maxX - minX + 20);
        rect.setAttribute('height', maxY - minY + 20);
        rect.setAttribute('fill', 'rgba(59, 130, 246, 0.15)');
        rect.setAttribute('rx', '4');

        // Insert at beginning so it's behind notes
        svg.insertBefore(rect, svg.firstChild);
      }
    }
  }
}

function validatePlayedNote(midiNote) {
  if (!osmdInstance || allNotes.length === 0) return false;
  if (currentMeasureIndex >= allNotes.length) return false;

  const measureData = allNotes[currentMeasureIndex];
  if (!measureData || !measureData.notes || measureData.notes.length === 0) return false;

  const expectedNote = measureData.notes.find(n => !n.played);
  if (!expectedNote) return false;

  const expectedTimestamp = expectedNote.timestamp;

  let foundIndex = -1;
  for (let i = 0; i < measureData.notes.length; i++) {
    const noteData = measureData.notes[i];
    if (!noteData.played &&
        noteData.timestamp === expectedTimestamp &&
        noteData.midiNumber === midiNote) {
      foundIndex = i;
      break;
    }
  }

  if (foundIndex !== -1) {
    const noteData = measureData.notes[foundIndex];
    svgNote(noteData.note).classList.add('played-note');
    measureData.notes[foundIndex].played = true;

    const allNotesPlayed = measureData.notes.every(note => note.played);

    if (allNotesPlayed) {
      if (trainingMode) {
        if (currentRepetitionIsClean) {
          repeatCount++;
        }
        if (callbacks.onTrainingProgress) {
          callbacks.onTrainingProgress(currentMeasureIndex, repeatCount, targetRepeatCount);
        }

        if (repeatCount >= targetRepeatCount) {
          if (currentMeasureIndex + 1 >= allNotes.length) {
            if (callbacks.onTrainingComplete) {
              callbacks.onTrainingComplete();
            }
          } else {
            setTimeout(() => {
              resetMeasureProgress();
              currentMeasureIndex++;
              repeatCount = 0;
              currentRepetitionIsClean = true;
              updateMeasureCursor();
              if (callbacks.onTrainingProgress) {
                callbacks.onTrainingProgress(currentMeasureIndex, repeatCount, targetRepeatCount);
              }
            }, 500);
          }
        } else {
          setTimeout(() => {
            resetMeasureProgress();
            currentRepetitionIsClean = true;
            if (callbacks.onTrainingProgress) {
              callbacks.onTrainingProgress(currentMeasureIndex, repeatCount, targetRepeatCount);
            }
          }, 500);
        }
      } else {
        if (currentMeasureIndex + 1 < allNotes.length) {
          currentMeasureIndex++;
        } else {
          if (callbacks.onMeasureCompleted) {
            callbacks.onMeasureCompleted(currentMeasureIndex);
          }
        }
      }
    }
    return true;
  } else {
    if (trainingMode) {
      currentRepetitionIsClean = false;
    }
    const expectedNote = measureData.notes.find(n => !n.played);
    if (expectedNote && callbacks.onNoteError) {
      callbacks.onNoteError(expectedNote.noteName, noteName(midiNote));
    }
    return false;
  }
}

function svgNote(note) {
  return osmdInstance.rules.GNote(note).getSVGGElement();
}

function resetProgress() {
  if (!osmdInstance) return;

  for (const measureData of allNotes) {
    for (const noteData of measureData.notes) {
      svgNote(noteData.note).classList.remove('played-note');
      noteData.played = false;
    }
  }
  currentMeasureIndex = 0;
  repeatCount = 0;
  currentRepetitionIsClean = true;
}

function clearScore() {
  osmdInstance = null;
  allNotes = [];
  currentMeasureIndex = 0;
  trainingMode = false;
  repeatCount = 0;
  currentRepetitionIsClean = true;
  const scoreContainer = document.getElementById('score');
  const osmdContainer = scoreContainer.querySelector('.osmd-container');
  if (osmdContainer) {
    osmdContainer.innerHTML = '';
  }
  document.getElementById('musicxml-upload').value = '';
}
