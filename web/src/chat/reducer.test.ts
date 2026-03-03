import { describe, expect, it } from 'vitest'
import { reduceChatBlocks } from '@/chat/reducer'
import type { NormalizedMessage } from '@/chat/types'

function makeEventMessage(id: string, createdAt: number, event: Record<string, unknown>): NormalizedMessage {
    return {
        id,
        localId: null,
        createdAt,
        role: 'event',
        content: event as any,
        isSidechain: false
    }
}

describe('reduceChatBlocks compaction event behavior', () => {
    it('attaches compaction-summary to the subsequent compact event', () => {
        const normalized: NormalizedMessage[] = [
            makeEventMessage('summary-msg', 1, {
                type: 'compaction-summary',
                summary: 'Summary of the conversation so far.'
            }),
            makeEventMessage('compact-msg', 2, {
                type: 'compact',
                trigger: 'auto',
                preTokens: 165_000,
                postTokens: 18_000
            })
        ]

        const result = reduceChatBlocks(normalized, null)
        const eventBlocks = result.blocks.filter((block) => block.kind === 'agent-event')

        expect(eventBlocks).toHaveLength(1)
        expect((eventBlocks[0] as any).event).toMatchObject({
            type: 'compact',
            trigger: 'auto',
            preTokens: 165_000,
            postTokens: 18_000,
            summary: 'Summary of the conversation so far.'
        })
    })

    it('does not leak stale compaction-summary when compact already has summary', () => {
        const normalized: NormalizedMessage[] = [
            makeEventMessage('summary-msg-1', 1, {
                type: 'compaction-summary',
                summary: 'First summary'
            }),
            makeEventMessage('compact-msg-1', 2, {
                type: 'compact',
                trigger: 'auto',
                preTokens: 165_000,
                postTokens: 18_000,
                summary: 'Authoritative summary from compact metadata'
            }),
            makeEventMessage('compact-msg-2', 3, {
                type: 'compact',
                trigger: 'auto',
                preTokens: 120_000,
                postTokens: 20_000
            })
        ]

        const result = reduceChatBlocks(normalized, null)
        const eventBlocks = result.blocks.filter((block) => block.kind === 'agent-event')

        expect(eventBlocks).toHaveLength(2)
        expect((eventBlocks[0] as any).event).toMatchObject({
            type: 'compact',
            summary: 'Authoritative summary from compact metadata'
        })
        expect((eventBlocks[1] as any).event).toMatchObject({
            type: 'compact',
            preTokens: 120_000,
            postTokens: 20_000
        })
        expect((eventBlocks[1] as any).event.summary).toBeUndefined()
    })
})
