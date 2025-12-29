require_relative 'test_helper'

class PianoTrainerTest < CapybaraTestBase
  def test_play_simple_score_till_the_end
    load_score('simple-score.xml', 1, 4)
    replay_cassette('oh-when-the-saints')
    assert_text 'Partition terminée'
  end

  def test_note_highlighting_when_playing_complex_score
    load_score('schumann-melodie.xml', 20, 256)

    assert_selector 'svg g.vf-stavenote', count: 256
    assert_no_selector 'svg g.vf-stavenote.played-note'

    replay_cassette('melodie-2-bars')

    assert_selector 'svg g.vf-stavenote.played-note', count: 5
    assert first('svg g.vf-stavenote')[:class].include?('played-note')
  end

  def test_notes_must_be_played_in_correct_order
    load_score('simple-score.xml', 1, 4)

    assert_selector 'svg g.vf-stavenote', count: 4
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
    assert_text 'Répétition: 2/3'
    assert_no_text 'Félicitations'
    assert_no_text 'complété toutes les mesures'
  end

  def test_loading_new_score_replaces_previous_one
    # Load first score
    load_score('simple-score.xml', 1, 4)
    assert_text 'Simple Score'
    assert_text 'Mesure: 1/1'
    assert_selector 'svg g.vf-stavenote', count: 4

    # Load second score - should replace the first one
    attach_file('musicxml-upload', File.expand_path('fixtures/schumann-melodie.xml', __dir__))
    assert_text 'Extraction terminée: 20 mesures, 256 notes'
    assert_text 'Melodie'
    assert_text 'Mesure: 1/20'
    assert_selector 'svg g.vf-stavenote', count: 256

    # First score should no longer be visible
    assert_no_text 'Simple Score'
    assert_no_text 'Mesure: 1/1'
  end

  private

  def load_score(filename, expected_measures, expected_notes)
    visit '/'
    attach_file('musicxml-upload', File.expand_path("fixtures/#{filename}", __dir__))
    assert_text "Extraction terminée: #{expected_measures} mesures, #{expected_notes} notes"
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
