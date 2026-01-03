require_relative 'test_helper'

class LibraryTest < CapybaraTestBase
  def setup
    visit '/index.html'
  end

  def test_library_page_loads_scores
    assert_text 'Bibliotheque'
    assert_selector 'table'
    assert_selector 'tbody tr', count: 70
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
    assert_text 'Bibliotheque' # Back link
    assert_selector 'svg g.vf-stavenote', minimum: 1
  end

  def test_charger_ma_partition_link
    click_on 'Charger ma partition'

    assert_current_path '/score.html'
  end

  def test_back_link_from_score_to_library
    visit '/score.html'
    click_on 'Bibliotheque'

    assert_current_path '/index.html'
    assert_text 'Bibliotheque'
    assert_selector 'table'
  end
end
