/**
 * Header microphone button: listen, show the transcript live, send the final text to the
 * server's human-language interpreter, and toast its answer (HABPanel discarded the answer;
 * hearing "Ok" vs "I don't understand" is half the feature).
 *
 * Renders nothing when the browser cannot do speech recognition (non-Chromium, or a plain-HTTP
 * origin where the microphone is unavailable) or when the admin turned the button off.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRootInfo } from '../api/items'
import { interpretText } from '../api/voice'
import { notify } from '../store/notify'
import { useConfigStore } from '../store/config'
import { recognitionSupported, startRecognition } from './speech'

/** The server's configured locale decides the recognition language (HABPanel semantics). */
let localePromise: Promise<string> | null = null
function recognitionLocale(): Promise<string> {
  localePromise ??= getRootInfo()
    .then((info) => (info.locale ? info.locale.replace('_', '-') : navigator.language || 'en-US'))
    .catch(() => navigator.language || 'en-US')
  return localePromise
}

export function VoiceButton() {
  const { t } = useTranslation()
  const enabled = useConfigStore((s) => s.settings.voiceButton !== false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const stopRef = useRef<(() => void) | null>(null)
  /** Whether the user wants to be listening - guards the async gap before recognition starts. */
  const wantRef = useRef(false)

  useEffect(() => () => stopRef.current?.(), [])

  if (!enabled || !recognitionSupported()) return null

  const send = async (text: string) => {
    try {
      const answer = await interpretText(text)
      notify(answer.trim() || t('Sent: “{{text}}”', { text }))
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    }
  }

  const toggle = () => {
    if (wantRef.current) {
      wantRef.current = false
      if (stopRef.current) stopRef.current()
      else setListening(false) // stopped during the async gap before recognition started
      return
    }
    wantRef.current = true
    setTranscript('')
    setListening(true)
    void recognitionLocale().then((lang) => {
      if (!wantRef.current) return // toggled off while the locale loaded
      stopRef.current = startRecognition(lang, {
        onInterim: setTranscript,
        onFinal: (text) => {
          setTranscript(text)
          void send(text)
        },
        onEnd: (error) => {
          wantRef.current = false
          stopRef.current = null
          setListening(false)
          if (error) notify(t('Voice input failed: {{error}}', { error }))
        },
      })
    })
  }

  return (
    <>
      <button
        type="button"
        className={'nh-iconbtn' + (listening ? ' nh-iconbtn--live' : '')}
        onClick={toggle}
        aria-label={listening ? t('Stop listening') : t('Voice command')}
        title={listening ? t('Stop listening') : t('Voice command')}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5.3-3a5.3 5.3 0 0 1-10.6 0H4.9a7.1 7.1 0 0 0 6.2 7v2.5h1.8V18a7.1 7.1 0 0 0 6.2-7h-1.8z"
          />
        </svg>
      </button>
      {listening ? (
        <div className="nh-voice" role="status">
          <span className="nh-voice__dot" />
          {transcript || t('Listening…')}
        </div>
      ) : null}
    </>
  )
}
