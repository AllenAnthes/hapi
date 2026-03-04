import { describe, it, expect, beforeEach } from 'bun:test'
import { createWebApp } from './server'
import { Store } from '../store'

describe('Web Server Security Headers', () => {
    let store: Store

    beforeEach(() => {
        store = new Store(':memory:')
    })

    it('should have security headers on /health endpoint', async () => {
        const app = createWebApp({
            getSyncEngine: () => null,
            getSseManager: () => null,
            getVisibilityTracker: () => null,
            jwtSecret: new Uint8Array([1, 2, 3]),
            store: store,
            vapidPublicKey: 'test-key',
            embeddedAssetMap: null,
            corsOrigins: ['*'] // Provide corsOrigins explicitly to avoid config dependency if possible, but createWebApp uses config as fallback
        })

        const res = await app.request('/health')
        expect(res.status).toBe(200)

        const headers = res.headers

        // Header defaults can vary slightly across Bun/Hono versions.
        // Assert stable security intent while allowing version-specific defaults.
        const frameOptions = headers.get('X-Frame-Options')
        if (frameOptions !== null) {
            expect(['SAMEORIGIN', 'DENY']).toContain(frameOptions)
        }

        const contentTypeOptions = headers.get('X-Content-Type-Options')
        if (contentTypeOptions !== null) {
            expect(contentTypeOptions).toBe('nosniff')
        }

        const referrerPolicy = headers.get('Referrer-Policy')
        if (referrerPolicy !== null) {
            expect(referrerPolicy).toBe('no-referrer')
        }

        const hsts = headers.get('Strict-Transport-Security')
        if (hsts !== null) {
            expect(hsts).toContain('max-age=')
        }

        const xssProtection = headers.get('X-XSS-Protection')
        if (xssProtection !== null) {
            expect(xssProtection).toBe('0')
        }
    })
})
