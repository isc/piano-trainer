require_relative 'test_helper'

class PracticeTrackingTest < CapybaraTestBase
  def setup
    page.driver.set_cookie('test-env', 'true')
  end

  def test_score_complete_modal_shows_time_and_ranking
    visit "/score.html?url=/test-fixtures/two-measures.xml"
    assert_selector 'svg g.vf-stavenote', count: 2
    sleep 0.2

    # First playthrough
    play_notes(%w[C4 D4])
    assert_selector 'dialog[open]'
    assert_text 'Partition terminée'
    assert_selector 'p strong' # Time display (no table yet for first playthrough)

    # Close modal
    find('button[aria-label="Close"]').click
    assert_no_selector 'dialog[open]'
    sleep 0.5 # Wait for session to be saved

    # Second playthrough
    play_notes(%w[C4 D4])

    # Verify modal shows ranking table with both playthroughs
    assert_selector 'dialog[open]'
    sleep 0.3 # Wait for async data loading
    assert_selector 'table tbody tr', minimum: 2
    assert_text 'maintenant'
  end

  def test_daily_log_shows_practiced_score
    # Play a score to generate practice data
    visit "/score.html?url=/test-fixtures/simple-score.xml"
    assert_selector 'svg g.vf-stavenote', count: 4
    sleep 0.2 # Wait for callbacks to initialize

    # Play the complete score (C4, E4, F4, G4)
    %w[C4 E4 F4 G4].each do |note|
      simulate_midi_input("ON #{note}")
      simulate_midi_input("OFF #{note}")
      sleep 0.05
    end

    # Wait for score complete modal (dialog[open])
    assert_selector 'dialog[open]'
    sleep 0.3

    # Go to library and check daily log
    visit '/index.html'

    # Verify daily log shows today's practice
    within '#daily-log' do
      assert_text "aujourd'hui"
      assert_text 'Simple Score' # Score title from fixture
    end
  end

end
