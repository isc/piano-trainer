require_relative 'test_helper'

class StrictPlaythroughTest < CapybaraTestBase
  def setup
    page.driver.set_cookie('test-env', 'true')
    visit '/score.html'
  end

  def test_strict_mode_button_starts_and_stops_engine
    load_score('chord.xml', 1)

    click_on '⏱ Mode strict'
    assert_text '⏹ Stop strict'

    click_on '⏹ Stop strict'
    assert_text '⏱ Mode strict'
    # Aborted runs do not surface the result modal
    assert_no_text 'Playthrough strict terminé'
  end

  def test_perfect_play_at_slow_tempo_reports_100_percent
    load_score('chord.xml', 1)

    # BPM=30 → 8s count-in, ±450ms off-tempo window. Generous timing budget.
    fill_in 'Tempo en BPM', with: '30'
    click_on '⏱ Mode strict'

    # Wait for the engine to open the timing window (cursor arrival at T=8s).
    assert_selector 'svg g.vf-notehead.expected-note', wait: 10

    play_note('C4')
    play_note('E4')
    play_note('G4')

    assert_text 'Playthrough strict terminé', wait: 3
    assert_text '100%'
    assert_text '3 / 3'
    assert_no_text 'mauvaises notes'
    assert_no_text 'manquées'
    assert_no_text 'hors tempo'
  end

  def test_no_input_marks_all_notes_missed
    load_score('chord.xml', 1)
    fill_in 'Tempo en BPM', with: '30'

    click_on '⏱ Mode strict'

    # Count-in 8s + off-tempo window 450ms + 300ms tail. Wait headroom = 12s.
    assert_text 'Playthrough strict terminé', wait: 12
    assert_text '0%'
    assert_text '3 notes manquées'
  end
end
