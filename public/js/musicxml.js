let osmdInstance = null;
let allNotes = [];
let currentNoteIndex = 0;

let callbacks = {
  onNotesExtracted: null,
  onNoteValidation: null
};

export function initMusicXML() {
  return {
    loadMusicXML,
    renderMusicXML,
    extractNotesFromScore,
    validatePlayedNote,
    resetProgress,
    clearScore,
    setCallbacks
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
  currentNoteIndex = 0;

  if (!osmdInstance) return;

  extractFromSourceMeasures(osmdInstance.Sheet.SourceMeasures);
  allNotes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  if (callbacks.onNotesExtracted) {
    callbacks.onNotesExtracted(allNotes);
  }
}

function extractFromSourceMeasures(sourceMeasures) {
  sourceMeasures.forEach((measure, measureIndex) => {
    measure.verticalSourceStaffEntryContainers.forEach(container => {
      extractNotesFromContainer(container, measureIndex);
    });
  });
}

function extractNotesFromContainer(container, measureIndex) {
  if (container.staffEntries) {
    for (const staffEntry of container.staffEntries) {
      if (!staffEntry?.voiceEntries) continue;
      for (const voiceEntry of staffEntry.voiceEntries) {
        extractNotesFromVoiceEntry(voiceEntry, measureIndex);
      }
    }
  }
}

function extractNotesFromVoiceEntry(voiceEntry, measureIndex) {
  if (!voiceEntry.notes) return;
  for (const note of voiceEntry.notes) {
    if (!note.pitch) continue;
    const noteInfo = pitchToMidiFromSourceNote(note.pitch);
    allNotes.push({
      note: note,
      midiNumber: noteInfo.midiNote,
      noteName: noteInfo.noteName,
      timestamp: measureIndex + voiceEntry.timestamp.realValue,
      measureIndex: measureIndex
    });
  }
}

function pitchToMidiFromSourceNote(pitch) {
  const midiNote = pitch.halfTone + 12;
  const noteNameStd = NOTE_NAMES[midiNote % 12];
  const octaveStd = Math.floor(midiNote / 12) - 1;
  return { noteName: `${noteNameStd}${octaveStd}`, midiNote: midiNote };
}

function validatePlayedNote(midiNote) {
  if (!osmdInstance || allNotes.length === 0) return;
  if (currentNoteIndex >= allNotes.length) return;

  const expectedNote = allNotes[currentNoteIndex];
  const currentTimestamp = expectedNote.timestamp;

  // Find matching note at current timestamp
  const matchingNoteIndex = allNotes.findIndex(
    (note, index) =>
      index >= currentNoteIndex &&
      note.timestamp === currentTimestamp &&
      note.midiNumber === midiNote
  );

  if (matchingNoteIndex !== -1) {
    const matchingNote = allNotes[matchingNoteIndex];
    svgNote(matchingNote.note).classList.add('played-note');

    // Handle out-of-order notes
    if (matchingNoteIndex !== currentNoteIndex) {
      [allNotes[currentNoteIndex], allNotes[matchingNoteIndex]] =
      [allNotes[matchingNoteIndex], allNotes[currentNoteIndex]];
    }

    currentNoteIndex++;

    if (currentNoteIndex >= allNotes.length) {
      showCompletionMessage();
    }
  } else {
    // Show error for incorrect note
    const notesAtSameTimestamp = allNotes.filter(
      (note, index) =>
        index >= currentNoteIndex &&
        note.timestamp === currentTimestamp
    );
    const expectedNoteNames = notesAtSameTimestamp
      .map(note => note.noteName)
      .join(' ou ');
    showErrorFeedback(expectedNoteNames, noteName(midiNote));
  }
}

function svgNote(note) {
  return osmdInstance.rules.GNote(note).getSVGGElement();
}

function resetProgress() {
  if (!osmdInstance) return;

  currentNoteIndex = 0;
  for (const noteData of allNotes) {
    svgNote(noteData.note).classList.remove('played-note');
  }
  updateProgressDisplay();
}

function clearScore() {
  osmdInstance = null;
  allNotes = [];
  currentNoteIndex = 0;
  const scoreContainer = document.getElementById('score');
  scoreContainer.innerHTML = '';
  document.getElementById('musicxml-upload').value = '';
}

function updateProgressDisplay() {
  const progressDiv = document.getElementById('score-progress');
  if (!progressDiv) return;

  const total = allNotes.length;
  const completed = currentNoteIndex;
  const percentage = Math.round((completed / total) * 100);

  if (completed >= total) {
    progressDiv.innerHTML = `🎉 Partition terminée ! (${total}/${total} notes - 100%)`;
    progressDiv.style.color = '#22c55e';
  } else {
    const nextNote = allNotes[currentNoteIndex]?.noteName || '?';
    progressDiv.innerHTML = `Note suivante: <strong>${nextNote}</strong> | Progression: ${completed}/${total} (${percentage}%)`;
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
  const scoreContainer = document.getElementById('score');
  const controlsDiv = document.createElement('div');
  controlsDiv.style.cssText = '
    margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;
  ';

  const info = document.createElement('div');
  info.innerHTML = `
    <strong>Partition chargée avec succès !</strong><br>
    <small>Titre: ${JSON.stringify(osmd.Sheet?.Title) || 'Non spécifié'} |
    Compositeur: ${osmd.Sheet?.Composer || 'Non spécifié'}</small>
  `;
  controlsDiv.appendChild(info);

  const resetColorsBtn = document.createElement('button');
  resetColorsBtn.textContent = '🎨 Réinitialiser';
  resetColorsBtn.style.cssText = '
    margin-left: 10px; padding: 5px 10px; font-size: 12px;
  ';
  resetColorsBtn.onclick = () => resetProgress();
  controlsDiv.appendChild(resetColorsBtn);

  const progressDiv = document.createElement('div');
  progressDiv.id = 'score-progress';
  progressDiv.style.cssText = 'margin-top: 10px; font-weight: bold;';
  updateProgressDisplay();
  controlsDiv.appendChild(progressDiv);

  const statusDiv = document.createElement('div');
  statusDiv.id = 'extraction-status';
  statusDiv.style.cssText = '
    margin-top: 10px; padding: 5px; background: #e8f5e8; border-radius: 3px; color: #2d5a2d;
  ';
  statusDiv.textContent = `✅ Extraction terminée: ${allNotes.length} notes trouvées`;
  controlsDiv.appendChild(statusDiv);

  document.body.appendChild(controlsDiv);
}

export { NOTE_NAMES };
