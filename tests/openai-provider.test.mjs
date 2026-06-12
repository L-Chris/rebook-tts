import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { OpenAiProvider } from '../dist/providers/openai.js'
import { listProviderDefinitions } from '../dist/providers/registry.js'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('OpenAI provider sends text-to-speech requests', async () => {
  let captured
  globalThis.fetch = async (url, init) => {
    captured = {
      url: String(url),
      headers: init.headers,
      body: JSON.parse(init.body),
    }
    return new Response(Buffer.alloc(256, 1), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })
  }

  const provider = new OpenAiProvider()
  const result = await provider.synthesize({
    voiceId: 'voice_custom_1',
    outputFormat: 'mp3',
    segment: {
      id: 'tts',
      text: 'Hello from OpenAI.',
    },
  }, {
    config: { ttsModel: 'gpt-4o-mini-tts' },
    secrets: { apiKey: 'test-openai-key' },
  })

  assert.equal(result.audio.length, 256)
  assert.equal(result.mimeType, 'audio/mpeg')
  assert.equal(captured.url, 'https://api.openai.com/v1/audio/speech')
  assert.equal(captured.headers.authorization, 'Bearer test-openai-key')
  assert.deepEqual(captured.body, {
    model: 'gpt-4o-mini-tts',
    input: 'Hello from OpenAI.',
    voice: 'voice_custom_1',
    response_format: 'mp3',
  })
})

test('OpenAI provider sends voice clone requests', async () => {
  let captured
  globalThis.fetch = async (url, init) => {
    captured = {
      url: String(url),
      headers: init.headers,
      name: init.body.get('name'),
      consent: init.body.get('consent'),
      audioSample: init.body.get('audio_sample'),
    }
    return new Response(JSON.stringify({
      id: 'voice_openai_1',
      object: 'audio.voice',
      created_at: 1781220000,
      name: 'Narrator',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const provider = new OpenAiProvider()
  const result = await provider.cloneVoice({
    name: 'Narrator',
    consent: 'cons_1234',
    audioData: `data:audio/wav;base64,${Buffer.alloc(256, 1).toString('base64')}`,
    mimeType: 'audio/wav',
  }, {
    config: {},
    secrets: { apiKey: 'test-openai-key' },
  })

  assert.equal(captured.url, 'https://api.openai.com/v1/audio/voices')
  assert.equal(captured.headers.authorization, 'Bearer test-openai-key')
  assert.equal(captured.name, 'Narrator')
  assert.equal(captured.consent, 'cons_1234')
  assert.equal(captured.audioSample.type, 'audio/wav')
  assert.equal(result.voice.voiceId, 'voice_openai_1')
  assert.equal(result.voice.providerVoiceId, 'voice_openai_1')
})

test('OpenAI provider exposes TTS and voice clone metadata', async () => {
  const provider = new OpenAiProvider()
  const voices = await provider.listVoices()
  assert.equal(provider.capabilities.tts, true)
  assert.equal(provider.capabilities.voiceClone, true)
  assert.ok(voices.some(voice => voice.id === 'alloy'))

  const providers = listProviderDefinitions()
  const openai = providers.find(item => item.id === 'openai')
  assert.equal(openai.name, 'OpenAI')
  assert.equal(openai.capabilities.tts, true)
  assert.equal(openai.capabilities.voiceClone, true)
})
