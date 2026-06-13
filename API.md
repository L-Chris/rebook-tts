# Voxout API Field Mapping

本文档基于当前代码实现和各 provider 官方文档整理。`provider` 是 Voxout 的路由扩展字段，不属于 OpenAI 官方 audio API。

## 资料来源

- OpenAI Create speech: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
- OpenAI Create transcription: https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create
- OpenAI Create voice: https://developers.openai.com/api/reference/resources/audio/subresources/voices/methods/create
- ElevenLabs TTS: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- ElevenLabs STT: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
- ElevenLabs sound effects: https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
- ElevenLabs voice design: https://elevenlabs.io/docs/api-reference/text-to-voice/design
- ElevenLabs IVC voice clone: https://elevenlabs.io/docs/api-reference/voices/ivc/create
- ElevenLabs audio isolation: https://elevenlabs.io/docs/api-reference/audio-isolation/convert
- Cartesia TTS: https://docs.cartesia.ai/api-reference/tts/bytes
- Cartesia STT: https://docs.cartesia.ai/api-reference/stt/transcribe
- Cartesia voice clone: https://docs.cartesia.ai/api-reference/voices/clone
- Cartesia list voices: https://docs.cartesia.ai/api-reference/voices/list
- Gradium TTS REST: https://docs.gradium.ai/api-reference/endpoint/tts-post
- Gradium TTS WebSocket: https://docs.gradium.ai/api-reference/endpoint/tts-websocket
- Gradium STT REST: https://docs.gradium.ai/api-reference/endpoint/stt-post
- Gradium voice clone: https://docs.gradium.ai/api-reference/endpoint/create-voice
- MiMo OpenAI-compatible chat API: https://mimo.mi.com/docs/en-US/api/chat/openai-api
- MiMo V2.5 speech synthesis guide: https://mimo.mi.com/docs/en-US/usage-guide/speech-synthesis-v2.5
- MiMo rate/model list: https://mimo.mi.com/docs/zh-CN/api/guidance/rate-limit

## Provider 配置通用字段

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| `accountId` | 无 | 仅用于 Voxout `voice_provider_links.provider_account_id`，不发送给下游。 | 无 |
| `timeoutMs` | 无 | 统一作为 provider 调用超时；Edge 也映射到 `node-edge-tts` 的 `timeout`。 | 无 |

## POST `/v1/audio/speech`

生成语音。请求体是 JSON。非流式返回音频 bytes；`stream_format` 存在时返回音频流或 SSE。

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| `model`，必填，除非 `provider` 显式指定。可以是 OpenAI speech model，也可以是 provider id。 | 必填；官方支持 `tts-1`、`tts-1-hd`、`gpt-4o-mini-tts`、`gpt-4o-mini-tts-2025-12-15`。 | OpenAI: `model`；ElevenLabs: `model_id`；Cartesia: `model_id`；Gradium: `model_name`；MiMo: `model`；Default/Edge: 不使用。 | 无。非 OpenAI provider 只接收已归一化后的 `model`。 |
| `provider`，可选，Voxout 扩展。 | 无。 | 只用于选择 provider。若省略且 `model` 命中 provider id，则使用该 provider；若命中 OpenAI speech model 或未知模型名，则路由到 `openai`。 | 无 |
| `input`，必填 string。 | 必填；最大 4096 字符。 | OpenAI: `input`；ElevenLabs: `text`；Cartesia: `transcript`；Gradium: `text`；MiMo: `messages[].content`；Default/Edge: SSML 文本。 | 无 |
| `voice`，可选 string。 | 官方支持内置 voice string，也支持 `{ id }` custom voice object。 | 当前只接受 string，不接受 `{ id }` object。OpenAI: `voice`；ElevenLabs: path `:voice_id`；Cartesia: `voice: { mode: "id", id }`；Gradium: `voice_id`；MiMo: `audio.voice`；Default/Edge: `voice`。若传 Voxout voice id，会先解析为对应 provider voice id。 | 无 |
| `response_format`，可选。 | 官方支持 `mp3`、`opus`、`aac`、`flac`、`wav`、`pcm`。 | OpenAI: 原样 `response_format`；ElevenLabs: `output_format` query，`mp3 -> mp3_44100_128`，`pcm -> pcm_44100`，`wav -> pcm_44100` 后由 Voxout 包 WAV；Cartesia: `output_format` object；Gradium: `output_format`；MiMo: `audio.format`；Default/Edge: `outputFormat`。 | 无 |
| `speed`，可选 number。 | 官方范围 `0.25` 到 `4.0`。 | OpenAI: `speed`；Cartesia: `generation_config.speed`；Default/Edge: 转成 prosody `rate`；ElevenLabs、Gradium、MiMo 当前忽略。 | 无 |
| `instructions`，可选 string。 | 官方用于控制生成语音风格；不适用于 `tts-1` / `tts-1-hd`。 | OpenAI: `instructions`；MiMo: 作为 user prompt 加入 `messages`；其他 provider 当前忽略。 | 无 |
| `stream_format`，可选 `audio` 或 `sse`。 | 官方支持 `audio` 和 `sse`；`sse` 不适用于 `tts-1` / `tts-1-hd`。 | OpenAI: `stream_format`；ElevenLabs: 只支持 `audio`，`sse` 会报错；Cartesia: 下游 `/tts/sse`，`sse` 原样返回，`audio` 会由 Voxout 解 SSE 中 base64 音频；Gradium: WebSocket，`sse` 会报错；MiMo: `stream: true`，`sse` 原样返回，`audio` 解 SSE 音频；Default/Edge: WebSocket，`sse` 由 Voxout 包装。 | 无 |
| 响应 | 官方返回音频文件内容，或音频事件流。 | Voxout 返回 `audio/*` bytes；`stream_format=sse` 时返回 `text/event-stream`；必要时做 `pcm <-> wav` 简单转换。 | 不返回 provider 原始 JSON。 |

