# voxout

Provider gateway for speech synthesis, sound effects, and ASR.

voxout exposes one provider configuration surface and one invocation API. It
stores provider settings in MySQL through Prisma; provider keys, base URLs, and
model choices should be managed from the web console or inserted into the
`ProviderConfig` table.

## Providers

- `mock`: local WAV TTS for development and tests.
- `edge`: Microsoft Edge online TTS.
- `mimo`: Xiaomi MiMo TTS with preset voices, voice design, and ASR.
- `elevenlabs`: ElevenLabs sound-effects generation.
- `mock-asr`: local ASR stub for development.
- `bilibili-asr`: ASR through the `bilibili-mcp` Flask API.

## API

- `GET /health`
- `GET /api/providers`
- `PUT /api/providers/:providerId/config`
- `POST /api/invoke`
- `GET /audio/:file`

The old `/v1/tts/*` API has been removed.

## Invoke

TTS and sound effects:

```bash
curl -X POST http://127.0.0.1:4177/api/invoke \
  -H 'content-type: application/json' \
  --data '{"provider":"edge","operation":"synthesize","input":{"text":"你好，voxout。","voice":"zh-CN-XiaoyiNeural"}}'
```

ASR:

```bash
curl -X POST http://127.0.0.1:4177/api/invoke \
  -H 'content-type: application/json' \
  --data '{"provider":"bilibili-asr","operation":"transcribe","input":{"url":"https://example.com/audio.m4a","format":"txt"}}'
```

MiMo ASR accepts either `input.url` or inline audio data. Inline data can be a
full data URL or a base64 payload with `mimeType`:

```bash
curl -X POST http://127.0.0.1:4177/api/invoke \
  -H 'content-type: application/json' \
  --data '{"provider":"mimo","operation":"transcribe","input":{"audioData":"data:audio/wav;base64,...","language":"auto","format":"txt"}}'
```

## Provider Config

```bash
curl -X PUT http://127.0.0.1:4177/api/providers/mimo/config \
  -H 'content-type: application/json' \
  --data '{"enabled":true,"config":{"baseUrl":"https://api.xiaomimimo.com/v1"},"secrets":{"apiKey":"..."} }'
```

The web console at `/` provides the same configuration and invocation workflow.

## Development

```bash
npm install
npm run build
npm test
npm start
```

The web console is built with React, Tailwind CSS, and Vite. Source files live
under `frontend/`; `npm run build:web` writes the static build output to
`public/`. During local UI work, run:

```bash
npm run dev
```

Set `DATABASE_URL` to enable persisted provider settings. Deployment
environment variables are limited to service-level settings such as port,
database URL, audio storage, and global synthesis timeout.

## Static Frontend Deployment

Run `npm run build:web` first. The generated files under `public/` can be served
by voxout itself or copied to the existing static-server document tree:

```bash
rsync -a --delete public/ /home/data/www/tts.rethinkos.com/
```

For the current `nginx-proxy-manager` + `static-server` deployment, route
`tts.rethinkos.com` like this:

- `/`, `/assets/*`, and `/voxout.config.json` -> `static-server:80`
- `/api`, `/audio`, and `/health` -> `voxout:4177`

When the API is exposed on the same origin, keep
`frontend/public/voxout.config.json` as:

```json
{
  "apiBaseUrl": ""
}
```

If the static frontend is hosted on a different origin, set `apiBaseUrl` to the
public voxout API origin, for example `https://tts.rethinkos.com`.
