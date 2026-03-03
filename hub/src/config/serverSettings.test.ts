import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { DEFAULT_COMPACT_PERCENT } from '@hapi/protocol'
import { loadServerSettings } from './serverSettings'

describe('loadServerSettings compactPercent', () => {
    const createdDirs: string[] = []

    const makeTempDir = (): string => {
        const dir = mkdtempSync(join(tmpdir(), 'hapi-server-settings-'))
        createdDirs.push(dir)
        return dir
    }

    afterEach(() => {
        delete process.env.HAPI_COMPACT_PERCENT
        const existsSyncMock = fs.existsSync as unknown as { mockReset?: () => void }
        const readFileMock = fsPromises.readFile as unknown as { mockReset?: () => void }
        existsSyncMock.mockReset?.()
        readFileMock.mockReset?.()
        for (const dir of createdDirs.splice(0, createdDirs.length)) {
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('defaults compactPercent when env and file are absent', async () => {
        const dir = makeTempDir()
        const result = await loadServerSettings(dir)
        expect(result.settings.compactPercent).toBe(DEFAULT_COMPACT_PERCENT)
        expect(result.sources.compactPercent).toBe('default')
    })

    it('reads compactPercent from env and persists when missing in file', async () => {
        const dir = makeTempDir()
        process.env.HAPI_COMPACT_PERCENT = '0.65'

        const result = await loadServerSettings(dir)
        expect(result.settings.compactPercent).toBe(0.65)
        expect(result.sources.compactPercent).toBe('env')
    })

    it('reads compactPercent from settings file when env is absent', async () => {
        const dir = makeTempDir()
        const settingsFile = join(dir, 'settings.json')
        const existsSyncMock = fs.existsSync as unknown as { mockReturnValue?: (value: boolean) => void }
        const readFileMock = fsPromises.readFile as unknown as { mockResolvedValue?: (value: string) => void }

        if (typeof existsSyncMock.mockReturnValue === 'function' && typeof readFileMock.mockResolvedValue === 'function') {
            existsSyncMock.mockReturnValue(true)
            readFileMock.mockResolvedValue(JSON.stringify({ compactPercent: 0.72 }))
        } else {
            writeFileSync(settingsFile, JSON.stringify({ compactPercent: 0.72 }))
        }

        const result = await loadServerSettings(dir)
        expect(result.settings.compactPercent).toBe(0.72)
        expect(result.sources.compactPercent).toBe('file')
    })

    it('throws for invalid HAPI_COMPACT_PERCENT values', async () => {
        const dir = makeTempDir()
        process.env.HAPI_COMPACT_PERCENT = '1.5'
        await expect(loadServerSettings(dir)).rejects.toThrow('HAPI_COMPACT_PERCENT must be a number where 0 < value <= 1')
    })
})