## POST `/v1/audio/transcriptions`

语音转文字。请求体是 `multipart/form-data`。当前支持 `file`、`url` 或 `audioData` 三种输入。

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| `file`，可选 file。 | 官方必填 `file`，支持 `flac/mp3/mp4/mpeg/mpga/m4a/ogg/wav/webm` 等。 | OpenAI: `file`；ElevenLabs: `file`；Cartesia: `file`；Gradium: request body bytes；MiMo: 转 data URL 放入 `input_audio.data`；Default/Bilibili: 不支持 file。 | 无 |
| `url`，可选 string。 | 无。 | OpenAI/Cartesia/Gradium/MiMo: Voxout 先下载后上传；ElevenLabs: `source_url`；Default/Bilibili: `resource`。 | 无 |
| `audioData`，可选 base64 或 data URL。 | 无。 | OpenAI/ElevenLabs/Cartesia/Gradium/MiMo: 转成各 provider 所需 file/data/body；Default/Bilibili: 不支持。 | 无 |
| `mimeType`，可选 string。 | 无。 | 用于构造 file MIME 或 data URL；Gradium 会据此推断 `input_format`。 | 无 |
| `model`，必填，除非 `provider` 显式指定。 | 必填；官方支持 `whisper-1`、`gpt-4o-transcribe`、`gpt-4o-mini-transcribe`、`gpt-4o-mini-transcribe-2025-12-15`、`gpt-4o-transcribe-diarize`。 | OpenAI: `model`；ElevenLabs: `model_id`；Cartesia: `model`；Gradium: query `model`；MiMo: `model`；Default/Bilibili: 固定 `model_id=8`。 | 无 |
| `provider`，可选，Voxout 扩展。 | 无。 | 只用于选择 provider。若省略且 `model` 命中 provider id，则使用该 provider；若命中 OpenAI ASR model 或未知模型名，则路由到 `openai`。 | 无 |
| `language`，可选 string。 | 官方 ISO-639-1，可提升准确率和延迟。 | OpenAI: `language`；ElevenLabs: `language_code`；Cartesia: `language`，会裁剪地区码；Gradium: `json_config={"language":...}`，会裁剪地区码；MiMo: `asr_options.language`，默认 `auto`；Default/Bilibili: 忽略。 | 无 |
| `prompt`，可选 string。 | 官方用于引导转写风格；`gpt-4o-transcribe-diarize` 不支持。 | OpenAI: `prompt`；其他 provider 当前忽略。 | 无 |
| `response_format`，可选。 | 官方支持 `json`、`text`、`srt`、`verbose_json`、`vtt`、`diarized_json`，但新模型支持范围有限。 | OpenAI: 原样传给下游；非 OpenAI: `srt/vtt/verbose_json/diarized_json` 会转成 provider `verbose_json` 语义，最终由 Voxout 格式化为 text/json/srt/vtt。 | 无 |
| 官方未实现字段 | 官方还支持 `chunking_strategy`、`include`、`known_speaker_names`、`known_speaker_references`、`stream`、`temperature`、`timestamp_granularities[]`。 | 当前 Voxout 不读取这些字段，也不会转发。Cartesia 当前固定请求 `timestamp_granularities[]=word`。 | 无 |
| 响应 | 官方 `json` 返回 `{ text, ... }`；`text/srt/vtt` 返回文本；`verbose_json/diarized_json` 返回更详细 JSON。 | Voxout: `json -> { text }`；`text/srt/vtt -> text/plain` 或 `text/vtt`；`verbose_json/diarized_json -> { text, segments, raw }`。 | 不返回未整理的 provider 原始响应，除非内部 `raw` 被放进 verbose/diarized 输出。 |

