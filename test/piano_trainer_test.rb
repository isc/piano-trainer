require_relative "test_helper"

class PianoTrainerTest < CapybaraTestBase
  def test_musicxml_note_extraction
    visit "/"
    attach_file("musicxml-upload", File.expand_path("fixtures/simple-score.xml", __dir__))
    assert_text "Extraction terminée: 1 mesures, 4 notes"
    select "oh-when-the-saints"
    click_on "Rejouer cassette"
    assert_text "Partition terminée"
  end

  def test_cassette_playback_with_note_highlighting
    visit "/"
    attach_file("musicxml-upload", File.expand_path("fixtures/schumann-melodie.xml", __dir__))
    assert_text "Extraction terminée: 20 mesures, 256 notes"

    assert_selector "svg g.vf-stavenote", count: 256
    assert_no_selector "svg g.vf-stavenote.played-note"

    select "melodie-2-bars"
    click_on "Rejouer cassette"
    assert_text "▶️ Rejeu en cours..."

    assert_selector "svg g.vf-stavenote.played-note", count: 5
    assert first("svg g.vf-stavenote")[:class].include?("played-note")
  end

  private

  # Helper method to display the browser console logs.
  # Should remain unused in committed files but can be used by the AI agent when debugging.
  def console_logs
    logs = page.driver.browser.options.logger.string
    logs.split("\n").map do |line|
      next if line.empty?

      first_character = line.strip[0]
      next if ["◀", "▶"].include? first_character

      line
    end.compact
  end
end
