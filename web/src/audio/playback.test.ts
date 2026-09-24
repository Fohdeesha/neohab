import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/auth', () => ({ applyAuthHeader: () => {}, applyProxyAuth: () => {}, getAccessToken: async () => null }))
const blocked: boolean[] = []
vi.mock('../store/audio', () => ({ setAudioBlocked: (b: boolean) => blocked.push(b) }))

class FakeAudio {
  src = ''
  played: string[] = []
  private ended: (() => void) | null = null
  addEventListener(name: string, fn: () => void) {
    if (name === 'ended') this.ended = fn
  }
  pause() {}
  removeAttribute() {
    this.src = ''
  }
  async play() {
    this.played.push(this.src)
  }
  end() {
    this.ended?.()
  }
}

let audio: FakeAudio
vi.stubGlobal('Audio', function () {
  audio = new FakeAudio()
  return audio
})
let objectUrls = 0
vi.stubGlobal('URL', { createObjectURL: (b: { url: string }) => `blob:${b.url}#${++objectUrls}`, revokeObjectURL: () => {} })

// each fetch waits until the test lets it answer
const pending = new Map<string, () => void>()
vi.stubGlobal('fetch', (url: string, init: { signal?: AbortSignal }) => {
  return new Promise((resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    pending.set(url, () => resolve({ ok: true, blob: async () => ({ url }) }))
  })
})

const { playAudioUrl, stopAudio } = await import('./playback')
const settle = () => new Promise((r) => setTimeout(r, 0))
const answer = async (url: string) => {
  pending.get(url)?.()
  await settle()
}

describe('web audio playback', () => {
  beforeEach(() => {
    stopAudio()
    pending.clear()
    if (audio) audio.played = []
  })

  it('plays the newest clip, even when an older one finishes downloading after it', async () => {
    void playAudioUrl('/a.mp3')
    void playAudioUrl('/b.mp3')
    await settle()
    await answer('/b.mp3')
    await answer('/a.mp3')
    expect(audio.played.map((s) => s.split('#')[0])).toEqual(['blob:/b.mp3'])
  })

  it('stays stopped when the stop comes while the clip is still downloading', async () => {
    void playAudioUrl('/c.mp3')
    await settle()
    stopAudio()
    await answer('/c.mp3')
    expect(audio?.played ?? []).toEqual([])
  })

  it('plays the same clip again once the first one has finished', async () => {
    void playAudioUrl('/bell.mp3')
    await settle()
    await answer('/bell.mp3')
    audio.end()
    void playAudioUrl('/bell.mp3')
    await settle()
    await answer('/bell.mp3')
    expect(audio.played).toHaveLength(2)
  })

  it('plays one clip once when the same event arrives twice', async () => {
    void playAudioUrl('/twice.mp3')
    void playAudioUrl('/twice.mp3')
    await settle()
    await answer('/twice.mp3')
    expect(audio.played).toHaveLength(1)
  })
})
