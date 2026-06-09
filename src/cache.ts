import { createHash } from 'node:crypto'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SynthesizeRequest, SynthesizeResult } from './types.js'

export class AudioCache {
  constructor(
    private readonly audioDir: string,
    private readonly publicBasePath = '/v1/tts/audio',
  ) {}

  async getOrCreate(
    request: SynthesizeRequest,
    create: () => Promise<{ audio: Buffer, mimeType: string, durationMs: number }>,
  ): Promise<SynthesizeResult> {
    await mkdir(this.audioDir, { recursive: true })
    const key = getCacheKey(request)
    const extension = getAudioExtension(request)
    const fileName = `${key}.${extension}`
    const filePath = join(this.audioDir, fileName)
    const existing = await exists(filePath)
    if (existing) {
      return {
        segmentId: request.segment.id,
        audioUrl: `${this.publicBasePath}/${fileName}`,
        fileName,
        mimeType: getMimeType(extension),
        durationMs: 0,
        cacheHit: true,
      }
    }

    const result = await create()
    await writeFile(filePath, result.audio)
    return {
      segmentId: request.segment.id,
      audioUrl: `${this.publicBasePath}/${fileName}`,
      fileName,
      mimeType: result.mimeType,
      durationMs: result.durationMs,
      cacheHit: false,
    }
  }
}

function getCacheKey(request: SynthesizeRequest): string {
  return createHash('sha256')
    .update(JSON.stringify({
      provider: request.provider ?? 'mock',
      voice: request.segment.voice ?? request.voice ?? '',
      lang: request.lang ?? '',
      outputFormat: request.outputFormat ?? '',
      rate: request.segment.rate ?? request.rate ?? '',
      pitch: request.segment.pitch ?? request.pitch ?? '',
      volume: request.segment.volume ?? request.volume ?? '',
      text: request.segment.text,
    }))
    .digest('hex')
}

function getAudioExtension(request: SynthesizeRequest): 'mp3' | 'wav' {
  const provider = request.provider ?? 'mock'
  if (provider === 'edge') return 'mp3'
  if (request.outputFormat?.includes('mp3')) return 'mp3'
  return 'wav'
}

function getMimeType(extension: 'mp3' | 'wav'): string {
  return extension === 'mp3' ? 'audio/mpeg' : 'audio/wav'
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
