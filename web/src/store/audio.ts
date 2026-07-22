/**
 * Per-device audio settings.
 *
 * Whether THIS device plays server audio and speaks announcements is a device choice, like the
 * kiosk settings: a wall panel should chime, the same dashboard open on a desk should not have
 * to. Both default ON - an administrator configuring the web audio sink or a speech item is
 * already the install-wide opt-in (HABPanel behaved the same way) - and each device can mute
 * itself here. The TTS voice is per-device too, because the available voices depend on the
 * OS/browser (storing it globally was a HABPanel wart). Deliberately not in backup bundles.
 */
import { create } from 'zustand'

export interface AudioSettings {
  /** Play audio a rule sends through openHAB's "Web Audio" sink on this device. */
  playAudio?: boolean
  /** Speak the speech item's changes on this device. */
  speak?: boolean
  /** TTS voice name on this device; unset = the browser's default voice. */
  voice?: string
}

const KEY = 'neohab:audio'

function readStored(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    return JSON.parse(raw) as AudioSettings
  } catch {
    return {}
  }
}

interface AudioState {
  settings: AudioSettings
  /**
   * The browser refused to play/speak without a user gesture (autoplay policy). Shown as an
   * honest status line in Settings; any interaction with the page normally unblocks it.
   */
  blocked: boolean
}

export const useAudioStore = create<AudioState>(() => ({ settings: readStored(), blocked: false }))

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  const next = { ...useAudioStore.getState().settings, ...patch }
  useAudioStore.setState({ settings: next })
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* not persisting is survivable; honour it for this session */
  }
}

export function setAudioBlocked(blocked: boolean): void {
  if (useAudioStore.getState().blocked !== blocked) useAudioStore.setState({ blocked })
}

export function audioEnabled(): boolean {
  return useAudioStore.getState().settings.playAudio !== false
}

export function speakEnabled(): boolean {
  return useAudioStore.getState().settings.speak !== false
}
