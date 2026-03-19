require_relative 'test_helper'

class ComposerAndStatusPagesTest < CapybaraTestBase
  def test_composer_and_status_page_navigation
    page.driver.set_cookie('test-env', 'true')
    visit '/index.html'
    inject_aggregates

    # Navigate to Chopin's page from the library
    click_link 'Chopin', match: :first

    assert_text 'Chopin'
    assert_link 'Déchiffrage', href: /status\.html\?status=dechiffrage/
    assert_link 'Perfectionnement', href: /status\.html\?status=perfectionnement/
    assert_link 'Répertoire', href: /status\.html\?status=repertoire/

    # Navigate to the répertoire status page
    click_link 'Répertoire'

    assert_text 'Répertoire'
    assert_link 'Waltz in A Minor'
    assert_no_text 'Nocturne Op. 9 No. 1'
    assert_no_text 'Prelude Op. 28 No. 4 in E Minor'
    # Composer links back to composer page
    assert_link 'Chopin', href: /composer\.html\?composer=Chopin/

    # Go back and navigate to the déchiffrage status page
    page.go_back
    click_link 'Déchiffrage', match: :first

    assert_text 'Déchiffrage'
    rows = all('tbody tr')
    titles = rows.map { |r| r.find('td:first-child').text }
    assert_equal 'Nocturne No. 20 in C Minor', titles.first
    assert_equal 'Prelude Op. 28 No. 4 in E Minor', titles.last
    assert_no_text 'Waltz in A Minor'
    assert_no_text 'Nocturne Op. 9 No. 1'
  end

  private

  def inject_aggregates
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
    sleep 0.1
  end
end
