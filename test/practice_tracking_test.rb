require_relative 'test_helper'

class PracticeTrackingTest < CapybaraTestBase
  def setup
    page.driver.set_cookie('test-env', 'true')
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
      assert_text "Aujourd'hui"
      assert_text 'Simple Score' # Score title from fixture
    end
  end
end
