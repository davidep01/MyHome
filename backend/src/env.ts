import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const cwd = process.cwd()
const root = basename(cwd) === 'backend' ? join(cwd, '..') : cwd
const files = [
  join(root, '.env.local'),
  join(root, '.env'),
  join(root, 'backend/.env.local'),
  join(root, 'backend/.env'),
]

for (const file of files) {
  if (!existsSync(file)) continue

  for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const index = trimmed.indexOf('=')
    if (index === -1) continue

    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}
