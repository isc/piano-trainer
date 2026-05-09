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

    # Land in the strict ±150ms window after the 8s count-in.
    sleep 8
    play_note('C4')
    play_note('E4')
    play_note('G4')

    # Wait past the off-tempo close + 300ms tail.
    sleep 1.2

    assert_text 'Playthrough strict terminé'
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

    # Count-in 8s + chord at T=8s + off-tempo window 450ms + tail 300ms = ~8.75s
    sleep 9.5

    assert_text 'Playthrough strict terminé'
    assert_text '0%'
    assert_text '3 notes manquées'
  end
end
