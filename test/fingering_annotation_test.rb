require_relative 'test_helper'

class FingeringAnnotationTest < CapybaraTestBase
  SCORE_URL = '/test-fixtures/simple-score.xml'
  PICKUP_SCORE_URL = '/test-fixtures/pickup-measure-score.xml'

  def setup
    page.driver.set_cookie('test-env', 'true')
  end

  def test_add_fingering_and_persist_after_reload
    visit "/score.html?url=#{SCORE_URL}"
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

  def test_fingering_on_pickup_measure_persists_correctly
    visit "/score.html?url=#{PICKUP_SCORE_URL}"
    wait_for_render

    # Click on the first note (in the pickup measure)
    find('svg g.vf-notehead', match: :first).click
    click_button '2'
    wait_for_render
    assert_fingering '2'

    # Reload and verify the fingering is still on the pickup measure note
    visit "/score.html?url=#{PICKUP_SCORE_URL}"
    wait_for_render
    assert_fingering '2'

    # Verify fingering is positioned near the pickup measure (first notehead)
    first_note_x, = find('svg g.vf-notehead', match: :first).native.node.find_position
    fingering_x, = find('svg g.vf-text', text: '2').native.node.find_position

    # Fingering should be within 50px of the first note (not shifted to next measure)
    assert (fingering_x - first_note_x).abs < 50,
           "Fingering should be near the pickup measure note (x=#{first_note_x}), not shifted (fingering x=#{fingering_x})"
  end

  private

  def wait_for_render
    assert_selector '#score[data-render-complete]'
  end

  def assert_fingering(text)
    assert_selector 'svg g.vf-text', text: text
  end
end
