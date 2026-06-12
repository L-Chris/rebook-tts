import { BilibiliAsrProvider } from './bilibili-asr.js'
import { EdgeTtsProvider } from './edge.js'
import type { AsrProvider, ProviderContext, ProviderFieldDefinition, SynthesizeRequest, TranscribeRequest, TtsProvider, TtsVoice } from '../../types.js'

export class DefaultProvider implements TtsProvider, AsrProvider {
  readonly id = 'default'
  readonly name = 'Default'
  readonly capabilities = { tts: true, ttsStreaming: true, asr: true }
  readonly fields: ProviderFieldDefinition[]

  constructor(
    private readonly edge = new EdgeTtsProvider('default'),
    private readonly bilibili = new BilibiliAsrProvider('default'),
  ) {
    this.fields = [
      ...this.edge.fields,
      ...this.bilibili.fields,
    ]
  }

  listVoices(context?: ProviderContext): Promise<TtsVoice[]> {
    return this.edge.listVoices(context)
  }

  synthesize(request: SynthesizeRequest, context?: ProviderContext) {
    return this.edge.synthesize(request, context)
  }

  streamSynthesize(request: SynthesizeRequest, context?: ProviderContext) {
    return this.edge.streamSynthesize(request, context)
  }

  transcribe(request: TranscribeRequest) {
    return this.bilibili.transcribe(request)
  }
}
