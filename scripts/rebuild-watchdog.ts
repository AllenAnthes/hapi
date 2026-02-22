#!/usr/bin/env bun
/**
 * Post-rebuild health watchdog
 *
 * Spawned as a detached subprocess by rebuild.ts after successful start.
 * Polls /health every 10s for 2 minutes.
 * 3 consecutive failures → restore .bak binary, restart hub.
 * Exits silently after clean 2-minute window.
 */

import { existsSync, copyFileSync, chmodSync, unlinkSync } from 'fs'

const PORT = 3006
const POLL_INTERVAL_MS = 10_000      // 10 seconds
const WATCHDOG_DURATION_MS = 120_000 // 2 minutes
const FAILURE_THRESHOLD = 3

// Parse args: --binary <path> --backup <path>
const args = process.argv.slice(2)
let binaryPath = ''
let backupPath = ''

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--binary') binaryPath = args[++i]
    if (args[i] === '--backup') backupPath = args[++i]
}

if (!binaryPath || !backupPath) {
    process.exit(1)
}

async function checkHealth(): Promise<boolean> {
    try {
        const resp = await fetch(`http://127.0.0.1:${PORT}/health`, {
            signal: AbortSignal.timeout(5000)
        })
        return resp.ok
    } catch {
        return false
    }
}

async function isSystemdServiceActive(): Promise<boolean> {
    const proc = Bun.spawn(
        ['systemctl', '--user', 'is-active', '--quiet', 'hapi-hub.service'],
        { stdout: 'ignore', stderr: 'ignore' }
    )
    return (await proc.exited) === 0
}

async function rollback(): Promise<void> {
    console.log('[Watchdog] Health checks failed — rolling back to previous binary')

    if (!existsSync(backupPath)) {
        console.error('[Watchdog] No backup binary found, cannot rollback')
        return
    }

    // Stop whatever is on the port
    const fuser = Bun.spawn(['fuser', '-k', `${PORT}/tcp`], {
        stdout: 'ignore', stderr: 'ignore'
    })
    await fuser.exited
    await Bun.sleep(1000)

    // Restore backup binary
    try { unlinkSync(binaryPath) } catch {}
    copyFileSync(backupPath, binaryPath)
    chmodSync(binaryPath, 0o755)
    console.log('[Watchdog] Restored previous binary')

    // Restart hub — prefer systemd if active
    if (await isSystemdServiceActive()) {
        const restart = Bun.spawn(
            ['systemctl', '--user', 'restart', 'hapi-hub.service'],
            { stdout: 'inherit', stderr: 'inherit' }
        )
        await restart.exited
    } else {
        const proc = Bun.spawn(['hapi', 'hub', '--no-relay'], {
            stdout: 'ignore', stderr: 'ignore', stdin: 'ignore'
        })
        proc.unref()
    }

    console.log('[Watchdog] Rollback complete, hub restarted with previous binary')
}

async function main(): Promise<void> {
    const startTime = Date.now()
    let consecutiveFailures = 0

    while (Date.now() - startTime < WATCHDOG_DURATION_MS) {
        await Bun.sleep(POLL_INTERVAL_MS)

        const healthy = await checkHealth()

        if (healthy) {
            consecutiveFailures = 0
            continue
        }

        consecutiveFailures++
        console.log(`[Watchdog] Health check failed (${consecutiveFailures}/${FAILURE_THRESHOLD})`)

        if (consecutiveFailures >= FAILURE_THRESHOLD) {
            await rollback()
            process.exit(1)
        }
    }

    // Clean 2-minute window passed
    process.exit(0)
}

main().catch(() => process.exit(1))
