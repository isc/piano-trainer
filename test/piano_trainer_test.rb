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
    
    # Get all stave notes and verify none are highlighted initially
    all_stave_notes = page.all('svg g.vf-stavenote')
    assert_operator all_stave_notes.count, :>, 0, 'Should have stave notes in the partition'
    
    initial_highlighted = all_stave_notes.select { |note| note[:class].include?('played-note') }
    assert_equal 0, initial_highlighted.count, 'No notes should be highlighted initially'
    
    # Select and play the melodie-2-bars cassette
    select 'melodie-2-bars'
    click_on 'Rejouer cassette'
    assert_text '▶️ Rejeu en cours...'
    
    # Wait for playback to process some notes
    sleep(2)
    
    # Get all stave notes again and check which ones are highlighted
    all_stave_notes_after = page.all('svg g.vf-stavenote')
    highlighted_after = all_stave_notes_after.select { |note| note[:class].include?('played-note') }
    
    # Verify that some notes are now highlighted
    assert_operator highlighted_after.count, :>, 0, 'Some notes should be highlighted after playback'
    
    # Verify that only early notes are highlighted (first part of partition)
    # Get the indices of highlighted notes
    highlighted_indices = highlighted_after.map { |note| all_stave_notes_after.index(note) }
    
    # All highlighted notes should be in the first part of the partition
    # The melodie-2-bars cassette plays the first few notes, so highlighted notes
    # should have relatively low indices (not in the middle or end of the partition)
    max_highlighted_index = highlighted_indices.max
    assert_operator max_highlighted_index, :<, all_stave_notes_after.count / 2, 
                   'Highlighted notes should be in the first part of the partition'
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
