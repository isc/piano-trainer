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
    simulate_midi_input("ON E4")
    assert_selector 'svg g.vf-notehead.played-note', count: 1
    simulate_midi_input("OFF E4")

    # Play grace note F4 second
    simulate_midi_input("ON F4")
    assert_selector 'svg g.vf-notehead.played-note', count: 2
    simulate_midi_input("OFF F4")

    # Play main note G4 last
    simulate_midi_input("ON G4")
    assert_selector 'svg g.vf-notehead.played-note', count: 3
    simulate_midi_input("OFF G4")

    # Score should be completed
    assert_text 'Partition terminée'
  end

  def test_turn_ornament_notes_expanded_sequentially
    # Tests both delayed and regular turns in the same measure:
    # - Delayed turn on C5 (Db above, B natural below): C5, Db5, C5, B4, C5 (5 notes)
    # - Regular turn on E5 (default whole steps): F#5, E5, D5, E5 (4 notes)
    # - Final note: G5
    # Visual notes: 3 (C5, E5, G5), but validation expects 10 notes total
    #
    # In training mode, playing the correct sequences should result in a
    # clean repetition (filled circle).
    load_score('turn-ornament.xml', 3)

    click_on 'Mode Entraînement'
    assert_text 'Mode Entraînement Actif'

    # Delayed turn on C5: main, upper, main, lower, main
    simulate_midi_input("ON C5")
    simulate_midi_input("OFF C5")

    simulate_midi_input("ON C#5")
    simulate_midi_input("OFF C#5")

    simulate_midi_input("ON C5")
    simulate_midi_input("OFF C5")

    simulate_midi_input("ON B4")
    simulate_midi_input("OFF B4")

    simulate_midi_input("ON C5")
    simulate_midi_input("OFF C5")

    # Regular turn on E5: upper (+2 semitones), main, lower (-2 semitones), main
    simulate_midi_input("ON F#5")
    simulate_midi_input("OFF F#5")

    simulate_midi_input("ON E5")
    simulate_midi_input("OFF E5")

    simulate_midi_input("ON D5")
    simulate_midi_input("OFF D5")

    simulate_midi_input("ON E5")
    simulate_midi_input("OFF E5")

    # Final note G5
    simulate_midi_input("ON G5")
    simulate_midi_input("OFF G5")

    # Should have 1 filled repeat indicator (clean repetition)
    # This proves both turn types were expanded and validated correctly
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
    simulate_midi_input("ON C5")
    simulate_midi_input("OFF C5")

    simulate_midi_input("ON B4")
    simulate_midi_input("OFF B4")

    simulate_midi_input("ON C5")
    simulate_midi_input("OFF C5")

    # Inverted mordent on E5: main, upper (diatonic = F5), main
    simulate_midi_input("ON E5")
    simulate_midi_input("OFF E5")

    simulate_midi_input("ON F5")
    simulate_midi_input("OFF F5")

    simulate_midi_input("ON E5")
    simulate_midi_input("OFF E5")

    # Final note G5
    simulate_midi_input("ON G5")
    simulate_midi_input("OFF G5")

    # Should have 1 filled repeat indicator (clean repetition)
    # This proves both mordent types were expanded and validated correctly
    assert_selector 'svg circle.repeat-indicator.filled', count: 1
  end

end
