import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/** Run the real entrypoint against an isolated /data and harmless privilege stubs. */
function startup(mode: string, admin = '', kiosk = '') {
  const root = mkdtempSync(join(tmpdir(), 'myhome-startup-'))
  try {
    const bin = join(root, 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'chown'), '#!/bin/sh\nexit 0\n', { mode: 0o700 })
    writeFileSync(join(bin, 'su-exec'), '#!/bin/sh\nprintf "mode=%s\\n" "$MYHOME_AUTH_MODE"\n', { mode: 0o700 })
    const script = readFileSync(resolve('run.sh'), 'utf8').replaceAll('/data', join(root, 'data'))
    const scriptPath = join(root, 'run.sh')
    writeFileSync(scriptPath, script)
    return spawnSync('sh', [scriptPath], {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        MYHOME_AUTH_MODE: mode,
        MYHOME_ADMIN_TOKEN: admin,
        MYHOME_KIOSK_TOKEN: kiosk,
      },
    })
  } finally { rmSync(root, { recursive: true, force: true }) }
}

describe('container authentication settings', () => {
  it('keeps direct LAN access as the default without credentials', () => {
    const result = startup('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('mode=disabled')
  })
  it('does not silently disable explicitly required authentication', () => {
    const result = startup('required')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('richiede MYHOME_ADMIN_TOKEN')
    expect(result.stdout).not.toContain('mode=disabled')
  })
  it('enables authentication when an admin code is configured', () => {
    const result = startup('', 'audit-admin-secret')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('mode=required')
  })
  it('honors explicit disabled mode even with stored environment credentials', () => {
    const result = startup('disabled', 'audit-admin-secret')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('mode=disabled')
  })
  it('rejects invalid modes and identical admin and kiosk codes', () => {
    expect(startup('require').status).toBe(1)
    expect(startup('required', 'audit-admin-secret', 'audit-admin-secret').status).toBe(1)
  })
})
