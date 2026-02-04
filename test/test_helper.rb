require 'time'
require 'capybara'
require 'capybara/dsl'
require 'capybara/minitest'
require 'minitest/autorun'
require 'rack'
require 'capybara/cuprite'
require 'logger'
require_relative '../app'

Capybara.app = App

# Configure download directory for tests
DOWNLOAD_DIR = Dir.mktmpdir

Capybara.register_driver(:cuprite) do |app|
  Capybara::Cuprite::Driver.new(
    app,
    headless: !ENV['DISABLE_HEADLESS'],
    logger: StringIO.new,
    browser_options: { 'disable-gpu' => nil },
    save_path: DOWNLOAD_DIR
  )
end
Capybara.default_driver = :cuprite
Capybara.enable_aria_label = true

# Clean up download directory at exit
at_exit { FileUtils.rm_rf(DOWNLOAD_DIR) }

class CapybaraTestBase < Minitest::Test
  include Capybara::DSL
  include Capybara::Minitest::Assertions

  # Wait for a file matching pattern to appear in download dir
  def wait_for_download(pattern, timeout: Capybara.default_max_wait_time)
    Timeout.timeout(timeout) do
      loop do
        file = Dir.glob(File.join(DOWNLOAD_DIR, pattern)).first
        return file if file
        sleep 0.05
      end
    end
  rescue Timeout::Error
    nil
  end

  # Helper to run code with a virtual browser time
  # Accepts a Time object or a string like "2026-01-10 12:00"
  # Resets the browser page after the block to restore normal time behavior
  def with_virtual_time(time)
    time = Time.parse(time) if time.is_a?(String)
    page.driver.browser.page.command('Emulation.setVirtualTimePolicy',
      policy: 'advance',
      initialVirtualTime: time.to_i
    )
    yield
  ensure
    Capybara.current_session.reset!
  end

  # Helper to simulate MIDI input events
  # Example: simulate_midi_input("ON C4") or simulate_midi_input("OFF C4")
  def simulate_midi_input(notation)
    data_array = parse_midi_notation(notation)
    page.execute_script(<<~JS)
      const event = new CustomEvent('mock-midi-input', {
        detail: { data: #{data_array.to_json} }
      });
      window.dispatchEvent(event);
    JS
  end

  # Helper to play a single note (ON + OFF)
  def play_note(note)
    simulate_midi_input("ON #{note}")
    simulate_midi_input("OFF #{note}")
  end

  # Helper to play a sequence of notes
  def play_notes(notes)
    notes.each do |note|
      play_note(note)
      sleep 0.05
    end
  end

  # Helper to load a score from test fixtures
  def load_score(filename, expected_notes)
    attach_file('musicxml-upload', File.expand_path("fixtures/#{filename}", __dir__))
    assert_selector '#score[data-render-complete]'
    assert_selector 'svg g.vf-stavenote', count: expected_notes
    sleep 0.05  # Wait for DOM and callbacks to fully initialize
  end

  # Helper to click on a measure in the score
  def click_measure(measure_number)
    page.all('svg rect.measure-click-area')[measure_number - 1].trigger('click')
  end

  private

  def parse_midi_notation(notation)
    # Parse notation like "ON C4", "OFF C#4", or "ON G#5"
    match = notation.match(/^(ON|OFF)\s+([A-G]#?)(\d+)$/)
    raise "Invalid MIDI notation: #{notation}" unless match

    status_str, note_name, octave_str = match.captures
    status = status_str == 'ON' ? 144 : 128
    octave = octave_str.to_i
    velocity = status == 144 ? 80 : 64

    # Convert note name to MIDI note number
    note_map = { 'C' => 0, 'C#' => 1, 'D' => 2, 'D#' => 3, 'E' => 4, 'F' => 5,
                 'F#' => 6, 'G' => 7, 'G#' => 8, 'A' => 9, 'A#' => 10, 'B' => 11 }
    note_offset = note_map[note_name]
    raise "Invalid note name: #{note_name}" unless note_offset

    midi_note = (octave + 1) * 12 + note_offset
    [status, midi_note, velocity]
  end
end
