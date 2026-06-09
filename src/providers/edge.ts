import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EdgeTTS } from 'node-edge-tts'
import type { SynthesizeRequest, TtsProvider, TtsVoice } from '../types.js'

const DEFAULT_VOICE = 'zh-CN-XiaoyiNeural'
const DEFAULT_LANG = 'zh-CN'
const DEFAULT_OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3'

export class EdgeTtsProvider implements TtsProvider {
  readonly id = 'edge'
  readonly name = 'Microsoft Edge TTS'

  async listVoices(): Promise<TtsVoice[]> {
    return [
      { id: 'zh-CN-XiaoyiNeural', name: 'Xiaoyi', locale: 'zh-CN', gender: 'Female', provider: this.id },
      { id: 'zh-CN-YunxiNeural', name: 'Yunxi', locale: 'zh-CN', gender: 'Male', provider: this.id },
      { id: 'zh-CN-YunjianNeural', name: 'Yunjian', locale: 'zh-CN', gender: 'Male', provider: this.id },
      { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao', locale: 'zh-CN', gender: 'Female', provider: this.id },
      { id: 'en-US-AriaNeural', name: 'Aria', locale: 'en-US', gender: 'Female', provider: this.id },
      { id: 'en-US-GuyNeural', name: 'Guy', locale: 'en-US', gender: 'Male', provider: this.id },
    ]
  }

  async synthesize(request: SynthesizeRequest) {
    const tempDir = await mkdtemp(join(tmpdir(), 'rebook-edge-tts-'))
    const audioPath = join(tempDir, 'segment.mp3')
    try {
      const voice = request.segment.voice ?? request.voice ?? DEFAULT_VOICE
      const tts = new EdgeTTS({
        voice,
        lang: request.lang ?? inferLangFromVoice(voice),
        outputFormat: request.outputFormat ?? DEFAULT_OUTPUT_FORMAT,
        saveSubtitles: false,
        pitch: request.segment.pitch ?? request.pitch ?? 'default',
        rate: request.segment.rate ?? request.rate ?? 'default',
        volume: request.segment.volume ?? request.volume ?? 'default',
        timeout: Number(process.env.EDGE_TTS_TIMEOUT_MS ?? 30000),
        proxy: process.env.EDGE_TTS_PROXY,
      })

      await tts.ttsPromise(request.segment.text, audioPath)
      const audio = await readFile(audioPath)
      return {
        audio,
        mimeType: 'audio/mpeg',
        durationMs: 0,
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }
}

function inferLangFromVoice(voice: string): string {
  const match = /^([a-z]{2}-[A-Z]{2})-/.exec(voice)
  return match?.[1] ?? DEFAULT_LANG
}
