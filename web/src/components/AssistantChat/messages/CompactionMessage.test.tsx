import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import { CompactionMessage } from './CompactionMessage'

describe('CompactionMessage', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-03-03T12:00:00.000Z'))
    })

    afterEach(() => {
        vi.useRealTimers()
        cleanup()
    })

    it('renders in-progress compaction state', () => {
        const result = render(
            <CompactionMessage event={{ type: 'compaction-started', preTokens: 155_000 }} createdAt={new Date()} />
        )
        const view = within(result.container)
        expect(view.getByTestId('compaction-started')).toBeInTheDocument()
        expect(view.getByText('Compacting context...')).toBeInTheDocument()
    })

    it('renders completed compact state without accordion when summary absent', () => {
        const createdAt = new Date('2026-03-03T11:58:00.000Z')
        const result = render(
            <CompactionMessage
                event={{ type: 'compact', trigger: 'preemptive', preTokens: 155_000, postTokens: 18_000 }}
                createdAt={createdAt}
            />
        )
        const view = within(result.container)
        expect(view.getByTestId('compaction-completed-simple')).toBeInTheDocument()
        expect(view.getByText('Context compacted · 155K → 18K · 2m ago')).toBeInTheDocument()
        expect(result.container.querySelector('details')).toBeNull()
    })

    it('renders accordion when summary is present', () => {
        const result = render(
            <CompactionMessage
                event={{
                    type: 'compact',
                    trigger: 'preemptive',
                    preTokens: 165_000,
                    postTokens: 19_000,
                    summary: 'Summary of the conversation so far.'
                }}
                createdAt={new Date('2026-03-03T11:59:00.000Z')}
            />
        )
        const view = within(result.container)
        expect(view.getByTestId('compaction-completed-accordion')).toBeInTheDocument()
        expect(result.container.querySelector('details')).not.toBeNull()
        expect(view.getByText('Summary of the conversation so far.')).toBeInTheDocument()
    })
})
