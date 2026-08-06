/**
 * UI translations.
 *
 * Keys are the English source strings themselves (gettext style), so untranslated text always
 * falls back to readable English and the code stays greppable. English therefore ships no
 * catalog beyond its plural variants (en.json); every other language is a JSON catalog mapping
 * the English strings, lazy-loaded as its own chunk the first time it is picked so non-English
 * users pay for exactly one catalog and English users pay for none.
 *
 * Language choice: the explicit per-device setting wins (localStorage), otherwise the browser
 * language, otherwise English. Only chrome is translated - dashboard content (widget labels,
 * dashboard names) is the user's own data.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'

export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
]

const STORAGE_KEY = 'neohab:language'

const loaders: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  de: () => import('./de.json'),
  es: () => import('./es.json'),
  fr: () => import('./fr.json'),
  it: () => import('./it.json'),
  nl: () => import('./nl.json'),
  pl: () => import('./pl.json'),
}

/** The explicit per-device choice, or null when following the browser. */
export function storedLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function detectLanguage(): string {
  const stored = storedLanguage()
  if (stored && LANGUAGES.some((l) => l.code === stored)) return stored
  for (const cand of navigator.languages ?? [navigator.language]) {
    const base = (cand ?? '').slice(0, 2).toLowerCase()
    if (LANGUAGES.some((l) => l.code === base)) return base
  }
  return 'en'
}

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false }, // React escapes for us
  // Keys are English sentences - they contain '.' and ':' that must not be parsed as paths.
  keySeparator: false,
  nsSeparator: false,
})

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

async function activate(code: string): Promise<void> {
  if (code !== 'en' && !i18n.hasResourceBundle(code, 'translation')) {
    try {
      const mod = await loaders[code]()
      i18n.addResourceBundle(code, 'translation', mod.default)
    } catch {
      return // catalog unreachable (offline first visit) - stay on the current language
    }
  }
  await i18n.changeLanguage(code)
}

/** Explicitly pick a language for this device ('auto' clears the choice and re-detects). */
export async function setLanguage(choice: string): Promise<void> {
  try {
    if (choice === 'auto') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    /* private mode - the change still applies for this session */
  }
  await activate(choice === 'auto' ? detectLanguage() : choice)
}

/**
 * Apply the detected language at startup.
 *
 * English is in the bundle and is applied synchronously by the `init` above, so an English
 * session never waits. Any other language is a separate chunk, so its first frame is unavoidably
 * English and swaps once the catalog arrives - a fetch cannot be awaited before paint without
 * holding the whole app back on every load, including the English ones.
 */
void activate(detectLanguage())

export default i18n
