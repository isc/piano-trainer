// Map of composer → musical period for the library filter.
// Keep keyed by the exact `composer` string used in scores.json — the lookup
// is by equality, no normalization or alias resolution.
const COMPOSER_PERIODS = {
  'J.S. Bach':          'baroque',
  'C.P.E. Bach':        'baroque',
  'Christian Petzold':  'baroque',
  'Pachelbel':          'baroque',
  'Handel-Halvorsen':   'baroque',
  'Mozart':             'classique',
  'Beethoven':          'classique',
  'Schubert':           'romantique',
  'Chopin':             'romantique',
  'Schumann':           'romantique',
  'Liszt':              'romantique',
  'Brahms':             'romantique',
  'Tchaikovsky':        'romantique',
  'Rimsky-Korsakov':    'romantique',
  'Debussy':            'moderne',
  'Erik Satie':         'moderne',
  'Scott Joplin':       'moderne',
  'Leontovych':         'moderne',
  'Luo Ni':             'contemporain',
  'Paul de Senneville': 'contemporain',
  'Traditional':        'traditionnel',
}

export const PERIODS = [
  { value: 'baroque',      label: 'Baroque' },
  { value: 'classique',    label: 'Classique' },
  { value: 'romantique',   label: 'Romantique' },
  { value: 'moderne',      label: 'Moderne' },
  { value: 'contemporain', label: 'Contemporain' },
  { value: 'traditionnel', label: 'Traditionnel' },
]

export function getPeriodForComposer(composer) {
  return COMPOSER_PERIODS[composer] || null
}

export function periodLabel(value) {
  return PERIODS.find((p) => p.value === value)?.label || value
}
