require_relative 'test_helper'

class FingeringAnnotationTest < CapybaraTestBase
  SCORE_URL = '/test-fixtures/simple-score.xml'

  def setup
    page.driver.set_cookie('test-env', 'true')
    visit "/score.html?url=#{SCORE_URL}"
  end

  def test_add_fingering_and_persist_after_reload
    wait_for_render
    find('svg g.vf-notehead', match: :first).click
    click_button '3'
    wait_for_render
    assert_fingering '3'

    # Reload and verify persistence
    visit "/score.html?url=#{SCORE_URL}"
    wait_for_render
    assert_fingering '3'
  end

  private

  def wait_for_render
    assert_selector '#score[data-render-complete]'
  end

  def assert_fingering(text)
    assert_selector 'svg g.vf-text', text: text
  end
end
