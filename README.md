# Piano Trainer

A web-based piano training application that helps musicians practice by connecting MIDI devices, displaying sheet music, and providing real-time feedback on note accuracy.

## Features

### Core Functionality
- **MIDI Bluetooth Connection**: Connect wireless MIDI devices via Web Bluetooth API
- **Real-time Note Display**: Visual feedback showing played notes on a musical staff
- **MusicXML Support**: Load and display sheet music in MusicXML format
- **Interactive Practice**: Highlights notes as you play and validates accuracy
- **Recording & Playback**: Record MIDI performances and replay them

### Key Components

#### 1. Backend (Ruby/Sinatra)
- **API Endpoints**: RESTful API for managing MIDI recordings (cassettes)
- **File Management**: Stores recordings as JSON files
- **CORS Support**: Enables cross-origin requests from the frontend

#### 2. Frontend (JavaScript/HTML/CSS)
- **MIDI Processing**: Parses MIDI messages from Bluetooth devices
- **MusicXML Rendering**: Uses OpenSheetMusicDisplay for sheet music visualization
- **Note Validation**: Compares played notes against sheet music
- **Visual Feedback**: Color-codes notes to show progress and errors

#### 3. Music Theory
- **Note Conversion**: Converts MIDI note numbers to musical notation
- **Score Extraction**: Parses MusicXML files to extract playable notes
- **Timing Analysis**: Tracks note timing and duration

## Technical Stack

### Backend
- **Framework**: Sinatra (Ruby web framework)
- **Dependencies**:
  - `sinatra`: Web framework
  - `json`: JSON processing
  - `fileutils`: File system operations
  - `puma`: Web server
  - `rack`: Web server interface

### Frontend
- **Libraries**:
  - `VexFlow`: Music notation rendering
  - `OpenSheetMusicDisplay`: MusicXML visualization
  - `Alpine.js`: Reactive UI framework
  - `Pico CSS`: Lightweight CSS framework

### Testing
- **Framework**: Minitest with Capybara
- **Driver**: Cuprite (headless Chrome)
- **Test Coverage**: MusicXML parsing, note extraction, playback

## Architecture

### Data Flow

```
MIDI Device → Web Bluetooth API → MIDI Message Parser → Note Validator → Visual Feedback
                          ↓
                     MusicXML Loader → Score Renderer → Note Extractor
                          ↓
                     Recording System → API → File Storage
```

### Key Files

- `app.rb`: Main Sinatra application with API endpoints
- `public/index.html`: Main HTML interface
- `public/js/app.js`: Alpine.js coordination layer (213 lines)
- `public/js/midi.js`: Bluetooth MIDI & recording (145 lines)
- `public/js/musicxml.js`: MusicXML parsing & validation (461 lines)
- `public/js/staff.js`: VexFlow rendering (103 lines)
- `public/js/cassettes.js`: Cassette management (106 lines)
- `public/js/bluetooth_midi_mock.js`: Mock implementation for testing
- `public/js/utils.js`: Utility functions
- `public/styles.css`: Custom styling
- `test/piano_trainer_test.rb`: Test suite

## Setup & Installation

### Prerequisites
- Ruby 3.0+
- Chrome/Edge browser (for Web Bluetooth API support)

### Installation

```bash
# Clone the repository
git clone git@github.com:isc/piano-trainer.git
cd piano-trainer

# Install Ruby dependencies
bundle install

# Start the server
ruby app.rb
```

The application will be available at `http://localhost:4567`

## Usage

### Basic Workflow

1. **Connect MIDI Device**:
   - Click "Scanner Bluetooth MIDI"
   - Select your MIDI device from the list
   - Grant Bluetooth permissions

2. **Load Sheet Music**:
   - Click "Charger partition MusicXML"
   - Select a MusicXML file from your computer
   - The sheet music will be displayed

3. **Practice Mode**:
   - Play notes on your MIDI keyboard
   - The system highlights correct notes in green
   - Incorrect notes show error messages
   - Progress is tracked in real-time

4. **Recording**:
   - Click "Démarrer enregistrement" to start recording
   - Play your performance
   - Click "Arrêter enregistrement" to stop
   - Enter a name for your recording

5. **Playback**:
   - Select a recording from the dropdown
   - Click "Rejouer cassette" to play it back

### Advanced Features

- **Modular Architecture**: Clean separation of concerns with 5 specialized JavaScript modules
- **Note Validation**: The system checks if you're playing the correct notes from the sheet music
- **Progress Tracking**: Shows which notes you've played correctly and what's next
- **Error Feedback**: Displays what note was expected vs. what you played
- **Completion Detection**: Shows a celebration message when you complete a piece
- **Callback System**: Loose coupling between modules via event callbacks

## API Documentation

### GET /api/cassettes

Lists all available MIDI recordings (cassettes).

