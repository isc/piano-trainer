require_relative 'test_helper'
require 'net/http'
require 'uri'
require 'json'

class PianoTrainerTest < CapybaraTestBase
  def test_play_simple_score_till_the_end
    load_score('simple-score.xml', 1, 4)
    replay_cassette('oh-when-the-saints')
    assert_text 'Partition terminée'
  end

  def test_note_highlighting_when_playing_complex_score
    load_score('schumann-melodie.xml', 20, 256)
    assert_no_selector 'svg g.vf-stavenote.played-note'

    replay_cassette('melodie-2-bars')

    assert_selector 'svg g.vf-stavenote.played-note', count: 5
    assert first('svg g.vf-stavenote')[:class].include?('played-note')
  end

  def test_notes_must_be_played_in_correct_order
    load_score('simple-score.xml', 1, 4)
    assert_no_selector 'svg g.vf-stavenote.played-note'

    replay_cassette('simple-score-wrong-order')

    assert_no_text '▶️ Rejeu en cours...'
    assert_selector 'svg g.vf-stavenote.played-note', count: 3
    assert_no_text 'Partition terminée'
  end

  def test_training_mode_repeats_same_measure
    load_score('simple-score.xml', 1, 4)

    click_on 'Mode Entraînement'
    assert_text 'Mode Entraînement Actif'

    # Verify measure highlight rectangle is present in training mode
    assert_selector 'svg rect#measure-highlight-rect'

    replay_cassette('simple-score-3-repeats')

    # Verify visual transitions during playback
    assert_selector 'svg g.vf-stavenote.played-note', count: 4  # After 1st repetition
    assert_selector 'svg g.vf-stavenote.played-note', count: 0  # After automatic reset (500ms)
    assert_selector 'svg g.vf-stavenote.played-note', minimum: 1, maximum: 3  # During 2nd repetition

    assert_no_text '▶️ Rejeu en cours...', wait: 4
    assert_text 'Félicitations'
    assert_text 'complété toutes les mesures'
  end

  def test_training_mode_requires_clean_repetitions
    load_score('simple-score.xml', 1, 4)

    click_on 'Mode Entraînement'
    assert_text 'Mode Entraînement Actif'

    replay_cassette('simple-score-with-mistakes')

    assert_no_text '▶️ Rejeu en cours...', wait: 4

    # The cassette has 3 repetitions: clean, dirty (D instead of F), clean
    # Only 2 clean repetitions count, so training should NOT complete
    # Check repeat indicators: 2 filled circles, 1 empty
    assert_selector 'svg circle.repeat-indicator', count: 3
    assert_selector 'svg circle.repeat-indicator.filled', count: 2
    assert_no_text 'Félicitations'
    assert_no_text 'complété toutes les mesures'
  end

  def test_loading_new_score_replaces_previous_one
    # Load first score
    load_score('simple-score.xml', 1, 4)
    assert_text 'Simple Score'
    assert_text 'Mesure: 1/1'

    # Load second score - should replace the first one
    load_score('schumann-melodie.xml', 20, 256)
    assert_text 'Melodie'
    assert_text 'Mesure: 1/20'

    # First score should no longer be visible
    assert_no_text 'Simple Score'
    assert_no_text 'Mesure: 1/1'
  end

  def test_training_mode_allows_jumping_to_specific_measure
    load_score('schumann-melodie.xml', 20, 256)

    click_on 'Mode Entraînement'

    # Measure 1 should be highlighted by default
    initial_rect_x = page.find('svg rect#measure-highlight-rect')['x'].to_f

    # Click on a note in measure 2 (measureIndex=1 in 0-based indexing)
    measure_2_note = page.first('svg g.vf-stavenote[data-measure-index="1"]')
    measure_2_note.trigger('click')

    # Verify the highlight rectangle moved to measure 2
    new_rect_x = page.find('svg rect#measure-highlight-rect')['x'].to_f
    assert new_rect_x != initial_rect_x, "Highlight rectangle should have moved"

    # Play first note of measure 2 (A4 = MIDI 69)
    replay_cassette('melodie-measure-2-first-note')

    # Verify that exactly one note was validated
    assert_selector 'svg g.vf-stavenote.played-note', count: 1
  end

  def test_cassette_recording_saves_valid_midi_data
    # Note: setup() already calls visit '/' and sets test-env cookie
    # The cookie triggers automatic loading of Bluetooth mock in midi.js

    cassette_name = "test-recording-#{Time.now.to_i}"

    begin
      # Load score
      attach_file('musicxml-upload', File.expand_path('fixtures/simple-score.xml', __dir__))
      assert_text 'Extraction terminée: 1 mesures, 4 notes'

      # Connect to mock Bluetooth MIDI device
      click_on 'Scanner Bluetooth MIDI'
      sleep 0.5

      # Verify recording button appears (indicates successful connection)
      assert_button 'Démarrer enregistrement', wait: 2
      click_on 'Démarrer enregistrement'
      assert_text 'Enregistrement en cours'

      # Simulate MIDI events via custom events
      midi_data = [
        [154, 135, 144, 60, 80],  # Note ON C4
        [154, 245, 128, 60, 64],  # Note OFF C4
        [156, 145, 144, 64, 80],  # Note ON E4
        [156, 227, 128, 64, 64],  # Note OFF E4
      ]

      midi_data.each do |data|
        simulate_midi_input(data)
        sleep 0.1
      end

      # Wait for all events to be processed
      sleep 0.3

      # Override prompt to automatically provide cassette name
      page.execute_script(<<~JS)
        window._originalPrompt = window.prompt;
        window.prompt = () => '#{cassette_name}';
      JS

      # Accept the success alert that will appear after stopping recording
      accept_alert do
        click_on 'Arrêter enregistrement'
      end

      sleep 0.3

      # Fetch the saved cassette and verify it contains valid MIDI data
      response = Net::HTTP.get_response(URI("http://localhost:#{Capybara.current_session.server.port}/cassettes/#{cassette_name}.json"))

      assert_equal '200', response.code, 'Cassette file should exist'

      cassette_data = JSON.parse(response.body)
      assert cassette_data['data'].length > 0, 'Cassette should contain MIDI events'

      # Verify that each event has non-empty data array
      cassette_data['data'].each_with_index do |event, index|
        assert event['data'].is_a?(Array), "Event #{index} should have data array"
        assert event['data'].length > 0, "Event #{index} should have non-empty data array (bug: array reference not copied)"
      end
    ensure
      # Clean up: delete the test cassette file
      cassette_file = File.join(__dir__, '..', 'public', 'cassettes', "#{cassette_name}.json")
      File.delete(cassette_file) if File.exist?(cassette_file)
    end
  end

  private

  def load_score(filename, expected_measures, expected_notes)
    attach_file('musicxml-upload', File.expand_path("fixtures/#{filename}", __dir__))
    assert_text "Extraction terminée: #{expected_measures} mesures, #{expected_notes} notes"
    assert_selector 'svg g.vf-stavenote', count: expected_notes
  end

  def replay_cassette(name)
    select name
    click_on 'Rejouer cassette'
    assert_text '▶️ Rejeu en cours...'
  end

  # Helper method to display the browser console logs.
  # Should remain unused in committed files but can be used by the AI agent when debugging.
  def console_logs
    logs = page.driver.browser.options.logger.string
    logs.split("\n").map do |line|
      next if line.empty?

      first_character = line.strip[0]
      next if ['◀', '▶'].include? first_character

      line
    end.compact
  end
end
