// one tab opens the event streams and relays them: six sockets per origin are shared by every tab of the
// browser

const CHANNEL = 'neohab:tablink'
const BEAT_MS = 1500
const LEADER_TIMEOUT_MS = 5000
const ELECTION_WAIT_MS = 250

export interface TabMessage {
  t: string
  from: string
  [key: string]: unknown
}

type MessageListener = (msg: TabMessage) => void
type RoleListener = (leader: boolean) => void

export class TabLink {
  readonly id = Math.random().toString(36).slice(2, 10)
  private channel: BroadcastChannel | null = null
  private leader = false
  private leaderId: string | null = null
  private leaderVisible = false
  private lastBeatAt = 0
  private beatTimer: ReturnType<typeof setInterval> | null = null
  private electionTimer: ReturnType<typeof setTimeout> | null = null
  private messageListeners = new Set<MessageListener>()
  private roleListeners = new Set<RoleListener>()

  constructor() {
    if (typeof BroadcastChannel === 'undefined') {
      this.leader = true
      return
    }
    this.channel = new BroadcastChannel(CHANNEL)
    this.channel.onmessage = (e: MessageEvent<TabMessage>) => this.receive(e.data)

    this.post({ t: 'who' })
    this.electionTimer = setTimeout(() => this.elect(), ELECTION_WAIT_MS + Math.random() * 150)
    setInterval(() => {
      if (!this.leader && Date.now() - this.lastBeatAt > LEADER_TIMEOUT_MS) this.elect()
    }, 1000)

    window.addEventListener('pagehide', () => this.resign())
    window.addEventListener('pageshow', (e) => {
      if (!(e as PageTransitionEvent).persisted) return
      this.lastBeatAt = 0
      this.post({ t: 'who' })
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.leader) this.post({ t: 'who' })
    })
  }

  isLeader(): boolean {
    return this.leader
  }

  onRole(cb: RoleListener): () => void {
    this.roleListeners.add(cb)
    return () => this.roleListeners.delete(cb)
  }

  onMessage(cb: MessageListener): () => void {
    this.messageListeners.add(cb)
    return () => this.messageListeners.delete(cb)
  }

  post(msg: Record<string, unknown> & { t: string }): void {
    this.channel?.postMessage({ ...msg, from: this.id })
  }

  private rank(visible: boolean, id: string): string {
    return (visible ? '0' : '1') + id
  }

  private receive(msg: TabMessage): void {
    if (!msg || msg.from === this.id) return

    if (msg.t === 'who') {
      if (this.leader) this.beat()
      return
    }

    if (msg.t === 'beat') {
      if (this.leader) {
        const theirs = this.rank(msg.vis === true, msg.from)
        const mine = this.rank(document.visibilityState === 'visible', this.id)
        if (theirs < mine) this.stepDown(msg.from, msg.vis === true)
        return
      }
      this.leaderId = msg.from
      this.leaderVisible = msg.vis === true
      this.lastBeatAt = Date.now()
      // only challenge a HIDDEN leader, and never on id alone, or every newly opened tab deposes a healthy one
      if (!this.leaderVisible && document.visibilityState === 'visible') this.elect()
    }

    if (msg.t === 'resign' && msg.from === this.leaderId) {
      this.leaderId = null
      this.leaderVisible = false
      this.lastBeatAt = 0
      if (this.electionTimer) clearTimeout(this.electionTimer)
      this.electionTimer = setTimeout(() => this.elect(), Math.random() * 150)
      return
    }

    for (const cb of this.messageListeners) cb(msg)
  }

  private elect(): void {
    if (this.leader) return
    if (this.electionTimer) {
      clearTimeout(this.electionTimer)
      this.electionTimer = null
    }
    if (Date.now() - this.lastBeatAt <= LEADER_TIMEOUT_MS && this.leaderId) {
      if (this.leaderVisible || document.visibilityState !== 'visible') return
    }
    this.leader = true
    this.leaderId = this.id
    this.beat()
    this.beatTimer ??= setInterval(() => this.beat(), BEAT_MS)
    for (const cb of this.roleListeners) cb(true)
  }

  private stepDown(toId: string, theirVisibility: boolean): void {
    if (!this.leader) return
    this.leader = false
    this.leaderId = toId
    this.leaderVisible = theirVisibility
    this.lastBeatAt = Date.now()
    if (this.beatTimer) {
      clearInterval(this.beatTimer)
      this.beatTimer = null
    }
    for (const cb of this.roleListeners) cb(false)
  }

  private beat(): void {
    this.post({ t: 'beat', vis: document.visibilityState === 'visible' })
  }

  private resign(): void {
    if (!this.leader) return
    this.post({ t: 'resign' })
    this.leader = false
    if (this.beatTimer) {
      clearInterval(this.beatTimer)
      this.beatTimer = null
    }
    for (const cb of this.roleListeners) cb(false)
  }
}

let link: TabLink | null = null

export function getTabLink(): TabLink {
  return (link ??= new TabLink())
}
