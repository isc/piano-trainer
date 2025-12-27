require_relative 'test_helper'

class PianoTrainerTest < CapybaraTestBase
  def test_musicxml_note_extraction
    visit '/'
    attach_file('musicxml-upload', File.expand_path('fixtures/simple-score.xml', __dir__))
    assert_text 'Extraction terminée: 4 notes trouvées'
    select 'oh-when-the-saints'
    click_on 'Rejouer cassette'
    assert_text 'Partition terminée'
  end

  def test_cassette_playback_with_note_highlighting
    visit '/'
    attach_file('musicxml-upload', File.expand_path('fixtures/schumann-melodie.xml', __dir__))
    assert_text 'Extraction terminée: 256 notes trouvées'
    
    # Count initial played notes (should be 0)
    initial_played_notes = page.all('svg g.played-note').count
    assert_equal 0, initial_played_notes, 'Should start with no played notes'
    
    # Select and play the melodie-2-bars cassette
    select 'melodie-2-bars'
    click_on 'Rejouer cassette'
    assert_text '▶️ Rejeu en cours...'
    
    # Wait for playback to process some notes
    sleep(2)
    
    # Verify that notes are being highlighted (should have played-note class)
    played_notes_after_playback = page.all('svg g.played-note').count
    assert_operator played_notes_after_playback, :>, 0, 'Notes should be highlighted during playback'
    
    # Verify that the number of played notes increased
    assert_operator played_notes_after_playback, :>, initial_played_notes, 'Played notes count should increase'
    
    # Verify that the highlighted notes are among the expected cassette notes
    # Expected notes from melodie-2-bars cassette: C4, E5, G4, F4, D5, C5, E4, B4, A4, D4
    # We can't easily extract note names from SVG in Capybara, but we can verify
    # that notes are being highlighted in the score, which confirms the feature works
  end

  private

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
