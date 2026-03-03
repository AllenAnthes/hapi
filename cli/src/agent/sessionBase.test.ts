import { describe, expect, it, vi } from 'vitest'
import { AgentSessionBase } from './sessionBase'

describe('AgentSessionBase compaction thresholding', () => {
    function createSession(opts: { modelMode?: 'default' | 'sonnet' | 'opus'; compactPercent?: number } = {}) {
        const client = {
            keepAlive: vi.fn(),
            updateMetadata: vi.fn()
        } as any

        const session = new AgentSessionBase({
            api: {} as any,
            client,
            path: '/tmp',
            logPath: '/tmp/log',
            sessionId: null,
            messageQueue: {} as any,
            onModeChange: () => {},
            sessionLabel: 'Test',
            sessionIdLabel: 'Test',
            applySessionIdToMetadata: (metadata) => metadata,
            modelMode: opts.modelMode ?? 'default',
            compactPercent: opts.compactPercent
        })

        return { session, client }
    }

    it('returns true when input tokens exceed threshold', () => {
        const { session } = createSession({ modelMode: 'sonnet', compactPercent: 0.8 })
        session.setLastInputTokens(160_000)
        expect(session.shouldPreemptivelyCompact()).toBe(true)
    })

    it('returns false when below threshold', () => {
        const { session } = createSession({ modelMode: 'opus', compactPercent: 0.8 })
        session.setLastInputTokens(120_000)
        expect(session.shouldPreemptivelyCompact()).toBe(false)
    })

    it('returns false while already compacting', () => {
        const { session } = createSession({ compactPercent: 0.5 })
        session.setLastInputTokens(150_000)
        session.onThinkingActivityChange('compacting')
        expect(session.shouldPreemptivelyCompact()).toBe(false)
    })
})
