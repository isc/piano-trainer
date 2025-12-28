import { NOTE_NAMES, noteName } from './midi.js'

let osmdInstance = null;
let allNotes = [];
let currentMeasureIndex = 0;
let currentNoteIndex = 0;
let trainingMode = false;
let targetRepeatCount = 3;
let repeatCount = 0;

let callbacks = {
  onNotesExtracted: null,
  onNoteValidation: null,
  onMeasureCompleted: null,
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
    getCurrentNoteIndex: () => currentNoteIndex,
    getNotesByMeasure: () => allNotes,
    getTrainingState: () => ({ trainingMode, currentMeasureIndex, repeatCount, targetRepeatCount }),
    setTrainingMode: (enabled) => {
      trainingMode = enabled
      repeatCount = 0
      currentMeasureIndex = 0
      currentNoteIndex = 0
      resetProgress()
    },
    resetMeasureProgress: () => {
      for (const measureData of allNotes) {
        for (const noteData of measureData.notes) {
          noteData.played = false
        }
      }
      currentNoteIndex = 0
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
    const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer);

    await osmd.load(xmlContent);
    osmdInstance = osmd;
    window.osmdInstance = osmd;

    extractNotesFromScore();
    addPlaybackControls(osmd);

  } catch (error) {
    console.error('Erreur lors du rendu MusicXML avec OSMD:', error);
  }
}

function extractNotesFromScore() {
  allNotes = [];
  currentMeasureIndex = 0;
  currentNoteIndex = 0;
  trainingMode = false;
  repeatCount = 0;

  if (!osmdInstance) return;

  extractFromSourceMeasures(osmdInstance.Sheet.SourceMeasures);

  if (callbacks.onNotesExtracted) {
    callbacks.onNotesExtracted(allNotes);
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

function validatePlayedNote(midiNote) {
  if (!osmdInstance || allNotes.length === 0) return false;
  if (currentMeasureIndex >= allNotes.length) return false;

  const measureData = allNotes[currentMeasureIndex];
  if (!measureData || !measureData.notes || measureData.notes.length === 0) return false;

  let foundIndex = -1;
  for (let i = 0; i < measureData.notes.length; i++) {
    const noteData = measureData.notes[i];
    if (!noteData.played && noteData.midiNumber === midiNote) {
      foundIndex = i;
      break;
    }
  }

  if (foundIndex !== -1) {
    const noteData = measureData.notes[foundIndex];
    svgNote(noteData.note).classList.add('played-note');
    measureData.notes[foundIndex].played = true;
    currentNoteIndex++;

    const allNotesPlayed = measureData.notes.every(note => note.played);
    
    if (allNotesPlayed) {
      if (trainingMode) {
        repeatCount++;
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
              currentNoteIndex = 0;
              repeatCount = 0;
              if (callbacks.onTrainingProgress) {
                callbacks.onTrainingProgress(currentMeasureIndex, repeatCount, targetRepeatCount);
              }
            }, 1000);
          }
        } else {
          setTimeout(() => {
            resetMeasureProgress();
            currentNoteIndex = 0;
            if (callbacks.onTrainingProgress) {
              callbacks.onTrainingProgress(currentMeasureIndex, repeatCount, targetRepeatCount);
            }
          }, 1000);
        }
      } else {
        if (currentMeasureIndex + 1 < allNotes.length) {
          currentMeasureIndex++;
          currentNoteIndex = 0;
        } else {
          if (callbacks.onMeasureCompleted) {
            callbacks.onMeasureCompleted(currentMeasureIndex);
          }
        }
      }
    }
    return true;
  } else {
    const expectedNote = measureData.notes.find(n => !n.played);
    if (expectedNote) {
      showErrorFeedback(expectedNote.noteName, noteName(midiNote));
    }
    return false;
  }
}

function svgNote(note) {
  return osmdInstance.rules.GNote(note).getSVGGElement();
}

function resetProgress() {
  if (!osmdInstance) return;

  currentNoteIndex = 0;
  for (const measureData of allNotes) {
    for (const noteData of measureData.notes) {
      svgNote(noteData.note).classList.remove('played-note');
      noteData.played = false;
    }
  }
  currentMeasureIndex = 0;
  repeatCount = 0;
  trainingMode = false;
  updateProgressDisplay();
}

