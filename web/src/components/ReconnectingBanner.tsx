import { useEffect, useState } from 'react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useTranslation } from '@/lib/use-translation'

type ReconnectMode = 'restarting' | 'disconnected'

export function ReconnectingBanner({
    isReconnecting,
    mode = 'disconnected',
    retryCount = 0,
    onRetryNow
}: {
    isReconnecting: boolean
    mode?: ReconnectMode
    retryCount?: number
    onRetryNow?: () => void
}) {
    const { t } = useTranslation()
    const isOnline = useOnlineStatus()
    const [elapsedSeconds, setElapsedSeconds] = useState(0)

    useEffect(() => {
        if (!isReconnecting) {
            setElapsedSeconds(0)
            return
        }
        const interval = setInterval(() => {
            setElapsedSeconds(prev => prev + 1)
        }, 1000)
        return () => clearInterval(interval)
    }, [isReconnecting])

    if (!isReconnecting || !isOnline) {
        return null
    }

    const title = mode === 'restarting'
        ? t('reconnecting.restarting.title')
        : t('reconnecting.disconnected.title')

    const subtitle = mode === 'restarting'
        ? t('reconnecting.restarting.subtitle')
        : t('reconnecting.disconnected.subtitle')

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[var(--app-bg)] rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl text-center space-y-4">
                <div className="mx-auto h-10 w-10 border-[3px] border-amber-500 border-t-transparent rounded-full animate-spin" />
                <div className="text-base font-semibold text-[var(--app-fg)]">{title}</div>
                <div className="text-sm text-[var(--app-hint)]">{subtitle}</div>
                <div className="text-xs text-[var(--app-hint)] tabular-nums">
                    {t('reconnecting.elapsed', { seconds: String(elapsedSeconds) })}
                    {retryCount > 0 && ` · ${t('reconnecting.attempt', { n: String(retryCount) })}`}
                </div>
                {onRetryNow && (
                    <button
                        onClick={onRetryNow}
                        className="text-sm font-medium text-blue-500 hover:text-blue-400 active:text-blue-600"
                    >
                        {t('reconnecting.retryNow')}
                    </button>
                )}
            </div>
        </div>
    )
}
