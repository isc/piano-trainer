#!/usr/bin/env ruby
# scripts/generate_fingerprints.rb
#
# Generates public/data/fingerprints.json with the first notes of each score.
# Re-run after adding or removing scores from the library:
#   ruby scripts/generate_fingerprints.rb

require 'rexml/document'
require 'json'
require 'tmpdir'
require 'open3'

SCORES_JSON = File.join(__dir__, '..', 'public', 'data', 'scores.json')
SCORES_DIR  = File.join(__dir__, '..', 'public', 'scores')
OUTPUT_FILE = File.join(__dir__, '..', 'public', 'data', 'fingerprints.json')
NOTE_COUNT  = 20

STEP_SEMITONES = { 'C' => 0, 'D' => 2, 'E' => 4, 'F' => 5, 'G' => 7, 'A' => 9, 'B' => 11 }.freeze

def pitch_to_midi(step, alter, octave)
  12 * (octave.to_i + 1) + STEP_SEMITONES[step] + alter.to_i
end

def read_xml_from_mxl(path)
  Dir.mktmpdir do |tmpdir|
    _, err, status = Open3.capture3('unzip', '-q', path, '-d', tmpdir)
    unless status.success?
      warn "  unzip failed: #{err.chomp}"
      return nil
    end

    container_path = File.join(tmpdir, 'META-INF', 'container.xml')
    if File.exist?(container_path)
      container = REXML::Document.new(File.read(container_path))
      rootfile = REXML::XPath.first(container, '//rootfile')&.attributes['full-path']
      if rootfile
        xml_path = File.join(tmpdir, rootfile)
        return File.read(xml_path) if File.exist?(xml_path)
      end
    end

    # Fallback: first XML that isn't container.xml
    xml_files = Dir.glob(File.join(tmpdir, '**', '*.xml'))
      .reject { |f| f.end_with?('container.xml') }
    xml_files.empty? ? nil : File.read(xml_files.first)
  end
rescue => e
  warn "  read_xml_from_mxl error: #{e.message}"
  nil
end

def extract_notes(xml_content)
  doc = REXML::Document.new(xml_content)
  notes = []

  part = REXML::XPath.first(doc.root, './/part')
  return notes unless part

  REXML::XPath.each(part, 'measure/note') do |note|
    next if note.elements['rest']
    next if note.elements['grace']
    next if note.elements['chord']

    staff = note.elements['staff']&.text&.to_i
    next if staff && staff != 1

    voice = note.elements['voice']&.text&.to_i || 1
    next if voice != 1

    has_stop  = REXML::XPath.first(note, "tie[@type='stop']")
    has_start = REXML::XPath.first(note, "tie[@type='start']")
    next if has_stop && !has_start

    pitch = note.elements['pitch']
    next unless pitch

    step   = pitch.elements['step']&.text
    alter  = pitch.elements['alter']&.text&.to_i || 0
    octave = pitch.elements['octave']&.text
    next unless step && octave && STEP_SEMITONES.key?(step)

    notes << pitch_to_midi(step, alter, octave)
    break if notes.length >= NOTE_COUNT
  end

  notes
rescue REXML::ParseException => e
  warn "  XML parse error: #{e.message.lines.first&.chomp}"
  []
end

# Main
data = JSON.parse(File.read(SCORES_JSON))
fingerprints = []
errors = []

data['scores'].each do |score|
  file_path = File.join(SCORES_DIR, score['file'])

  unless File.exist?(file_path)
    errors << "File not found: #{score['file']}"
    next
  end

  xml = score['file'].end_with?('.mxl') ? read_xml_from_mxl(file_path) : File.read(file_path)

  if xml.nil?
    errors << "Could not read: #{score['file']}"
    next
  end

  notes = extract_notes(xml)

  if notes.length < 3
    errors << "Too few notes (#{notes.length}): #{score['file']}"
    next
  end

  fingerprints << {
    'file'     => score['file'],
    'title'    => score['title'],
    'composer' => score['composer'],
    'notes'    => notes,
  }

  puts "#{score['title'].ljust(55)} #{notes.inspect}"
end

unless errors.empty?
  warn "\n#{errors.length} warning(s):"
  errors.each { |e| warn "  ! #{e}" }
end

File.write(OUTPUT_FILE, JSON.pretty_generate({ 'fingerprints' => fingerprints }))
puts "\nGenerated #{fingerprints.length}/#{data['scores'].length} fingerprints → #{OUTPUT_FILE}"