function clearScore() {
  osmdInstance = null;
  allNotes = [];
  currentNoteIndex = 0;
  currentMeasureIndex = 0;
  trainingMode = false;
  repeatCount = 0;
  const scoreContainer = document.getElementById('score');
  scoreContainer.innerHTML = '';
  document.getElementById('musicxml-upload').value = '';
  
  const oldControls = document.querySelector('#score-controls');
  if (oldControls) oldControls.remove();
  
  const trainingInfo = document.getElementById('training-info');
  if (trainingInfo) trainingInfo.remove();
}

function updateProgressDisplay() {
  const progressDiv = document.getElementById('score-progress');
  if (!progressDiv) return;

  const total = allNotes.reduce((acc, m) => acc + m.notes.length, 0);
  const completed = allNotes.reduce((acc, m) => acc + m.notes.filter(n => n.played).length, 0);
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  if (completed >= total) {
    progressDiv.innerHTML = `🎉 Partition terminée ! (${total}/${total} notes - 100%)`;
    progressDiv.style.color = '#22c55e';
  } else {
    const currentMeasure = allNotes[currentMeasureIndex]?.measureIndex || 0;
    progressDiv.innerHTML = `Mesure: ${currentMeasure + 1}/${allNotes.length} | Progression: ${completed}/${total} (${percentage}%)`;
    progressDiv.style.color = '#3b82f6';
  }
}

function showCompletionMessage() {
  const scoreContainer = document.getElementById('score');
  const congratsDiv = document.createElement('div');
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
  `;
  congratsDiv.innerHTML = '🎉 Félicitations !<br>Partition terminée !';

  document.body.appendChild(congratsDiv);

  setTimeout(() => {
    document.body.removeChild(congratsDiv);
  }, 3000);
}

function showErrorFeedback(expected, played) {
  const progressDiv = document.getElementById('score-progress');
  if (progressDiv) {
    const originalContent = progressDiv.innerHTML;
    const originalColor = progressDiv.style.color;

    progressDiv.innerHTML = `❌ Erreur: attendu <strong>${expected}</strong>, joué <strong>${played}</strong>`;
    progressDiv.style.color = '#ef4444';

    setTimeout(() => {
      progressDiv.innerHTML = originalContent;
      progressDiv.style.color = originalColor;
    }, 2000);
  }
}

function addPlaybackControls(osmd) {
  const oldControls = document.querySelector('#score-controls');
  if (oldControls) oldControls.remove();

  const scoreContainer = document.getElementById('score');
  const controlsDiv = document.createElement('div');
  controlsDiv.id = 'score-controls';
  controlsDiv.style.cssText = 'margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;';

  const info = document.createElement('div');
  info.innerHTML = `
    <strong>Partition chargée avec succès !</strong><br>
    <small>Titre: ${JSON.stringify(osmd.Sheet?.Title) || 'Non spécifié'} |
    Compositeur: ${osmd.Sheet?.Composer || 'Non spécifié'}</small>
  `;
  controlsDiv.appendChild(info);

  const resetColorsBtn = document.createElement('button');
  resetColorsBtn.textContent = '🎨 Réinitialiser';
  resetColorsBtn.style.cssText = 'margin-left: 10px; padding: 5px 10px; font-size: 12px;';
  resetColorsBtn.onclick = () => resetProgress();
  controlsDiv.appendChild(resetColorsBtn);

  const progressDiv = document.createElement('div');
  progressDiv.id = 'score-progress';
  progressDiv.style.cssText = 'margin-top: 10px; font-weight: bold;';
  updateProgressDisplay();
  controlsDiv.appendChild(progressDiv);

  const statusDiv = document.createElement('div');
  statusDiv.id = 'extraction-status';
  statusDiv.style.cssText = 'margin-top: 10px; padding: 5px; background: #e8f5e8; border-radius: 3px; color: #2d5a2d;';
  const totalNotes = allNotes.reduce((acc, m) => acc + m.notes.length, 0);
  statusDiv.textContent = `✅ Extraction terminée: ${allNotes.length} mesures, ${totalNotes} notes`;
  controlsDiv.appendChild(statusDiv);

  scoreContainer.insertBefore(controlsDiv, scoreContainer.firstChild);
}