**Response**:
```json
[
  {
    "name": "recording_name",
    "file": "cassettes/recording_name.json",
    "created_at": "2025-08-13T16:50:11+02:00"
  }
]
```

### POST /api/cassettes

Saves a new MIDI recording.

**Request Body**:
```json
{
  "name": "my_recording",
  "data": [
    {
      "timestamp": 100,
      "data": [144, 60, 100]  // MIDI message
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Cassette sauvegardée avec succès",
  "file": "cassettes/my_recording.json"
}
```

## MusicXML Processing

The application extracts musical information from MusicXML files:

1. **Note Extraction**: Parses pitch, duration, and timing information
2. **Measure Analysis**: Organizes notes by measure
3. **Validation**: Converts to MIDI note numbers for comparison
4. **Visualization**: Renders sheet music with OpenSheetMusicDisplay

### Supported MusicXML Elements

- `<note>`: Individual musical notes
- `<pitch>`: Note pitch (step + octave)
- `<duration>`: Note duration
- `<measure>`: Musical measures
- `<part>`: Instrument parts

## MIDI Processing

### MIDI Message Format

The application handles standard MIDI messages:

- **Note On**: `144` (0x90) - Note pressed
- **Note Off**: `128` (0x80) - Note released
- **Note Number**: 0-127 (MIDI note range)
- **Velocity**: 0-127 (how hard the note is played)

### Bluetooth MIDI Format

The application parses BLE MIDI messages which include:

- Header byte (154-157)
- Timestamp bytes
- Status byte (Note On/Off)
- Note number
- Velocity

## Development

### Running Tests

```bash
# Run the test suite
bundle exec ruby test/piano_trainer_test.rb

# Run with UI (non-headless)
DISABLE_HEADLESS=1 bundle exec ruby test/piano_trainer_test.rb
```

### Test Files

- `test/fixtures/simple-score.xml`: Basic 4-note test score
- `test/fixtures/schumann-melodie.xml`: Complex multi-part score (256 notes)
- `public/cassettes/*.json`: Various cassette files for playback testing

### Debugging

- Browser console logs show MIDI message parsing
- Test logs capture browser output
- Error messages display in the UI for user feedback

## Browser Compatibility

### Required Features

- **Web Bluetooth API**: Chrome 56+, Edge 79+, Opera 43+
- **ES6 Modules**: Modern browsers
- **Fetch API**: Modern browsers

### Recommended Browsers

- Chrome 90+
- Edge 90+
- Opera 76+

## Troubleshooting

### Roland FP-30X Bluetooth MIDI Connection

If you're using a Roland FP-30X (or FP-30) keyboard and it doesn't appear in the Bluetooth MIDI device list after clicking "Scanner Bluetooth MIDI":

1. On your keyboard, press and hold the **Bluetooth** button together with the **first black key** (F#/Gb), then release both
2. Press **Bluetooth** again together with the **first white key** (F), then release both
3. Your keyboard should now reappear in the list of available Bluetooth MIDI devices

This procedure resets the Bluetooth connection state on the keyboard and allows it to be rediscovered by your browser.

```
piano-trainer/
├── app.rb                  # Main Sinatra application
├── public/
│   ├── index.html         # Main HTML interface
│   ├── js/                # JavaScript modules
│   │   ├── app.js         # Alpine.js coordination
│   │   ├── midi.js        # Bluetooth MIDI & recording
│   │   ├── musicxml.js    # MusicXML parsing & validation
│   │   ├── staff.js       # VexFlow rendering
│   │   ├── cassettes.js   # Cassette management
│   │   ├── bluetooth_midi_mock.js  # Mock for testing
│   │   └── utils.js       # Utility functions
│   ├── styles.css         # Custom styles
│   ├── cassettes/         # MIDI recordings
│   └── vendor/            # Third-party libraries
├── test/
│   ├── fixtures/          # Test MusicXML files
│   │   ├── simple-score.xml
│   │   └── schumann-melodie.xml
│   ├── piano_trainer_test.rb
│   └── test_helper.rb
└── Gemfile                # Ruby dependencies
```

## Contributing

### Guidelines

1. **Code Style**: Follow existing patterns and conventions
2. **Testing**: Add tests for new features
3. **Documentation**: Update docs for changes
4. **Compatibility**: Ensure cross-browser support

### Areas for Improvement

- **Mobile Support**: Better mobile UI
- **Additional Instruments**: Support for bass clef, percussion
- **Advanced Features**: Tempo detection, metronome
- **Export Options**: Export recordings to standard formats

## License

[MIT License](https://opensource.org/licenses/MIT)

## Credits

- **VexFlow**: Music notation rendering
- **OpenSheetMusicDisplay**: MusicXML visualization
- **Alpine.js**: Reactive UI framework
- **Pico CSS**: Lightweight styling

## Support

For issues, questions, or contributions, please open an issue or pull request on the GitHub repository.
