/**
 * Invisible glue for server audio and spoken announcements. Mounted once in App; renders
 * nothing. It
 *   - listens for web-audio sink events and plays them while this device allows it, and
 *   - speaks the speech item's state changes (an admin-configured String item, HABPanel's
 *     `speech_synthesis_item`) through the browser's speech synthesis.
 *
 * Both follow per-device settings (on by default). The speech item is primed like the
 * dashboard-control item: the state that was already current at page load is history, not an
 * announcement.
 */
import { useEffect, useRef } from 'react'
import { AudioEventSource } from '../api/audioEvents'
import { useConfigStore } from '../store/config'
import { subscribeItems, useItemState } from '../store/items'
import { useAudioStore } from '../store/audio'
import { playAudioUrl, stopAudio } from './playback'
import { speak, ttsSupported } from './speech'

export function AudioRuntime() {
  /* ---- web-audio sink ---- */
  const playAudio = useAudioStore((s) => s.settings.playAudio !== false)
  useEffect(() => {
    if (!playAudio) return
    const source = new AudioEventSource((url) => void playAudioUrl(url))
    source.start()
    return () => {
      source.stop()
      stopAudio()
    }
  }, [playAudio])

  /* ---- speech item ---- */
  const speechItem = useConfigStore((s) => s.settings.speechItem)
  const speakSetting = useAudioStore((s) => s.settings.speak !== false)
  const voice = useAudioStore((s) => s.settings.voice)
  const follow = speakSetting && ttsSupported() && speechItem ? speechItem : undefined

  useEffect(() => {
    if (!follow) return
    return subscribeItems([follow])
  }, [follow])

  const state = useItemState(follow)?.state
  const lastState = useRef<string | undefined>(undefined)
  const primed = useRef(false)
  useEffect(() => {
    primed.current = false
    lastState.current = undefined
  }, [follow])
  useEffect(() => {
    if (!follow || state === undefined) return
    if (!primed.current) {
      primed.current = true
      lastState.current = state
      return
    }
    if (state === lastState.current) return
    lastState.current = state
    if (!state || state === 'NULL' || state === 'UNDEF') return
    speak(state, voice)
  }, [follow, state, voice])

  return null
}
