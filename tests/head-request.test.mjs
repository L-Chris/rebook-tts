import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { after, before, test } from 'node:test'

let serverProcess
let baseUrl
let audioDir
let serverStderr = ''

before(async () => {
  const port = await getFreePort()
  audioDir = await mkdtemp(join(tmpdir(), 'voxout-head-'))
  baseUrl = `http://127.0.0.1:${port}`
  serverProcess = spawn(process.execPath, ['dist/server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL: '',
      NODE_ENV: 'test',
      PORT: String(port),
      TTS_AUDIO_DIR: audioDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  serverProcess.stderr.setEncoding('utf8')
  serverProcess.stderr.on('data', chunk => { serverStderr += chunk })

  await waitForServer(serverProcess)
})

after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill()
    await once(serverProcess, 'exit').catch(() => {})
  }
  if (audioDir) await rm(audioDir, { recursive: true, force: true })
})

test('HEAD returns headers without a body for public files', async () => {
  const response = await fetch(`${baseUrl}/`, { method: 'HEAD' })

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^text\/html/)
  assert.ok(Number(response.headers.get('content-length')) > 0)
  assert.equal(await response.text(), '')
})

test('HEAD returns headers without a body for JSON endpoints', async () => {
  for (const pathname of ['/health', '/api/providers']) {
    const response = await fetch(`${baseUrl}${pathname}`, { method: 'HEAD' })

    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /^application\/json/)
    assert.ok(Number(response.headers.get('content-length')) > 0)
    assert.equal(await response.text(), '')
  }
})

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start in time')), 5000)

    child.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`server exited before ready with code ${code}: ${serverStderr}`))
    })

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      if (chunk.includes('voxout listening')) {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

async function getFreePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  server.close()
  await once(server, 'close')
  return address.port
}
