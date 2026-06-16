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

function run(backendUrl?: string): { status: number | null; stderr: string } {
  const env: Record<string, string> = { ...process.env, ACE_API_PROXY_CONF: out }
  if (backendUrl === undefined) {
    delete env.ACE_BACKEND_URL
  } else {
    env.ACE_BACKEND_URL = backendUrl
  }
  const result = spawnSync('sh', [script], { env, encoding: 'utf8' })
  return { status: result.status, stderr: result.stderr }
}

function render(backendUrl?: string): string {
  const result = run(backendUrl)
  expect(result.status, result.stderr).toBe(0)
  return readFileSync(out, 'utf8')
}

describe('render-api-proxy', () => {
  it('emits no /api block when ACE_BACKEND_URL is unset', () => {
    expect(render(undefined).trim()).toBe('')
  })

  it('emits a streaming /api/ proxy block when ACE_BACKEND_URL is set', () => {
    const rendered = render('http://ace-backend:8080')
    // /api/ (not /api) so /apiary etc. fall through to the SPA.
    expect(rendered).toContain('location /api/ {')
    expect(rendered).toContain('proxy_pass http://ace-backend:8080;')
    // Streaming endpoints (SSE + chunked) must not be buffered.
    expect(rendered).toContain('proxy_http_version 1.1;')
    expect(rendered).toContain('proxy_buffering off;')
    expect(rendered).toContain('proxy_read_timeout 1h;')
  })

  it('strips a trailing slash so proxy_pass keeps the /api prefix', () => {
    const rendered = render('http://ace-backend:8080/')
    expect(rendered).toContain('proxy_pass http://ace-backend:8080;')
    expect(rendered).not.toContain('http://ace-backend:8080/;')
  })

  it.each([
    ['http://ace-backend:8080; return 444', 'embedded directive'],
    ['http://ace backend:8080', 'whitespace'],
    ['ace-backend:8080', 'missing scheme'],
  ])('rejects an invalid ACE_BACKEND_URL (%s)', (value) => {
    expect(run(value).status).not.toBe(0)
  })
})
