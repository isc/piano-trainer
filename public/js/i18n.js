// Lightweight i18n for the (build-less, static-hosted) app.
//
// - Static HTML strings are tagged with data-i18n / data-i18n-<attr> and filled
//   by applyTranslations(); JS-built strings call t(key, params).
// - Both catalogs are bundled and the active one is picked at runtime, so t()
//   is synchronous (no async/ordering issues).
// - Switching language persists the choice and reloads, which re-renders every
//   string — static and JS-built — without any reactive plumbing.
import fr from './locales/fr.js'
import en from './locales/en.js'

const DICTS = { fr, en }
const SUPPORTED = ['fr', 'en']
const FALLBACK = 'en'
const STORAGE_KEY = 'pt-lang'

function detectLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && SUPPORTED.includes(stored)) return stored
  } catch {
    /* localStorage unavailable */
  }
  const nav = (navigator.language || '').slice(0, 2).toLowerCase()
  return SUPPORTED.includes(nav) ? nav : FALLBACK
}

let lang = detectLang()
let dict = DICTS[lang]

export function getLang() {
  return lang
}

// Intl locale tag for date/number/sort APIs.
export function locale() {
  return lang === 'fr' ? 'fr-FR' : 'en-US'
}

export function setLang(next) {
  if (!SUPPORTED.includes(next) || next === lang) return
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore: language just won't persist */
  }
  location.reload()
}

function lookup(d, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), d)
}

function interpolate(str, params) {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m))
}

// Resolve a dotted key, falling back to the other language then the key itself,
// so a missing translation is visible but never blank.
export function t(key, params) {
  const val = lookup(dict, key) ?? lookup(DICTS[FALLBACK], key) ?? key
  return typeof val === 'string' ? interpolate(val, params) : val
}

const ATTR_KEYS = ['placeholder', 'aria-label', 'title', 'alt', 'content']

// Fill static DOM. [data-i18n] sets textContent, [data-i18n-html] sets innerHTML
// (for strings with inline markup like <code>), [data-i18n-<attr>] sets that
// attribute. Safe to call repeatedly and on any subtree.
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'))
  })
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'))
  })
  for (const attr of ATTR_KEYS) {
    root.querySelectorAll(`[data-i18n-${attr}]`).forEach((el) => {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)))
    })
  }
  document.documentElement.lang = lang
}

// Wire [data-set-lang] controls (the FR/EN switch) and run the initial DOM pass.
// Call once per page once the DOM is parsed.
export function initI18n() {
  applyTranslations()
  document.querySelectorAll('[data-set-lang]').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.getAttribute('data-set-lang') === lang))
    el.addEventListener('click', (e) => {
      e.preventDefault()
      setLang(el.getAttribute('data-set-lang'))
    })
  })
}

// One-call setup for Alpine pages: translate static chrome + wire the switch
// (initI18n), then expose $t to templates. Registered on alpine:init so the
// magic exists before Alpine evaluates any expression.
export function initAlpineI18n() {
  initI18n()
  document.addEventListener('alpine:init', () => {
    window.Alpine.magic('t', () => (key, params) => t(key, params))
  })
}
