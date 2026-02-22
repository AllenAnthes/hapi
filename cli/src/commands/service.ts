import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import type { CommandDefinition } from './types'

function getHapiHome(): string {
    return process.env.HAPI_HOME
        ? process.env.HAPI_HOME.replace(/^~/, homedir())
        : join(homedir(), '.hapi')
}

async function resolveHapiBinary(): Promise<string> {
    const proc = Bun.spawn(['which', 'hapi'], { stdout: 'pipe', stderr: 'ignore' })
    const output = await new Response(proc.stdout).text()
    await proc.exited
    return output.trim()
}

function getServiceFilePath(): string {
    return join(homedir(), '.config', 'systemd', 'user', 'hapi-hub.service')
}

async function hasSystemdNotify(): Promise<boolean> {
    const proc = Bun.spawn(['which', 'systemd-notify'], { stdout: 'ignore', stderr: 'ignore' })
    return (await proc.exited) === 0
}

function generateServiceUnit(binaryPath: string, hapiHome: string, useNotify: boolean): string {
    const serviceLines = useNotify
        ? `Type=notify
NotifyAccess=all
WatchdogSec=60`
        : `Type=simple`

    return `[Unit]
Description=HAPI Hub Server
After=network-online.target
Wants=network-online.target

[Service]
${serviceLines}
ExecStart=${binaryPath} hub --no-relay
Environment=HAPI_HOME=${hapiHome}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`
}

async function runSystemctl(...args: string[]): Promise<number> {
    const proc = Bun.spawn(['systemctl', '--user', ...args], {
        stdout: 'inherit',
        stderr: 'inherit'
    })
    return proc.exited
}

export const serviceCommand: CommandDefinition = {
    name: 'service',
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        const subcommand = commandArgs[0]

        if (subcommand === 'install') {
            const binaryPath = await resolveHapiBinary()
            if (!binaryPath) {
                console.error('Cannot find hapi binary in PATH')
                process.exit(1)
            }

            const hapiHome = getHapiHome()
            const serviceFile = getServiceFilePath()
            const serviceDir = join(homedir(), '.config', 'systemd', 'user')

            if (!existsSync(serviceDir)) {
                mkdirSync(serviceDir, { recursive: true })
            }

            const useNotify = await hasSystemdNotify()
            if (!useNotify) {
                console.log('Note: systemd-notify not found, using Type=simple (no watchdog)')
            }
            const unit = generateServiceUnit(binaryPath, hapiHome, useNotify)
            writeFileSync(serviceFile, unit)
            console.log(`Service file written to ${serviceFile}`)

            await runSystemctl('daemon-reload')

            const exitCode = await runSystemctl('enable', '--now', 'hapi-hub.service')
            if (exitCode === 0) {
                console.log('HAPI Hub service installed and started')
                console.log('')
                console.log('The hub will automatically restart on crash.')
                console.log('Use "hapi service status" to check health.')
            } else {
                console.error('Failed to enable/start service')
                process.exit(1)
            }
            return
        }

        if (subcommand === 'uninstall') {
            await runSystemctl('stop', 'hapi-hub.service')
            await runSystemctl('disable', 'hapi-hub.service')

            const serviceFile = getServiceFilePath()
            if (existsSync(serviceFile)) {
                unlinkSync(serviceFile)
                console.log(`Removed ${serviceFile}`)
            }

            await runSystemctl('daemon-reload')
            console.log('HAPI Hub service uninstalled')
            return
        }

        if (subcommand === 'status') {
            await runSystemctl('status', 'hapi-hub.service')
            return
        }

        console.log(`
hapi service - Manage HAPI Hub as a systemd user service

Usage:
  hapi service install     Install, enable, and start the service
  hapi service uninstall   Stop, disable, and remove the service
  hapi service status      Show systemctl status
`)
    }
}
