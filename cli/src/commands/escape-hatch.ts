import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs'
import type { CommandDefinition } from './types'

function getHapiHome(): string {
    return process.env.HAPI_HOME
        ? process.env.HAPI_HOME.replace(/^~/, homedir())
        : join(homedir(), '.hapi')
}

function getKeyPath(): string {
    return join(getHapiHome(), 'escape-hatch-key')
}

function getServiceFilePath(): string {
    return join(homedir(), '.config', 'systemd', 'user', 'hapi-escape-hatch.service')
}

function generateService(
    sshJumpHost: string,
    keyPath: string,
    remotePort: number,
    autosshPath: string
): string {
    return `[Unit]
Description=HAPI SSH Escape Hatch (reverse tunnel to ${sshJumpHost})
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${autosshPath} -M 0 -N -o "ServerAliveInterval 30" -o "ServerAliveCountMax 3" -o "ExitOnForwardFailure yes" -o "StrictHostKeyChecking accept-new" -i ${keyPath} -R ${remotePort}:localhost:22 ${sshJumpHost}
Restart=always
RestartSec=10

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

export const escapeHatchCommand: CommandDefinition = {
    name: 'escape-hatch',
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        const subcommand = commandArgs[0]

        if (subcommand && subcommand !== 'help') {
            const hasSystemctl = Bun.spawn(['which', 'systemctl'], { stdout: 'ignore', stderr: 'ignore' })
            if (await hasSystemctl.exited !== 0) {
                console.error('systemd is not available on this host. The escape-hatch command requires systemctl.')
                process.exit(1)
            }
        }

        if (subcommand === 'setup') {
            const jumpHost = commandArgs[1]
            if (!jumpHost) {
                console.error('Usage: hapi escape-hatch setup <user@host> [remote-port]')
                console.error('  Example: hapi escape-hatch setup user@bastion.example.com')
                process.exit(1)
            }

            // Check for autossh
            const which = Bun.spawn(['which', 'autossh'], { stdout: 'pipe', stderr: 'ignore' })
            const autosshPath = (await new Response(which.stdout).text()).trim()
            await which.exited
            if (!autosshPath) {
                console.error('autossh is required. Install it with: sudo apt install autossh')
                process.exit(1)
            }

            const remotePort = commandArgs[2] ? parseInt(commandArgs[2], 10) : 2222
            if (isNaN(remotePort) || remotePort < 1 || remotePort > 65535) {
                console.error(`Invalid port: ${commandArgs[2]}. Must be 1-65535.`)
                process.exit(1)
            }

            // Ensure HAPI_HOME exists before writing keys
            const hapiHome = getHapiHome()
            if (!existsSync(hapiHome)) {
                mkdirSync(hapiHome, { recursive: true })
            }

            // Generate ed25519 keypair if it doesn't exist
            const keyPath = getKeyPath()
            if (!existsSync(keyPath)) {
                console.log('Generating SSH keypair...')
                const keygen = Bun.spawn([
                    'ssh-keygen', '-t', 'ed25519',
                    '-f', keyPath,
                    '-N', '',
                    '-C', 'hapi-escape-hatch'
                ], { stdout: 'inherit', stderr: 'inherit' })
                if (await keygen.exited !== 0) {
                    console.error('Failed to generate SSH key')
                    process.exit(1)
                }
            }

            // Show public key for user to add to jump host
            const pubKey = readFileSync(`${keyPath}.pub`, 'utf-8').trim()
            console.log('')
            console.log('Add this public key to your jump host\'s ~/.ssh/authorized_keys:')
            console.log('')
            console.log(`  ${pubKey}`)
            console.log('')
            console.log(`The reverse tunnel will forward ${jumpHost}:${remotePort} -> localhost:22`)
            console.log(`To connect: ssh -p ${remotePort} <your-user>@${jumpHost.split('@').pop()}`)
            console.log('')

            // Create systemd service
            const serviceFile = getServiceFilePath()
            const serviceDir = join(homedir(), '.config', 'systemd', 'user')
            if (!existsSync(serviceDir)) {
                mkdirSync(serviceDir, { recursive: true })
            }

            const unit = generateService(jumpHost, keyPath, remotePort, autosshPath)
            writeFileSync(serviceFile, unit)

            await runSystemctl('daemon-reload')

            const exitCode = await runSystemctl('enable', '--now', 'hapi-escape-hatch.service')
            if (exitCode === 0) {
                console.log('Escape hatch installed and started')
                console.log('Make sure to add the SSH key to your jump host first!')
            } else {
                console.error('Failed to start escape hatch service')
                console.error('Add the SSH key to your jump host, then run:')
                console.error('  systemctl --user restart hapi-escape-hatch.service')
            }
            return
        }

        if (subcommand === 'status') {
            await runSystemctl('status', 'hapi-escape-hatch.service')
            return
        }

        if (subcommand === 'teardown') {
            await runSystemctl('stop', 'hapi-escape-hatch.service')
            await runSystemctl('disable', 'hapi-escape-hatch.service')

            const serviceFile = getServiceFilePath()
            if (existsSync(serviceFile)) {
                unlinkSync(serviceFile)
            }

            const keyPath = getKeyPath()
            for (const f of [keyPath, `${keyPath}.pub`]) {
                if (existsSync(f)) unlinkSync(f)
            }

            await runSystemctl('daemon-reload')
            console.log('Escape hatch removed')
            return
        }

        console.log(`
hapi escape-hatch - SSH reverse tunnel as backup access

Usage:
  hapi escape-hatch setup <user@host> [remote-port]
      Generate SSH keypair, create autossh systemd service
      Default remote port: 2222

  hapi escape-hatch status
      Show service status

  hapi escape-hatch teardown
      Stop service, remove keypair and service file

When HAPI is broken, SSH to your jump host then:
  ssh -p <remote-port> <user>@localhost
`)
    }
}
