require_relative 'test_helper'

class LibraryTest < CapybaraTestBase
  def setup
    visit '/index.html'
  end

  def test_library_page_loads_scores
    assert_text 'Bibliothèque'
    assert_selector 'table'
    assert_selector 'tbody tr', count: 75
  end

  def test_search_filters_scores_by_title
    fill_in 'Rechercher une partition', with: 'Moonlight'

    assert_selector 'tr td', text: 'Moonlight Sonata'
    assert_selector 'tbody tr', count: 3
  end

  def test_search_filters_scores_by_composer
    fill_in 'Rechercher une partition', with: 'Chopin'

    assert_selector 'tbody tr', count: 13
    assert_selector 'tr td', text: 'Chopin'
  end

  def test_clicking_score_navigates_to_score_page
    fill_in 'Rechercher une partition', with: 'Air on the G String'
    click_link 'Air on the G String'

    assert_current_path %r{/score\.html\?url=}
    assert_text 'Bibliothèque' # Back link
    assert_selector 'svg g.vf-stavenote', minimum: 1

    # History button should be visible for URL-loaded scores
    click_on 'Historique'
    assert_selector 'dialog[open]'
    assert_text 'Historique de pratique'
  end

  def test_charger_ma_partition_link
    click_on 'Charger ma partition'

    assert_current_path '/score.html'
  end

  def test_back_link_from_score_to_library
    visit '/score.html'
    click_on 'Bibliothèque'

    assert_current_path '/index.html'
    assert_text 'Bibliothèque'
    assert_selector 'table'
  end

  def test_search_filters_scores_by_multiple_words_in_any_order
    # Test "Bach INV"
    fill_in 'Rechercher une partition', with: 'Bach INV'
    assert_selector 'tbody tr', count: 3
    assert_selector 'tr td', text: 'Invention'
    assert_selector 'tr td', text: 'J.S. Bach'

    # Test "INV Bach" - word order doesn't matter
    fill_in 'Rechercher une partition', with: 'INV Bach'
    assert_selector 'tbody tr', count: 3
  end

  def test_import_export_roundtrip
    with_virtual_time('2026-01-10 12:00') do
      visit '/index.html'
      find('summary', text: '⚙️ Gestion des données').click

      # Import initial data from fixture
      fixture_path = File.expand_path('fixtures/initial-backup.json', __dir__)

      accept_alert do
        attach_file 'backup-import', fixture_path
      end

      # Verify imported data appears
      within('#daily-log') do
        assert_text 'Test Roundtrip Score'
      end

      # Export the data
      accept_alert do
        click_button '📤 Exporter sauvegarde'
      end

      # Wait for download to complete
      exported_file = wait_for_download('piano-trainer-backup-*.json')
      assert exported_file, 'Export file should be downloaded'

      # Verify imported session is included in export
      imported_data = JSON.parse(File.read(fixture_path))
      exported_data = JSON.parse(File.read(exported_file))

      assert exported_data['exportDate'], 'Export should have exportDate'
      assert_includes exported_data['sessions'], imported_data['sessions'].first

      # Verify fingerings are included in export
      assert exported_data['fingerings'], 'Export should include fingerings'
      assert_includes exported_data['fingerings'], imported_data['fingerings'].first

      # Clean up
      File.delete(exported_file)
    end
  end

  def test_import_invalid_backup
    find('summary', text: '⚙️ Gestion des données').click

    # Create an invalid backup JSON (missing sessions field)
    invalid_backup = {
      exportDate: '2026-01-13T12:00:00.000Z'
    }.to_json

    backup_file = Tempfile.new(['backup', '.json'])
    backup_file.write(invalid_backup)
    backup_file.close

    # Attach the file and accept error alert
    alert_message = accept_alert do
      attach_file 'backup-import', backup_file.path
    end

    assert_includes alert_message, '❌ Erreur lors de l\'import'
    assert_includes alert_message, 'Invalid backup data format'

    backup_file.unlink
  end
end
