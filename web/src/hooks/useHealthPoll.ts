import { useEffect, useRef, useState, useCallback } from 'react'

type UseHealthPollOptions = {
    baseUrl: string
    enabled: boolean
    onHealthy: () => void
    initialDelayMs?: number
    maxDelayMs?: number
}

export function useHealthPoll({
    baseUrl,
    enabled,
    onHealthy,
    initialDelayMs = 1000,
    maxDelayMs = 10_000
}: UseHealthPollOptions): { retryCount: number; retryNow: () => void } {
    const [retryCount, setRetryCount] = useState(0)
    const retryCountRef = useRef(0)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const enabledRef = useRef(enabled)
    const onHealthyRef = useRef(onHealthy)
    const pollingRef = useRef(false)

    useEffect(() => { enabledRef.current = enabled }, [enabled])
    useEffect(() => { onHealthyRef.current = onHealthy }, [onHealthy])

    const poll = useCallback(async () => {
        if (!enabledRef.current || pollingRef.current) return
        pollingRef.current = true

        try {
            const url = new URL('/health', baseUrl).toString()
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
            if (res.ok) {
                // Validate this is actually the hub and not a tunnel error page
                // served as HTTP 200 HTML (e.g., ngrok "Tunnel not found")
                const ct = res.headers.get('content-type') || ''
                if (ct.includes('application/json')) {
                    // Re-check enabled after async fetch — disconnect may have
                    // already been cleared by SSE reconnect while we were in flight
                    if (!enabledRef.current) {
                        pollingRef.current = false
                        return
                    }
                    retryCountRef.current = 0
                    setRetryCount(0)
                    pollingRef.current = false
                    onHealthyRef.current()
                    return
                }
                // Got 200 but not JSON — likely tunnel error page, treat as failure
            }
        } catch {
            // Expected when hub is down
        }

        pollingRef.current = false
        if (!enabledRef.current) return

        retryCountRef.current++
        setRetryCount(retryCountRef.current)
        const delay = Math.min(
            initialDelayMs * Math.pow(2, retryCountRef.current - 1),
            maxDelayMs
        )
        timerRef.current = setTimeout(() => void poll(), delay)
    }, [baseUrl, initialDelayMs, maxDelayMs])

    const retryNow = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        void poll()
    }, [poll])

    useEffect(() => {
        if (!enabled) {
            if (timerRef.current) {
                clearTimeout(timerRef.current)
                timerRef.current = null
            }
            retryCountRef.current = 0
            setRetryCount(0)
            pollingRef.current = false
            return
        }

        // Start polling immediately
        void poll()

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current)
                timerRef.current = null
            }
            pollingRef.current = false
        }
    }, [enabled, poll])

    return { retryCount, retryNow }
}
