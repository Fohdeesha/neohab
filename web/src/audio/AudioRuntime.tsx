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
import { useEffect, useRef, useState } from 'react'
import { AudioEventSource, hasWebAudioSink } from '../api/audioEvents'
import { getTabLink } from '../api/tabLink'
import { useConfigStore } from '../store/config'
import { audioWanted, onAudioWanted, setWantsAudio, subscribeItems, useItemState } from '../store/items'
import { useAudioStore } from '../store/audio'
import { playAudioUrl, stopAudio } from './playback'
import { speak, ttsSupported } from './speech'

export function AudioRuntime() {
  /* ---- web-audio sink ---- */
  const playAudio = useAudioStore((s) => s.settings.playAudio !== false)
  const link = getTabLink()
  const [leader, setLeader] = useState(() => link.isLeader())
  useEffect(() => link.onRole(setLeader), [link])

  // The leader holds this connection for the whole browser (see api/tabLink), so it stays open
  // whenever ANY tab wants audio - not just when the leader itself is unmuted - and every tab
  // plays what comes through, subject to its own mute. Muted everywhere, or a server with no
  // web audio sink, means no connection at all: one socket of six back.
  useEffect(() => {
    setWantsAudio(playAudio)
  }, [playAudio])

  const [wanted, setWanted] = useState(() => audioWanted())
  useEffect(() => {
    // Read on subscribe as well as on change: this tab's own setting is published by the effect
    // above, which has already run by now, and that change would otherwise be missed.
    setWanted(audioWanted())
    return onAudioWanted(setWanted)
  }, [])

  useEffect(() => {
    if (!leader || !wanted) return
    let source: AudioEventSource | null = null
    let cancelled = false
    void hasWebAudioSink().then((present) => {
      if (cancelled || !present) return
      source = new AudioEventSource((url) => {
        link.post({ t: 'playurl', url })
        void playAudioUrl(url)
      })
      source.start()
    })
    return () => {
      cancelled = true
      source?.stop()
      stopAudio()
    }
  }, [leader, wanted, link])

  // Follower tabs play what the leader relays, each honouring its own mute setting.
  useEffect(() => {
    if (leader) return
    return link.onMessage((msg) => {
      if (msg.t !== 'playurl' || typeof msg.url !== 'string') return
      if (playAudio) void playAudioUrl(msg.url)
    })
  }, [leader, playAudio, link])

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