## POST `/v1/audio/effect`

生成音效。请求体是 JSON。OpenAI 官方当前没有对应的 `/v1/audio/effect` 规范；这是 Voxout 扩展接口。

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| `provider`，必填。 | 无。 | 当前只有 ElevenLabs 实现。 | 无 |
| `input`，必填 string。 | 无。 | ElevenLabs `/sound-generation`: `text`。 | 无 |
| `model`，可选 string。 | 无。 | ElevenLabs: `model_id`，默认 provider 配置 `soundEffectModel` 或 `model` 或 `eleven_text_to_sound_v2`。 | 无 |
| `response_format`，可选 string。 | 无。 | ElevenLabs: query `output_format`，默认 provider 配置 `outputFormat` 或 `mp3_44100_128`。 | 无 |
| `duration_seconds`，可选 number。 | 无。 | ElevenLabs: `duration_seconds`，会限制到 `0.5..30`。 | 无 |
| `prompt_influence`，可选 number。 | 无。 | ElevenLabs: `prompt_influence`，会限制到 `0..1`。 | 无 |
| `loop`，可选 boolean。 | 无。 | ElevenLabs: `loop`。 | 无 |
| 响应 | 无。 | Voxout 返回音频 bytes，MIME 来自 ElevenLabs `content-type`，缺省 `audio/mpeg`。 | 不返回 ElevenLabs JSON。 |

## POST `/v1/audio/isolation`

人声/音频隔离。请求体是 `multipart/form-data`。OpenAI 官方当前没有对应的 `/v1/audio/isolation` 规范；这是 Voxout 扩展接口。

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| `provider` 或 `model`，必填其一。 | 无。 | 只用于选择 provider。当前只有 ElevenLabs 实现。 | 无 |
| `audio` 或 `file`，可选 file。 | 无。 | ElevenLabs `/audio-isolation`: `audio` multipart file。 | 无 |
| `url`，可选 string。 | 无。 | Voxout 先下载，随后作为 `audio` 上传给 ElevenLabs。 | 无 |
| `audioData`，可选 base64 或 data URL。 | 无。 | Voxout 转成 `audio` 上传给 ElevenLabs。 | 无 |
| `mimeType`，可选 string。 | 无。 | 用于构造上传 file MIME。 | 无 |
| `file_format`，可选 `pcm_s16le_16` 或 `other`。 | 无。 | ElevenLabs: `file_format`，缺省 `other`。 | 无 |
| `preview_b64`，可选 string。 | 无。 | ElevenLabs: `preview_b64`。 | 无 |
| 响应 | 无。 | Voxout 返回隔离后的音频 bytes，MIME 来自 ElevenLabs `content-type`，缺省输入 MIME。 | 不返回 ElevenLabs JSON。 |

## POST `/v1/audio/design`

通过文本描述设计声音。请求体是 JSON。OpenAI 官方当前没有对应的 `/v1/audio/design` 规范；这是 Voxout 扩展接口。

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| `provider`，必填。 | 无。 | 当前 ElevenLabs 和 MiMo 实现。 | 无 |
| `input`，必填 string。 | 无。 | ElevenLabs: `voice_description`；MiMo: voice description prompt。 | 无 |
| `name`，可选 string。 | 无。 | ElevenLabs: 当前仅用于保存 Voxout voice 名称，不发送给设计接口；MiMo: 用于保存 voice 名称。 | 无 |
| `text`，可选 string。 | 无。 | ElevenLabs: `text`；MiMo: 作为 sample text，缺省 `voiceSampleText` 配置或内置中文样例。 | 无 |
| `response_format`，可选 string。 | 无。 | ElevenLabs: query `output_format`；MiMo: 固定预览 `wav`。 | 无 |
| `model`，可选 string。 | 无。 | ElevenLabs: `model_id`；MiMo: 当前设计接口使用 provider 配置 `voiceDesignModel`，`model` 不直接传入 `createDesignedVoiceSample`。 | 无 |
| 其他 JSON 字段 | 无。 | 仅 ElevenLabs 会从 `providerOptions` 映射：`auto_generate_text`、`loudness`、`seed`、`guidance_scale`、`quality`、`reference_audio_base64`、`prompt_strength`。MiMo 当前忽略这些透传字段。 | 接受所有 JSON 类型的额外字段；实际只有 ElevenLabs 使用上述字段。 |
| 响应 | 无。 | Voxout 持久化生成的 voice，返回 `{ provider, text, voices }`。`voices[]` 是 Voxout voice record，包含 `voice_id`、`provider_links`、`preview_audio` 等。 | 不直接返回下游原始 previews，除非写入 metadata。 |

