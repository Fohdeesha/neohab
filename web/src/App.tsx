import { useEffect, useState } from 'react'

interface RootInfo {
  runtimeInfo?: {
    version: string
    buildString: string
  }
  locale?: string
  measurementSystem?: string
}

type ConnectionState =
  | { status: 'connecting' }
  | { status: 'connected'; info: RootInfo }
  | { status: 'error'; message: string }

export default function App() {
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'connecting',
  })

  useEffect(() => {
    const controller = new AbortController()
    fetch('/rest/', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<RootInfo>
      })
      .then((info) => setConnection({ status: 'connected', info }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setConnection({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="shell">
      <h1 className="wordmark">neohab</h1>
      <p className="status">
        {connection.status === 'connecting' && 'connecting to openHAB…'}
        {connection.status === 'connected' && (
          <>
            connected to openHAB{' '}
            <strong>{connection.info.runtimeInfo?.version ?? '?'}</strong>
          </>
        )}
        {connection.status === 'error' && (
          <>
            could not reach openHAB REST API ({connection.message}) — retrying
            on reload
          </>
        )}
      </p>
    </main>
  )
}
