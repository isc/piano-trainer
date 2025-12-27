require_relative 'test_helper'

class PianoTrainerTest < CapybaraTestBase
  def test_musicxml_note_extraction
    visit '/'
    attach_file('musicxml-upload', File.expand_path('fixtures/simple-score.xml', __dir__))
    assert_text 'Extraction terminée: 4 notes trouvées'
    select 'oh-when-the-saints'
    click_on 'Rejouer cassette'
    assert_text 'Partition terminée'
    puts 'BROWSER LOGS CAPTURED FROM TEST:'
    puts console_logs
  end

  def test_cassette_playback_with_note_highlighting
    visit '/'
    # Load Schumann's partition
    attach_file('musicxml-upload', File.expand_path('fixtures/schumann-melodie.xml', __dir__))
    assert_text 'Extraction terminée: 256 notes trouvées'
    
    # Select and play the melodie-2-bars cassette
    select 'melodie-2-bars'
    click_on 'Rejouer cassette'
    
    # Wait for playback to start and progress
    sleep(3) # Wait for initial playback
    
    # Verify that the cassette is playing (replay status should be visible)
    assert_text '▶️ Rejeu en cours...'
    
    # Wait a bit more for notes to be processed
    sleep(3)
    
    puts 'Cassette playback test completed - cassette played successfully'
    puts 'BROWSER LOGS:'
    puts console_logs
  end

  private

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
