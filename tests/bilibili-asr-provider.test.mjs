import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { BilibiliAsrProvider } from '../dist/providers/default/bilibili-asr.js'
import { listProviderDefinitions } from '../dist/providers/registry.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('Bilibili ASR provider sends media subtitle requests', async () => {
  const captured = []
  globalThis.fetch = async (url, init) => {
    captured.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body) : undefined,
    })
    if (String(url).includes('/task/result')) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          task_id: 'task-1',
          state: 4,
          result: JSON.stringify({
            utterances: [
              { start_time: 0, end_time: 1200, transcript: '转写文本' },
            ],
          }),
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({
      code: 0,
      data: { task_id: 'task-1' },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const provider = new BilibiliAsrProvider()
  const result = await provider.transcribe(
    { url: 'https://example.com/audio.m4a', format: 'txt' },
  )

  assert.equal(captured[0].url, 'https://member.bilibili.com/x/bcut/rubick-interface/task')
  assert.equal(captured[0].method, 'POST')
  assert.deepEqual(captured[0].body, { resource: 'https://example.com/audio.m4a', model_id: '8' })
  assert.match(captured[1].url, /^https:\/\/member\.bilibili\.com\/x\/bcut\/rubick-interface\/task\/result\?/)
  assert.equal(result.provider, 'default')
  assert.equal(result.text, '转写文本')
})

test('Provider definitions include default provider with TTS and ASR', () => {
  const providers = listProviderDefinitions()
  const provider = providers.find(item => item.id === 'default')
  assert.equal(provider.capabilities.tts, true)
  assert.equal(provider.capabilities.asr, true)
  assert.ok(provider.fields.some(field => field.key === 'voicesUrl'))
  assert.ok(provider.fields.some(field => field.key === 'timeoutMs' && field.label === 'Timeout (ms)'))
  assert.ok(!providers.some(item => item.id === 'bilibili-asr'))
  assert.ok(!providers.some(item => item.id === 'edge'))
})
