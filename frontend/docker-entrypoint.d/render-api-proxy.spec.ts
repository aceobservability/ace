// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('./30-render-api-proxy.sh', import.meta.url))

let workdir: string
let out: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'api-proxy-'))
  out = join(workdir, 'api-proxy.inc')
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
})

function render(backendUrl?: string): string {
  const env: Record<string, string> = { ...process.env, ACE_API_PROXY_CONF: out }
  if (backendUrl === undefined) {
    delete env.ACE_BACKEND_URL
  } else {
    env.ACE_BACKEND_URL = backendUrl
  }
  const result = spawnSync('sh', [script], { env, encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  return readFileSync(out, 'utf8')
}

describe('render-api-proxy', () => {
  it('emits no /api block when ACE_BACKEND_URL is unset', () => {
    expect(render(undefined).trim()).toBe('')
  })

  it('emits a streaming /api proxy block when ACE_BACKEND_URL is set', () => {
    const rendered = render('http://ace-backend:8080')
    expect(rendered).toContain('location /api {')
    expect(rendered).toContain('proxy_pass http://ace-backend:8080;')
    // Streaming endpoints (SSE + chunked) must not be buffered.
    expect(rendered).toContain('proxy_http_version 1.1;')
    expect(rendered).toContain('proxy_buffering off;')
    expect(rendered).toContain('proxy_read_timeout 1h;')
  })
})
