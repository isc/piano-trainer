require_relative 'test_helper'

class ComposerAndStatusPagesTest < CapybaraTestBase
  def setup
    page.driver.set_cookie('test-env', 'true')
  end

  def test_composer_page_shows_scores_with_status_links
    visit '/composer.html?composer=Chopin'
    inject_aggregates
    visit '/composer.html?composer=Chopin'

    assert_text 'Chopin'

    # Verify the 3 scores with injected data appear with status links
    assert_link 'dechiffrage', href: /status\.html\?status=dechiffrage/
    assert_link 'perfectionnement', href: /status\.html\?status=perfectionnement/
    assert_link 'repertoire', href: /status\.html\?status=repertoire/

    # Click on a status link to navigate to the status page
    click_link 'repertoire'

    assert_text 'Répertoire'
    assert_link 'Waltz in A Minor'
    # Should not show scores with other statuses
    assert_no_text 'Nocturne Op. 9 No. 1'
    assert_no_text 'Prelude Op. 28 No. 4 in E Minor'
  end

  def test_status_page_shows_filtered_scores_sorted_by_last_played
    visit '/status.html?status=dechiffrage'
    inject_aggregates
    visit '/status.html?status=dechiffrage'

    assert_text 'Déchiffrage'

    # Should show the 2 dechiffrage scores
    rows = all('tbody tr')
    dechiffrage_titles = rows.map { |r| r.find('td:first-child').text }
    assert_includes dechiffrage_titles, 'Prelude Op. 28 No. 4 in E Minor'
    assert_includes dechiffrage_titles, 'Nocturne No. 20 in C Minor'

    # Most recently played should be first
    assert_equal 'Nocturne No. 20 in C Minor', dechiffrage_titles.first
    assert_equal 'Prelude Op. 28 No. 4 in E Minor', dechiffrage_titles.last

    # Should not show scores with other statuses
    assert_no_text 'Waltz in A Minor'
    assert_no_text 'Nocturne Op. 9 No. 1'

    # Composer names should link to composer pages
    assert_link 'Chopin', href: /composer\.html\?composer=Chopin/
  end

  private

  def inject_aggregates
    # Inject aggregates for Chopin scores with different statuses and lastPlayedAt times
    # so we can test filtering and sorting
    aggregates = [
      {
        scoreId: 'scores/Prlude_No._4_in_E_Minor_Op._28_-_Frdric_Chopin.mxl',
        scoreTitle: 'Prelude Op. 28 No. 4 in E Minor',
        composer: 'Chopin',
        status: 'dechiffrage',
        lastPlayedAt: '2026-01-01T10:00:00.000Z',
        totalPracticeTimeMs: 300_000,
        practiceDays: ['2026-01-01'],
      },
      {
        scoreId: 'scores/Chopin_-_Nocturne_Op._9_No._1.mxl',
        scoreTitle: 'Nocturne Op. 9 No. 1',
        composer: 'Chopin',
        status: 'perfectionnement',
        lastPlayedAt: '2026-02-15T10:00:00.000Z',
        totalPracticeTimeMs: 1_800_000,
        practiceDays: ['2026-02-13', '2026-02-14', '2026-02-15'],
      },
      {
        scoreId: 'scores/Waltz_in_A_MinorChopin.mxl',
        scoreTitle: 'Waltz in A Minor',
        composer: 'Chopin',
        status: 'repertoire',
        lastPlayedAt: '2026-03-10T10:00:00.000Z',
        totalPracticeTimeMs: 3_600_000,
        practiceDays: ['2026-03-08', '2026-03-09', '2026-03-10'],
      },
      {
        scoreId: 'scores/Nocturne_No._20_in_C_Minor.mxl',
        scoreTitle: 'Nocturne No. 20 in C Minor',
        composer: 'Chopin',
        status: 'dechiffrage',
        lastPlayedAt: '2026-03-15T10:00:00.000Z',
        totalPracticeTimeMs: 600_000,
        practiceDays: ['2026-03-15'],
      },
    ]

    page.execute_script(<<~JS, aggregates)
      const aggregates = arguments[0];
      const request = indexedDB.open('piano-trainer', 3);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('aggregates', 'readwrite');
        const store = tx.objectStore('aggregates');
        for (const agg of aggregates) {
          store.put(agg);
        }
      };
    JS
    sleep 0.1 # Let IndexedDB transaction complete
  end
end
