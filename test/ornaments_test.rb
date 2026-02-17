require_relative 'test_helper'

class OrnamentsTest < CapybaraTestBase
  def setup
    page.driver.set_cookie('test-env', 'true')
    visit '/score.html'
  end

  def test_grace_notes_played_sequentially_before_main_note
    # Grace notes (ornaments) are played quickly before the main note.
    # They should be validated sequentially, NOT held together with the main note.
    # Score has: E4 (grace) -> F4 (grace) -> G4 (main)
    load_score('grace-note.xml', 3)

    # Play grace note E4 first
    play_note('E4')
    assert_selector 'svg g.vf-notehead.played-note', count: 1

    # Play grace note F4 second
    play_note('F4')
    assert_selector 'svg g.vf-notehead.played-note', count: 2

    # Play main note G4 last
    play_note('G4')
    assert_selector 'svg g.vf-notehead.played-note', count: 3

    # Score should be completed
    assert_text 'Partition terminée'
  end

  def test_turn_ornament_notes_expanded_sequentially
    # Tests two turns in Eb major:
    # 1. C5 with accidentals (Db above, B natural below): C5, Db5, C5, B4, C5
    #    → Verifies accidentals override diatonic intervals
    # 2. Eb5 without accidentals: F5, Eb5, D5, Eb5
    #    → Verifies diatonic intervals respect key signature (Nocturne bug fix)
    #    → D5 is 1 semitone below Eb, NOT Db which would be 2 semitones
    load_score('turn-ornament.xml', 3)

    click_on 'Mode Entraînement'
    assert_text 'Mode Entraînement Actif'

    # Delayed turn on C5 with accidentals: main, upper (Db), main, lower (B), main
    play_note("C5")
    play_note("C#5")  # Db5
    play_note("C5")
    play_note("B4")
    play_note("C5")

    # Regular turn on Eb5 without accidentals: upper (F), main, lower (D), main
    play_note("F5")
    play_note("D#5")  # Eb5
    play_note("D5")   # Diatonic lower, NOT Db!
    play_note("D#5")  # Eb5

    # Final note G5
    play_note("G5")

    # Should have 1 filled repeat indicator (clean repetition)
    assert_selector 'svg circle.repeat-indicator.filled', count: 1
  end

  def test_mordent_notes_expanded_sequentially
    # Tests both regular and inverted mordents in the same measure:
    # - Regular mordent on C5: C5, B4, C5 (3 notes - diatonic lower note)
    # - Inverted mordent on E5: E5, F5, E5 (3 notes - diatonic upper note)
    # - Final note: G5
    # Visual notes: 3 (C5, E5, G5), but validation expects 7 notes total
    #
    # Mordents use diatonic intervals (follow the scale), not fixed semitone offsets.
    # In C major: C→B is 1 semitone, E→F is 1 semitone.
    #
    # In training mode, playing the correct sequences should result in a
    # clean repetition (filled circle).
    load_score('mordent-ornament.xml', 3)

    click_on 'Mode Entraînement'
    assert_text 'Mode Entraînement Actif'

    # Regular mordent on C5: main, lower (diatonic = B4), main
    play_note("C5")
    play_note("B4")
    play_note("C5")

    # Inverted mordent on E5: main, upper (diatonic = F5), main
    play_note("E5")
    play_note("F5")
    play_note("E5")

    # Final note G5
    play_note("G5")

    # Should have 1 filled repeat indicator (clean repetition)
    # This proves both mordent types were expanded and validated correctly
    assert_selector 'svg circle.repeat-indicator.filled', count: 1
  end

  def test_trill_minimum_sequence_then_next_note
    # Trill on C5 in C major: minimum sequence is C5, D5, C5 (+ sentinel)
    # Playing the next real note (E5) ends the trill and advances.
    # Score has: C5 (trill) -> E5, so 2 visual notes
    load_score('trill-ornament.xml', 2)

    click_on 'Mode Entraînement'
    assert_text 'Mode Entraînement Actif'

    # Minimum trill: C5, D5, C5
    play_note("C5")
    play_note("D5")
    play_note("C5")

    # Play next real note E5 → ends the trill, advances past sentinel
    play_note("E5")

    assert_selector 'svg circle.repeat-indicator.filled', count: 1
  end

  def test_trill_extended_sequence_then_next_note
    # Same trill, but the player trills longer before moving on.
    load_score('trill-ornament.xml', 2)

    click_on 'Mode Entraînement'
    assert_text 'Mode Entraînement Actif'

    # Extended trill: C5, D5, C5, D5, C5, D5, C5
    play_note("C5")
    play_note("D5")
    play_note("C5")
    play_note("D5")
    play_note("C5")
    play_note("D5")
    play_note("C5")

    # End the trill with the next real note
    play_note("E5")

    assert_selector 'svg circle.repeat-indicator.filled', count: 1
  end

  def test_trill_wrong_note_triggers_error
    # Playing a wrong note (not trill note, not next real note) during trill → error
    load_score('trill-ornament.xml', 2)

    click_on 'Mode Entraînement'
    assert_text 'Mode Entraînement Actif'

    # Minimum trill
    play_note("C5")
    play_note("D5")
    play_note("C5")

    # Play wrong note G4 (not a trill note, not E5)
    play_note("G4")

    # Should NOT have a filled indicator (dirty repetition)
    assert_no_selector 'svg circle.repeat-indicator.filled'
  end

end
