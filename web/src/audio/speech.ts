import { setAudioBlocked } from '../store/audio'

export function ttsSupported(): boolean {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return []
  return speechSynthesis.getVoices()
}

export function onVoicesChanged(cb: () => void): () => void {
  if (!ttsSupported()) return () => {}
  speechSynthesis.addEventListener('voiceschanged', cb)
  return () => speechSynthesis.removeEventListener('voiceschanged', cb)
}

export function speak(text: string, voiceName?: string): void {
  if (!ttsSupported() || !text) return
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = voiceName ? listVoices().find((v) => v.name === voiceName) : undefined
  if (voice) {
    utterance.voice = voice
    if (voice.lang) utterance.lang = voice.lang
  }
  utterance.onerror = (e) => {
    if (e.error === 'not-allowed') setAudioBlocked(true)
  }
  utterance.onstart = () => setAudioBlocked(false)
  speechSynthesis.speak(utterance)
}

interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: RecognitionResultEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function recognitionSupported(): boolean {
  return recognitionCtor() !== undefined && window.isSecureContext
}

export interface RecognitionCallbacks {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onEnd: (error?: string) => void
}

export function startRecognition(lang: string, cb: RecognitionCallbacks): () => void {
  const Ctor = recognitionCtor()
  if (!Ctor) {
    cb.onEnd('unsupported')
    return () => {}
  }
  const rec = new Ctor()
  let ended = false
  let error: string | undefined
  const end = () => {
    if (ended) return
    ended = true
    cb.onEnd(error)
  }
  rec.continuous = false
  rec.interimResults = true
  rec.lang = lang
  rec.onresult = (e) => {
    let interim = ''
    let final = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) final += ' ' + r[0].transcript
      else interim += ' ' + r[0].transcript
    }
    if (interim.trim()) cb.onInterim(interim.trim())
    if (final.trim()) cb.onFinal(final.trim())
  }
  rec.onerror = (e) => {
    if (e.error !== 'aborted' && e.error !== 'no-speech') error = e.error
  }
  rec.onend = end
  rec.start()
  return () => {
    rec.stop()
  }
}
