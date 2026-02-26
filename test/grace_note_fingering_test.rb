require_relative 'test_helper'

class GraceNoteFingeringTest < CapybaraTestBase
  # Uses the real Chopin Waltz which has grace notes at measure 13
  SCORE_URL = 'scores/Waltz_in_A_MinorChopin.mxl'

  def setup
    page.driver.set_cookie('test-env', 'true')
  end

  def test_add_fingering_to_grace_note_appears_immediately
    visit "/score.html?url=#{SCORE_URL}"
    wait_for_render

    text_count_before = svg_text_count

    # Click the first grace note notehead in measure 13
    click_grace_note_in_measure(13)
    assert_selector 'dialog#fingeringModal[open]'
    click_button '3'
    click_button '✓ Valider'
    assert_no_selector 'dialog#fingeringModal[open]'

    # The fingering text should appear immediately without page refresh
    assert svg_text_count > text_count_before,
           "Fingering text did not appear (SVG text count: #{text_count_before} before, #{svg_text_count} after)"
  end

  private

  def wait_for_render
    assert_selector '#score[data-render-complete]'
  end

  def svg_text_count
    page.evaluate_script('document.querySelectorAll("svg text").length')
  end

  def click_grace_note_in_measure(measure_number)
    page.evaluate_script(<<~JS)
      (() => {
        const osmd = window.osmdInstance;
        const measure = osmd.Sheet.SourceMeasures.find(m => m.MeasureNumberXML === #{measure_number});
        const graceNote = measure.verticalSourceStaffEntryContainers[0].staffEntries[0].voiceEntries[0].notes[0];
        const svgGroup = osmd.rules.GNote(graceNote).getSVGGElement();
        svgGroup.querySelector('.vf-notehead').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      })()
    JS
  end
end