## POST `/v1/audio/voices`

上传音频素材克隆声音。请求体是 `multipart/form-data`。

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| `provider`，可选，缺省 `openai`。 | 无。 | 只用于选择 provider。 | 无 |
| `name`，必填 string。 | 官方必填。 | OpenAI: `name`；ElevenLabs: `name`；Cartesia: `name`；Gradium: `name`；MiMo: 本地保存 name。 | 无 |
| `consent`，可选 string。 | 官方必填/要求提供 consent recording id。 | OpenAI: `consent`；其他 provider 当前忽略。 | 无 |
| `audio_sample`，必填 file。 | 官方必填；最大 10 MiB，支持 `audio/mpeg`、`audio/wav`、`audio/x-wav`、`audio/ogg`、`audio/aac`、`audio/flac`、`audio/webm`、`audio/mp4`。 | OpenAI: `audio_sample`；ElevenLabs: `files[]`；Cartesia: `clip`；Gradium: `audio_file`；MiMo: 不调用下游，仅把音频作为预览保存。 | 无 |
| 当前未读取但 provider 类型存在的字段 | OpenAI 无 `description/language`。 | `VoiceCloneRequest` 类型有 `description/language`，但 `normalizeVoiceCloneInput` 当前不会从 form 读取；因此 ElevenLabs description、Cartesia language/description、Gradium language/description 当前都不会接收用户传值。Cartesia 会默认 `language=en`。Gradium 会固定 `start_s=0`，`timeout_s` 来自 provider 配置 `cloneTimeoutSeconds`。 | 无 |
| 响应 | 官方返回 `{ id, object: "audio.voice", created_at, name }`。 | Voxout 返回 OpenAI 风格 `{ id, object, created_at, name }`，同时在数据库写入 voice record 和 provider link。MiMo 因官方不会返回 provider voice id，使用本地生成 `mimo_*` voice id 并保存 preview。 | 不返回 provider 原始 clone response。 |

## GET `/v1/models`

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| 无。 | OpenAI list models 返回 `{ object: "list", data: [...] }`。 | Voxout 聚合所有非 internal provider id，并把 capabilities 放到每个 model object。 | 无 |
| 响应 | 官方 model object 更丰富。 | 当前返回 `{ id, object: "model", created: 0, owned_by: "voxout", capabilities }`。 | 无 |

## GET `/api/providers`

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| 无。 | 无。 | 返回 provider 定义、capabilities、配置 fields、启用状态、配置状态。内部测试 provider 默认不返回。 | 无 |
| 响应 | 无。 | `{ providers, database }`。secrets 会被 mask。 | 无 |

## PUT `/api/providers/:providerId/config`

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| `enabled`、`config`、`secrets`。 | 无。 | 写入 provider runtime config。Provider 自己读取的配置字段包括 `apiKey`、`baseUrl`、`ttsModel`、`asrModel`、`defaultVoiceId/defaultVoice/format/outputFormat`、`timeoutMs` 等。 | `config` 和 `secrets` 是 JSON object；provider 未读取的字段会保存但不会下发。 |
| 响应 | 无。 | `{ provider: record }`。 | 无 |

## GET `/api/voices` 和 `/api/providers/:providerId/voices`

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| `/api/voices?provider=...` 可选 provider；`/api/providers/:providerId/voices` 必填 provider path。 | 无。 | `/api/voices` 返回 Voxout 持久化 voice records；`/api/providers/:providerId/voices` 合并 provider 实时 voice list 和 Voxout 持久化 voices。OpenAI/MiMo 主要用内置列表；ElevenLabs/Cartesia/Gradium 会请求官方 voice list；Default/Edge 会请求 Edge voice catalog。 | 无 |
| 响应 | 无。 | `/api/voices -> { voices: VoiceRecord[] }`；`/api/providers/:providerId/voices -> { voices: TtsVoice[] }`。 | 无 |

## Provider 特别说明

| 实际传参 | OpenAI 规范 | 各个 provider 字段映射 | 接受的透传参数 |
|---|---|---|---|
| `default` provider | 无。 | TTS 实际是 Edge TTS；ASR 实际是 Bilibili/BCUT ASR。Edge/Bilibili 当前实现基于非 OpenAI 官方、也非稳定公开官方 API 的接口或库行为。 | 无 |
| OpenAI `voice` object `{ id }` | 官方支持。 | 当前 Voxout 只接受 string voice；如果需要完全兼容官方 custom voice object，需要改 `normalizeOpenAiSpeechInput`。 | 无 |
| OpenAI transcription streaming | 官方 `stream=true`。 | 当前 Voxout 不读取 `stream`，ASR 不支持 SSE 转写流。 | 无 |
