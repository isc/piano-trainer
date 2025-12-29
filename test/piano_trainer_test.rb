require_relative 'test_helper'

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

  private

  def load_score(filename, expected_measures, expected_notes)
    visit '/' unless page.has_selector?('main.container')
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
