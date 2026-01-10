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
end
