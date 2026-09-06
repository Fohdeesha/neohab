// keys are the English source strings, so untranslated text falls back to readable English
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import { lookup } from '../model/lookup'

export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' }
]

const STORAGE_KEY = 'neohab:language'

const loaders: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  de: () => import('./de.json'),
  es: () => import('./es.json'),
  fr: () => import('./fr.json'),
  it: () => import('./it.json'),
  nl: () => import('./nl.json'),
  pl: () => import('./pl.json')
}

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
  if (typeof navigator === 'undefined') return 'en'
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
  // keys are English sentences, so '.' and ':' must not be parsed as paths
  keySeparator: false,
  nsSeparator: false
})

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng
})

async function activate(code: string): Promise<void> {
  if (code !== 'en' && !i18n.hasResourceBundle(code, 'translation')) {
    try {
      // through lookup: setLanguage is exported and takes a bare string
      const load = lookup(loaders, code)
      if (!load) return
      const mod = await load()
      i18n.addResourceBundle(code, 'translation', mod.default)
    } catch {
      return // catalog unreachable (offline first visit) - stay on the current language
    }
  }
  await i18n.changeLanguage(code)
}

export async function setLanguage(choice: string): Promise<void> {
  try {
    if (choice === 'auto') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // private mode - the change still applies for this session
  }
  await activate(choice === 'auto' ? detectLanguage() : choice)
}

void activate(detectLanguage())

export default i18n
