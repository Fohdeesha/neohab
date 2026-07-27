/**
 * Cross-tab coordination for the live event streams.
 *
 * Browsers allow only six concurrent HTTP/1.1 connections per origin, and that budget is shared
 * by every tab of the profile (and by any other openHAB UI open against the same server). Event
 * streams never close, so a tab that opens its own quickly starves the origin: with two streams
 * per tab the third tab gets nothing at all - it renders its dashboard, but the POST that tells
 * the server which items to track can no longer get a socket, so no state ever arrives and every
 * widget sits there looking dead.
 *
 * So exactly one tab - the leader - opens the streams, and relays what it receives to the others
 * over a BroadcastChannel. Followers open no connections of their own; they tell the leader which
 * items they need and it tracks the union. The whole browser costs one or two sockets no matter
 * how many tabs are open.
 *
 * Leadership is claimed by whoever hears no heartbeat, handed over explicitly on unload, and
 * re-elected when a leader goes quiet (a frozen background tab, a crash, a closed window). Two
 * tabs claiming at once converge without ping-pong because the tie-break is a total order:
 * a visible tab beats a hidden one - background timer throttling would otherwise let a hidden
 * tab keep leadership while beating once a minute - and equal visibility falls back to the lower
 * id. Where BroadcastChannel is missing, every tab leads itself, which is the old behaviour.
 */

const CHANNEL = 'neohab:tablink'
/** How often the leader announces itself. Cheap: these messages never touch the network. */
const BEAT_MS = 1500
/** No heartbeat for this long means the leader is gone (or throttled into uselessness). */
const LEADER_TIMEOUT_MS = 5000
/**
 * Wait this long at startup before claiming an apparently empty channel. A leader answers the
 * "who is leading?" query immediately, so this only has to cover message round-trip, not a
 * whole heartbeat period.
 */
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
      // No coordination available: lead alone, exactly as every tab used to.
      this.leader = true
      return
    }
    this.channel = new BroadcastChannel(CHANNEL)
    this.channel.onmessage = (e: MessageEvent<TabMessage>) => this.receive(e.data)

    // Ask who is leading; a leader answers at once. Claim the role if nobody does.
    this.post({ t: 'who' })
    this.electionTimer = setTimeout(() => this.elect(), ELECTION_WAIT_MS + Math.random() * 150)
    // Runs for the lifetime of the page: a leader that stops beating has to be replaced.
    setInterval(() => {
      if (!this.leader && Date.now() - this.lastBeatAt > LEADER_TIMEOUT_MS) this.elect()
    }, 1000)

    // Hand over immediately on unload rather than making the others wait out the timeout.
    // pagehide covers the bfcache and mobile app-switch paths that unload misses.
    window.addEventListener('pagehide', () => this.resign())
    // ...and pagehide is not always the end: a page restored from the bfcache has resigned but
    // is still running, so it has to rejoin rather than sit there as a leader nobody follows.
    window.addEventListener('pageshow', (e) => {
      if (!(e as PageTransitionEvent).persisted) return
      this.lastBeatAt = 0
      this.post({ t: 'who' })
    })
    // A tab that becomes visible while a hidden tab is leading should take over: hidden tabs get
    // their timers throttled to once a minute, which stalls every follower's updates. Asking who
    // is leading makes the leader beat, and the beat handler does the challenging.
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

  /** Broadcast to every other tab. No-op when this tab is alone. */
  post(msg: Record<string, unknown> & { t: string }): void {
    this.channel?.postMessage({ ...msg, from: this.id })
  }

  /** Lower sorts first and wins a leadership conflict. */
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
      // Followers see heartbeats too (they answer with what they need, which doubles as the
      // keepalive that tells the leader they are still open), so this falls through to the
      // listeners below rather than returning early.
      if (this.leader) {
        // Two leaders at once (both claimed an empty channel, or a frozen one came back).
        // The weaker steps down; both sides evaluate the same total order, so exactly one does.
        const theirs = this.rank(msg.vis === true, msg.from)
        const mine = this.rank(document.visibilityState === 'visible', this.id)
        if (theirs < mine) this.stepDown(msg.from, msg.vis === true)
        return
      }
      this.leaderId = msg.from
      this.leaderVisible = msg.vis === true
      this.lastBeatAt = Date.now()
      // Only ever challenge a HIDDEN leader from a visible tab: its throttled timers would
      // otherwise stall everyone's updates. Never challenge on id alone - a healthy leader
      // would then be deposed by every newly opened tab that happens to sort lower.
      if (!this.leaderVisible && document.visibilityState === 'visible') this.elect()
    }

    if (msg.t === 'resign' && msg.from === this.leaderId) {
      this.leaderId = null
      this.leaderVisible = false
      this.lastBeatAt = 0
      // Stagger the scramble so tabs do not all claim in the same tick.
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
      // Someone is leading and still beating. Take over only when we are visible and they are
      // not; otherwise leave them to it.
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
    // Tell this tab's own consumers too: on a real unload it changes nothing, but a page that
    // comes back from the bfcache must not keep a stream open that it no longer leads.
    for (const cb of this.roleListeners) cb(false)
  }
}

let link: TabLink | null = null

/** The one link for this tab, created on first use. */
export function getTabLink(): TabLink {
  return (link ??= new TabLink())
}
