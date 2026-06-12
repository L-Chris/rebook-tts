import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const hiddenProviderIds = new Set(['mock', 'mock-asr'])

function App() {
  const [appConfig, setAppConfig] = useState({ apiBaseUrl: '' })
  const [providers, setProviders] = useState([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [invokeStatus, setInvokeStatus] = useState('')
  const [invokeOutput, setInvokeOutput] = useState('')
  const [invokeTemplate, setInvokeTemplate] = useState('tts')
  const [invokeInput, setInvokeInput] = useState('')
  const [formValues, setFormValues] = useState({})

  const apiBaseUrl = normalizeApiBaseUrl(appConfig.apiBaseUrl)
  const selectedProvider = providers.find(provider => provider.id === selectedProviderId) ?? providers[0]

  useEffect(() => {
    loadConfig().then(setAppConfig).catch(() => setAppConfig({ apiBaseUrl: '' }))
  }, [])

  useEffect(() => {
    loadProviders().catch(error => {
      setProviders([])
      setInvokeOutput(error.message)
    })
  }, [apiBaseUrl])

  useEffect(() => {
    if (!selectedProvider) return
    setFormValues(getProviderFormValues(selectedProvider))
    const template = getDefaultInvokeTemplate(selectedProvider)
    setInvokeTemplate(template)
    setInvokeInput(JSON.stringify(createInvokePayload(selectedProvider, template), null, 2))
    setInvokeOutput('')
  }, [selectedProvider?.id])

  useEffect(() => {
    if (!selectedProvider || !supportsInvokeTemplate(selectedProvider, invokeTemplate)) return
    setInvokeInput(JSON.stringify(createInvokePayload(selectedProvider, invokeTemplate), null, 2))
  }, [invokeTemplate, selectedProvider?.id])

  async function loadProviders() {
    const response = await fetch(apiUrl('/api/providers', apiBaseUrl))
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Failed to load providers')
    const visibleProviders = (payload.providers || []).filter(provider => !hiddenProviderIds.has(provider.id))
    setProviders(visibleProviders)
    setSelectedProviderId(current => {
      if (current && visibleProviders.some(provider => provider.id === current)) return current
      return visibleProviders[0]?.id ?? ''
    })
  }

  function selectInvokeTemplate(template) {
    if (!selectedProvider || !supportsInvokeTemplate(selectedProvider, template)) return
    setInvokeTemplate(template)
  }

  async function saveSelectedProvider(event) {
    event.preventDefault()
    if (!selectedProvider) return
    setSaveStatus('Saving...')

    const config = {}
    const secrets = {}
    for (const field of selectedProvider.fields || []) {
      const value = formValues[field.key]
      const target = field.secret ? secrets : config
      if (field.type === 'boolean') {
        target[field.key] = Boolean(value)
      } else if (String(value ?? '').trim()) {
        target[field.key] = field.type === 'number' ? Number(value) : String(value).trim()
      }
    }

    const response = await fetch(apiUrl(`/api/providers/${encodeURIComponent(selectedProvider.id)}/config`, apiBaseUrl), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: Boolean(formValues.enabled), config, secrets }),
    })
    const payload = await response.json()
    if (!response.ok) {
      setSaveStatus(payload.error || 'Save failed')
      return
    }
    setSaveStatus('Saved')
    await loadProviders()
  }

  async function invokeSelectedProvider() {
    setInvokeStatus('Running...')
    setInvokeOutput('')
    let body
    try {
      body = JSON.parse(invokeInput)
    } catch {
      setInvokeStatus('Invalid JSON')
      return
    }
    const response = await fetch(apiUrl('/api/invoke', apiBaseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json()
    setInvokeStatus(response.ok ? 'Done' : 'Failed')
    setInvokeOutput(JSON.stringify(payload, null, 2))
  }

  const capabilityText = useMemo(() => {
    if (!selectedProvider) return ''
    return Object.entries(selectedProvider.capabilities || {})
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key)
      .join(', ')
  }, [selectedProvider])

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-7 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-normal">voxout</h1>
            <p className="mt-1 text-slate-500">Provider configuration and unified invocation console</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-500">
              {apiBaseUrl ? `API: ${apiBaseUrl}` : 'API: same origin'}
            </span>
            <button className="btn-primary" type="button" onClick={loadProviders}>Refresh</button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="panel">
            <h2 className="mb-4 text-lg font-bold">Providers</h2>
            <div className="grid gap-2">
              {providers.map(provider => (
                <button
                  className={`provider-card ${provider.id === selectedProvider?.id ? 'provider-card-active' : ''}`}
                  key={provider.id}
                  type="button"
                  onClick={() => setSelectedProviderId(provider.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong>{provider.name}</strong>
                    <span className="badge">{provider.enabled ? 'enabled' : 'disabled'}</span>
                  </div>
                  <div className="text-slate-500">{provider.id}</div>
                </button>
              ))}
            </div>
          </aside>

          <section className="panel">
            {selectedProvider ? (
              <>
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{selectedProvider.name}</h2>
                    <div className="text-slate-500">{capabilityText}</div>
                  </div>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(formValues.enabled)}
                      onChange={event => setFormValues({ ...formValues, enabled: event.target.checked })}
                    />
                    Enabled
                  </label>
                </div>

                <form onSubmit={saveSelectedProvider}>
                  <div className="grid gap-3 md:grid-cols-2">
                    {(selectedProvider.fields || []).map(field => (
                      <FieldInput
                        field={field}
                        key={field.key}
                        value={formValues[field.key] ?? ''}
                        onChange={value => setFormValues({ ...formValues, [field.key]: value })}
                      />
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <button className="btn-primary" type="submit">Save configuration</button>
                    <span className="text-slate-500">{saveStatus}</span>
                  </div>
                </form>

                <div className="mt-8 border-t border-slate-200 pt-5">
                  <h2 className="mb-3 text-lg font-bold">Invoke</h2>
                  <div className="mb-3 flex gap-2">
                    {['provider', 'tts', 'asr'].map(template => (
                      <button
                        className={`tab ${invokeTemplate === template ? 'tab-active' : ''}`}
                        disabled={!supportsInvokeTemplate(selectedProvider, template)}
                        key={template}
                        type="button"
                        onClick={() => selectInvokeTemplate(template)}
                      >
                        {template === 'tts' ? 'TTS' : template === 'asr' ? 'ASR' : 'Provider'}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="textarea min-h-48 font-mono text-sm"
                    spellCheck="false"
                    value={invokeInput}
                    onChange={event => setInvokeInput(event.target.value)}
                  />
                  <div className="mt-4 flex items-center gap-3">
                    <button className="btn-primary" type="button" onClick={invokeSelectedProvider}>Run</button>
                    <span className="text-slate-500">{invokeStatus}</span>
                  </div>
                  <pre className="mt-4 max-h-96 min-h-36 overflow-auto rounded-md bg-slate-950 p-3 text-sm text-slate-100">{invokeOutput}</pre>
                </div>
              </>
            ) : (
              <div className="text-slate-500">No providers available.</div>
            )}
          </section>
        </section>
      </div>
    </main>
  )
}

function FieldInput({ field, value, onChange }) {
  const inputId = `field-${field.key}`
  return (
    <label className="grid gap-1.5 text-sm font-semibold" htmlFor={inputId}>
      {field.label}
      <input
        className="input"
        id={inputId}
        placeholder={field.placeholder || ''}
        type={field.type === 'password' ? 'password' : field.type === 'boolean' ? 'checkbox' : field.type}
        checked={field.type === 'boolean' ? Boolean(value) : undefined}
        value={field.type === 'boolean' ? undefined : value}
        onChange={event => onChange(field.type === 'boolean' ? event.target.checked : event.target.value)}
      />
      {field.description ? <small className="font-normal text-slate-500">{field.description}</small> : null}
    </label>
  )
}

async function loadConfig() {
  const response = await fetch('/voxout.config.json', { cache: 'no-store' })
  if (!response.ok) return { apiBaseUrl: '' }
  return { apiBaseUrl: '', ...await response.json() }
}

function getProviderFormValues(provider) {
  const values = { enabled: provider.enabled }
  for (const field of provider.fields || []) {
    values[field.key] = field.secret ? '' : provider.config?.[field.key] ?? ''
  }
  return values
}

function supportsInvokeTemplate(provider, template) {
  if (!provider) return false
  if (template === 'asr') return Boolean(provider.capabilities?.asr)
  if (template === 'tts') return Boolean(provider.capabilities?.tts)
  return Boolean(provider.capabilities?.tts || provider.capabilities?.asr)
}

function getDefaultInvokeTemplate(provider) {
  if (provider?.capabilities?.tts) return 'tts'
  if (provider?.capabilities?.asr) return 'asr'
  return 'provider'
}

function createInvokePayload(provider, template) {
  const operation = template === 'asr' ? 'transcribe' : 'synthesize'
  return {
    provider: provider.id,
    operation,
    input: operation === 'transcribe'
      ? provider.id === 'mimo'
        ? {
            audioData: 'data:audio/wav;base64,BASE64_AUDIO',
            language: 'auto',
            format: 'txt',
          }
        : { url: 'https://example.com/audio.m4a', format: 'txt' }
      : { text: '你好，voxout。', voice: provider.id === 'edge' ? 'zh-CN-XiaoyiNeural' : undefined },
  }
}

function apiUrl(path, apiBaseUrl) {
  return `${apiBaseUrl}${path}`
}

function normalizeApiBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

createRoot(document.querySelector('#root')).render(<App />)
