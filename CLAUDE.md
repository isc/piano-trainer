always open a PR to make changes, never commit directly to main
when merging PRs, always use squash merge (gh pr merge --squash)
PR titles and descriptions must be in English
focus on writing DRY code
use PicoCSS as much as possible, avoid custom CSS code

## Codebase Structure

### JavaScript Modules
- **`/public/js/app.js`** - Main Alpine.js app with:
  - MIDI callbacks (`onNotePlayed`, `onNoteReleased`)
  - Score loading and management
  - Training mode logic
  - Wakelock and fullscreen requests
  - Recording/cassette management

- **`/public/js/musicxml.js`** - OpenSheetMusicDisplay integration:
  - `loadFromURL(url)` - Load score from URL
  - `loadMusicXML(event)` - Load from file upload
  - `renderScore()` - Render to DOM
  - `extractNotesFromScore()` - Parse notes from rendered score
  - `activateNote(midiNote)` - Highlight note when played
  - Training mode with measure-by-measure progress

- **`/public/js/midi.js`** - Web MIDI API wrapper:
  - Device connection and input handling
  - Note parsing from MIDI messages
  - Recording MIDI data

- **`/public/js/library.js`** - Score library:
  - Load scores from `/data/scores.json`
  - Search/filter functionality

- **`/public/js/cassettes.js`** - Recording management:
  - Save/load MIDI recordings
  - Replay functionality

### HTML Pages
- **`/public/score.html`** - Training interface:
  - File upload input
  - MIDI connection button
  - Training mode and fullscreen buttons
  - Score display section
  - Recording controls

- **`/public/index.html`** - Score library:
  - Searchable list of 70 scores
  - Links to training page with score URL

### Styling
- **`/public/styles.css`** - Custom styles:
  - Score display (full-width)
  - Note highlighting (green/orange/blue)
  - Training UI elements
  - Uses PicoCSS framework (vendor)

### Backend
- **`/app.rb`** - Sinatra server:
  - Serves static files
  - `/api/cassettes` - List recordings
  - `POST /api/cassettes` - Save recordings

### Data
- **`/public/data/scores.json`** - Metadata for 70 classical music pieces
- **`/public/scores/`** - MusicXML score files
- **`/public/cassettes/`** - Recorded MIDI files

## Running Tests

When running tests, save output to a temp file instead of piping to `tail`. This captures the full output and avoids re-running tests to see errors:

```bash
bundle exec rake test > tmp/test-output.txt 2>&1; cat tmp/test-output.txt
```

## How It Works

1. User navigates to library (`/index.html`) or directly to trainer
2. Loads score via file upload or library link (adds `?url=` parameter)
3. Score is parsed with OpenSheetMusicDisplay, notes are extracted
4. User connects MIDI keyboard
5. Playing notes triggers `onNotePlayed` callback:
   - Note is highlighted on score
   - Validated against expected note (if in training mode)
   - Error shown if wrong note
6. Training mode progresses by measure, repeats configurable
7. Can record practice sessions and replay them
