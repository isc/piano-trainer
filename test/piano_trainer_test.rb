require_relative 'test_helper'

class PianoTrainerTest < CapybaraTestBase
  def test_musicxml_note_extraction
    load_score('simple-score.xml', 1, 4)
    select 'oh-when-the-saints'
    click_on 'Rejouer cassette'
    assert_text 'Partition terminée'
  end

  def test_cassette_playback_with_note_highlighting
    load_score('schumann-melodie.xml', 20, 256)

    assert_selector 'svg g.vf-stavenote', count: 256
    assert_no_selector 'svg g.vf-stavenote.played-note'

    select 'melodie-2-bars'
    click_on 'Rejouer cassette'
    assert_text '▶️ Rejeu en cours...'

    assert_selector 'svg g.vf-stavenote.played-note', count: 5
    assert first('svg g.vf-stavenote')[:class].include?('played-note')
  end

  def test_notes_must_be_played_in_correct_order
    load_score('simple-score.xml', 1, 4)

    assert_selector 'svg g.vf-stavenote', count: 4
    assert_no_selector 'svg g.vf-stavenote.played-note'

    select 'simple-score-wrong-order'
    click_on 'Rejouer cassette'
    assert_text '▶️ Rejeu en cours...'

    assert_no_text '▶️ Rejeu en cours...'
    assert_selector 'svg g.vf-stavenote.played-note', count: 3
    assert_no_text 'Partition terminée'
  end

  def test_training_mode_repeats_same_measure
    load_score('simple-score.xml', 1, 4)

    assert_selector 'svg g.vf-stavenote', count: 4
    assert_no_selector 'svg g.vf-stavenote.played-note'

    click_on 'Mode Entraînement'
    assert_text 'Mode Entraînement Actif'

    select 'simple-score-3-repeats'
    click_on 'Rejouer cassette'
    assert_text '▶️ Rejeu en cours...'

    # Verify visual transitions during playback
    assert_selector 'svg g.vf-stavenote.played-note', count: 4  # After 1st repetition
    assert_selector 'svg g.vf-stavenote.played-note', count: 0  # After automatic reset (500ms)
    assert_selector 'svg g.vf-stavenote.played-note', minimum: 1, maximum: 3  # During 2nd repetition

    assert_no_text '▶️ Rejeu en cours...', wait: 10
    assert_text 'Félicitations'
    assert_text 'complété toutes les mesures'
  end

  # TODO: Implement test for training mode note order validation with direct MIDI events
  # def test_training_mode_validates_note_order_on_each_repeat
  #   This test would require simulating MIDI events directly through the app's
  #   onNotePlayed callback, which needs further investigation to implement correctly
  # end

  private

  def load_score(filename, expected_measures, expected_notes)
    visit '/'
    attach_file('musicxml-upload', File.expand_path("fixtures/#{filename}", __dir__))
    assert_text "Extraction terminée: #{expected_measures} mesures, #{expected_notes} notes"
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
