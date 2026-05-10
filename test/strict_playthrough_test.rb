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

  def test_perfect_play_reports_100_percent
    load_score('chord.xml', 1)

    # BPM=120 → 2s count-in, ±150ms strict window, ±450ms off-tempo.
    fill_in 'Tempo en BPM', with: '120'
    click_on '⏱ Mode strict'

    # Sync on the engine opening the timing window (cursor arrival at T=2s).
    assert_selector 'svg g.vf-notehead.expected-note', wait: 4

    play_chord(%w[C4 E4 G4])

    assert_text 'Playthrough strict terminé', wait: 2
    assert_text '100%'
    assert_text '3 sur 3'
    assert_no_text 'fausses notes'
    assert_no_text 'manquées'
    assert_no_text 'hors tempo'
  end

  def test_no_input_marks_all_notes_missed
    load_score('chord.xml', 1)
    fill_in 'Tempo en BPM', with: '120'

    click_on '⏱ Mode strict'

    # Count-in 2s + off-tempo window 450ms + 300ms tail. Headroom = 4s.
    assert_text 'Playthrough strict terminé', wait: 4
    assert_text '0%'
    assert_text '3 manquées'
  end

  # Regression: when the cursor crosses a repeat barline, free mode wipes the
  # whole upcoming repeat section. Strict mode must do the same — clearing only
  # the entered measure leaves later notes in the section showing first-pass
  # results until the cursor walks into them.
  def test_repeat_clears_whole_section_at_boundary_not_per_measure
    load_score('repeat-endings.xml', 4)
    fill_in 'Tempo en BPM', with: '120'
    click_on '⏱ Mode strict'

    # First pass: play m1 (C4), m2 (D4), m3 (E4) correctly. Each is a whole
    # note → 2s/measure at BPM=120. Land ~T=2,4,6.
    assert_selector 'svg g.vf-notehead.expected-note', wait: 4
    play_chord(%w[C4])
    sleep 2
    play_chord(%w[D4])
    sleep 2
    play_chord(%w[E4])

    # After E4, the cursor jumps back to m1 at T~8s and the boundary reset
    # fires. Only E4 (volta-1, never replayed) should still show played-note.
    # Polling assertion gives the engine a few seconds to reach the boundary.
    assert_selector 'svg g.vf-notehead.played-note', count: 1, wait: 4

    # Let the run finish so teardown is clean.
    assert_text 'Playthrough strict terminé', wait: 12
  end
end
