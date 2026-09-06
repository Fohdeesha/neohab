import { create } from 'zustand'

export interface AudioSettings {
  playAudio?: boolean
  speak?: boolean
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
  blocked: boolean
}

export const useAudioStore = create<AudioState>(() => ({ settings: readStored(), blocked: false }))

export function setAudioSettings(patch: Partial<AudioSettings>): void {
  const next = { ...useAudioStore.getState().settings, ...patch }
  useAudioStore.setState({ settings: next })
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // not persisting is survivable
  }
}

export function setAudioBlocked(blocked: boolean): void {
  if (useAudioStore.getState().blocked !== blocked) useAudioStore.setState({ blocked })
}
