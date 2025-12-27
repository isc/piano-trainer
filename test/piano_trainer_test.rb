require_relative 'test_helper'

class PianoTrainerTest < CapybaraTestBase
  def test_musicxml_note_extraction
    visit '/'
    attach_file('musicxml-upload', File.expand_path('../simple-score.xml', __dir__))
    assert_text 'Extraction terminée: 4 notes trouvées'
    select 'oh-when-the-saints'
    click_on 'Rejouer cassette'
    assert_text 'Partition terminée'
    puts 'BROWSER LOGS CAPTURED FROM TEST:'
    puts console_logs
  end

  def test_musicxml_note_extraction_two_parts
    visit '/'
    attach_file('musicxml-upload', File.expand_path('../schumann-melodie.xml', __dir__))
    assert_text 'Extraction terminée: 256 notes trouvées'
    select 'oh-when-the-saints'
    click_on 'Rejouer cassette'
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
