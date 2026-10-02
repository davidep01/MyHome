import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
const base = 'http://127.0.0.1:3001'
const headers = { 'Content-Type': 'application/json', 'X-MyHome-Client': 'desktop' }
const mode = process.env.SMOKE_MODE ?? 'direct'
for (let attempt = 0; attempt < 50; attempt++) {
  try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) })).ok) break } catch { /* boot */ }
  if (attempt === 49) throw new Error('Container non pronto')
  await new Promise((resolve) => setTimeout(resolve, 200))
}
assert.equal((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) })).status, 200)
assert.match(readFileSync('/proc/1/status', 'utf8'), /^Uid:\s+1000\s+1000/m)
assert.equal(statSync('/data/db.json').mode & 0o777, 0o600)
assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404)
assert.equal((await fetch(`${base}/api`)).status, mode === 'protected' ? 401 : 404)
const document = await fetch(`${base}/kiosk`)
assert.equal(document.status, 200)
assert.match(document.headers.get('cache-control') ?? '', /no-store/)
assert.match(await document.text(), /<html/)
if (mode === 'protected') {
  assert.equal((await fetch(`${base}/api/config`, { headers })).status, 401)
  const login = async (token) => {
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers, body: JSON.stringify({ token }) })
    assert.equal(response.status, 200)
    const cookie = response.headers.get('set-cookie')
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i)
    return cookie.split(';', 1)[0]
  }
  const admin = await login('smoke-admin-code-123')
  const kiosk = await login('smoke-kiosk-code-123')
  assert.equal((await fetch(`${base}/api/config`, { headers: { ...headers, Cookie: admin } })).status, 200)
  assert.equal((await fetch(`${base}/api`, { headers: { Cookie: admin } })).status, 404)
  assert.equal((await fetch(`${base}/api/config`, { headers: { ...headers, Cookie: kiosk } })).status, 403)
  assert.equal((await fetch(`${base}/api/layout/home`, { headers: { Cookie: kiosk } })).status, 200)
} else {
  const config = await (await fetch(`${base}/api/config`, { headers })).json()
  if (mode === 'readonly') {
    assert.equal(config.userName, 'Smoke persisted')
    assert.equal(config.storage.writable, false)
    const response = await fetch(`${base}/api/config`, { method: 'PUT', headers,
      body: JSON.stringify({ configVersion: config.configVersion, userName: 'Must not persist' }) })
    assert.equal(response.status, 409)
  } else if (mode === 'restart') {
    assert.equal(config.userName, 'Smoke persisted')
  } else {
    const save = await fetch(`${base}/api/config`, { method: 'PUT', headers,
      body: JSON.stringify({ configVersion: config.configVersion, userName: 'Smoke persisted', alarm: { photo: true } }) })
    assert.equal(save.status, 200)
    assert.equal((await (await fetch(`${base}/api/config`, { headers })).json()).userName, 'Smoke persisted')
    const jpeg = (await import('/app/backend/node_modules/jpeg-js/index.js')).default
    const image = `data:image/jpeg;base64,${jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 70).data.toString('base64')}`
    // Exercise the worker path inside the bundled production server.
    const upload = await fetch(`${base}/api/alarm/photo`, { method: 'POST', headers, body: JSON.stringify({ image }) })
    assert.equal(upload.status, 200, await upload.text())
    await new Promise((resolve, reject) => {
      const worker = new Worker('/app/backend/dist/lib/calendar-worker.js', { execArgv: [], workerData: {
        source: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR', now: '2026-10-02T10:00:00Z', horizonDays: 60,
      } })
      const timer = setTimeout(() => { void worker.terminate(); reject(new Error('Calendar worker timeout')) }, 5000)
      worker.once('error', (error) => { clearTimeout(timer); void worker.terminate(); reject(error) })
      worker.once('message', (result) => { clearTimeout(timer); void worker.terminate(); assert.deepEqual(result.events, []); resolve() })
    })
  }
}
console.log(`Container smoke: ${mode} OK`)
