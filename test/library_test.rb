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

    assert_selector 'tbody tr', count: 12
    assert_selector 'tr td', text: 'Chopin'
  end

  def test_clicking_score_navigates_to_score_page
    fill_in 'Rechercher une partition', with: 'Air on the G String'
    click_link 'Air on the G String'

    assert_current_path %r{/score\.html\?url=}
    assert_text 'Bibliothèque' # Back link
    assert_selector 'svg g.vf-stavenote', minimum: 1
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

  def test_export_backup
    find('details summary', text: '⚙️ Gestion des données').click

    # Mock the download process
    page.execute_script(<<~JS)
      window.downloadedBackup = null;
      const originalCreateElement = document.createElement.bind(document);
      document.createElement = function(tagName) {
        const element = originalCreateElement(tagName);
        if (tagName.toLowerCase() === 'a') {
          element.click = function() {
            window.downloadedBackup = this.href;
          };
        }
        return element;
      };
    JS

    # Accept alert and verify message
    alert_message = accept_alert do
      click_button '📤 Exporter sauvegarde'
    end

    assert_includes alert_message, '✅ Sauvegarde exportée avec succès'

    # Verify download was triggered
    downloaded_url = page.evaluate_script('window.downloadedBackup')
    assert downloaded_url, 'Backup download should have been triggered'
    assert downloaded_url.start_with?('blob:'), 'Download URL should be a blob URL'
  end

  def test_import_valid_backup
    find('details summary', text: '⚙️ Gestion des données').click

    # Create a valid backup JSON
    valid_backup = {
      exportDate: '2026-01-13T12:00:00.000Z',
      sessions: [
        {
          id: 'test-session-1',
          scoreId: '/scores/test.xml',
          scoreTitle: 'Test Score',
          composer: 'Test Composer',
          mode: 'free',
          startedAt: '2026-01-13T10:00:00.000Z',
          endedAt: '2026-01-13T10:30:00.000Z',
          measures: []
        }
      ],
      aggregates: []
    }.to_json

    # Create a temporary file with the backup content
    require 'tempfile'
    backup_file = Tempfile.new(['backup', '.json'])
    backup_file.write(valid_backup)
    backup_file.close

    # Attach the file and accept alert
    alert_message = accept_alert do
      attach_file 'backup-import', backup_file.path
    end

    assert_includes alert_message, '✅ Sauvegarde importée avec succès'
    assert_includes alert_message, '1 session(s) importée(s)'

    backup_file.unlink
  end

  def test_import_invalid_backup
    find('details summary', text: '⚙️ Gestion des données').click

    # Create an invalid backup JSON (missing sessions field)
    invalid_backup = {
      exportDate: '2026-01-13T12:00:00.000Z'
    }.to_json

    require 'tempfile'
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
