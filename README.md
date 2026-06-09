# rebook-tts

Node.js + TypeScript TTS service for rebook.

The service is provider-based. It includes:

- `edge`: Microsoft Edge online TTS through `node-edge-tts`, returning MP3.
- `mock`: local WAV tone output for development and tests without network.

Additional providers can implement the same `TtsProvider` interface.

## API

- `GET /health`
- `GET /v1/tts/providers`
- `GET /v1/tts/voices?provider=mock`
- `POST /v1/tts/synthesize`
- `POST /v1/tts/jobs`
- `GET /v1/tts/jobs/:id`
- `GET /v1/tts/jobs/:id/segments`
- `GET /v1/tts/audio/:file`

## Development

```bash
npm run build
npm start
```

By default the server listens on `4177` and stores generated audio under
`./audio`.

```bash
curl -X POST http://127.0.0.1:4177/v1/tts/synthesize \
  -H 'content-type: application/json' \
  --data '{"provider":"edge","voice":"zh-CN-XiaoyiNeural","segment":{"id":"demo","text":"你好，rebook TTS。"}}'
```
