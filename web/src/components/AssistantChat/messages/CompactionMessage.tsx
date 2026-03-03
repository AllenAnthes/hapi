import type { AgentEvent } from '@/chat/types'

type CompactionEvent = Extract<AgentEvent, { type: 'compact' | 'compaction-started' }>

function formatTokenCount(tokens: number | null): string | null {
    if (tokens === null || !Number.isFinite(tokens)) return null
    if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M`
    if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`
    return String(Math.max(0, Math.round(tokens)))
}

function formatRelative(createdAt: Date | null): string | null {
    if (!createdAt) return null
    const deltaMs = Date.now() - createdAt.getTime()
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return 'just now'

    const seconds = Math.floor(deltaMs / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}

export function CompactionMessage(props: {
    event: CompactionEvent
    createdAt?: Date | null
}) {
    if (props.event.type === 'compaction-started') {
        return (
            <div className="py-1" data-testid="compaction-started">
                <div className="mx-auto w-fit max-w-[92%] px-2 text-center text-xs text-[var(--app-hint)] opacity-80">
                    <span className="inline-flex items-center gap-1">
                        <span aria-hidden="true" className="animate-pulse">⏳</span>
                        <span>Compacting context...</span>
                    </span>
                </div>
            </div>
        )
    }

    const preTokens = typeof props.event.preTokens === 'number' ? props.event.preTokens : null
    const postTokens = typeof props.event.postTokens === 'number' ? props.event.postTokens : null
    const summary = typeof props.event.summary === 'string' ? props.event.summary.trim() : ''

    const preLabel = formatTokenCount(preTokens)
    const postLabel = formatTokenCount(postTokens)
    const relative = formatRelative(props.createdAt ?? null)
    const stats = preLabel && postLabel ? `${preLabel} → ${postLabel}` : null

    const line = ['Context compacted', stats, relative].filter(Boolean).join(' · ')

    if (!summary) {
        return (
            <div className="py-1" data-testid="compaction-completed-simple">
                <div className="mx-auto w-fit max-w-[92%] px-2 text-center text-xs text-[var(--app-hint)] opacity-80">
                    <span className="inline-flex items-center gap-1">
                        <span aria-hidden="true">📦</span>
                        <span>{line}</span>
                    </span>
                </div>
            </div>
        )
    }

    return (
        <div className="py-1" data-testid="compaction-completed-accordion">
            <details className="mx-auto w-fit max-w-[92%] text-center text-xs text-[var(--app-hint)] opacity-80">
                <summary className="cursor-pointer list-none">
                    <span className="inline-flex items-center gap-1">
                        <span aria-hidden="true">📦</span>
                        <span>{line}</span>
                    </span>
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-[var(--app-secondary-bg)] px-2 py-1 text-left text-[11px] text-[var(--app-fg)]">
                    {summary}
                </div>
            </details>
        </div>
    )
}
