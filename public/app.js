let providers = []
let selectedProvider = null
let appConfig = { apiBaseUrl: '' }
const hiddenProviderIds = new Set(['mock', 'mock-asr'])

const providersEl = document.querySelector('#providers')
const apiBaseEl = document.querySelector('#api-base')
const providerNameEl = document.querySelector('#provider-name')
const capabilitiesEl = document.querySelector('#provider-capabilities')
const fieldsEl = document.querySelector('#fields')
const enabledEl = document.querySelector('#enabled')
const formEl = document.querySelector('#config-form')
const saveStatusEl = document.querySelector('#save-status')
const invokeInputEl = document.querySelector('#invoke-input')
const invokeOutputEl = document.querySelector('#invoke-output')
const invokeStatusEl = document.querySelector('#invoke-status')
const invokeTabs = [...document.querySelectorAll('.tab')]

document.querySelector('#refresh').addEventListener('click', loadProviders)
document.querySelector('#invoke').addEventListener('click', invokeSelectedProvider)
for (const tab of invokeTabs) {
  tab.addEventListener('click', () => selectInvokeTemplate(tab.dataset.template))
}
formEl.addEventListener('submit', saveSelectedProvider)

boot().catch(showFatal)

async function boot() {
  await loadConfig()
  await loadProviders()
}

async function loadConfig() {
  try {
    const response = await fetch('/voxout.config.json', { cache: 'no-store' })
    if (response.ok) {
      appConfig = { ...appConfig, ...await response.json() }
    }
  } catch {
    appConfig = { apiBaseUrl: '' }
  }
  const apiBaseUrl = normalizeApiBaseUrl(appConfig.apiBaseUrl)
  apiBaseEl.textContent = apiBaseUrl ? `API: ${apiBaseUrl}` : 'API: same origin'
}

async function loadProviders() {
  const response = await fetch(apiUrl('/api/providers'))
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'Failed to load providers')
  providers = (payload.providers || []).filter(provider => !hiddenProviderIds.has(provider.id))
  selectedProvider = selectedProvider
    ? providers.find(provider => provider.id === selectedProvider.id) || providers[0]
    : providers[0]
  renderProviders()
  renderSelectedProvider()
}

function renderProviders() {
  providersEl.innerHTML = ''
  for (const provider of providers) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `provider-item${provider.id === selectedProvider?.id ? ' active' : ''}`
    button.innerHTML = `
      <div class="provider-row">
        <strong>${escapeHtml(provider.name)}</strong>
        <span class="badge">${provider.enabled ? 'enabled' : 'disabled'}</span>
      </div>
      <div class="muted">${escapeHtml(provider.id)}</div>
    `
    button.addEventListener('click', () => {
      selectedProvider = provider
      renderProviders()
      renderSelectedProvider()
    })
    providersEl.append(button)
  }
}

function renderSelectedProvider() {
  if (!selectedProvider) return
  providerNameEl.textContent = selectedProvider.name
  capabilitiesEl.textContent = Object.entries(selectedProvider.capabilities || {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key)
    .join(', ')
  enabledEl.checked = selectedProvider.enabled
  fieldsEl.innerHTML = ''

  for (const field of selectedProvider.fields || []) {
    const wrapper = document.createElement('div')
    wrapper.className = 'field'
    const value = field.secret
      ? ''
      : selectedProvider.config?.[field.key] ?? ''
    wrapper.innerHTML = `
      <label for="field-${field.key}">${escapeHtml(field.label)}</label>
      <input id="field-${field.key}" data-key="${field.key}" data-secret="${field.secret ? '1' : '0'}"
        type="${field.type === 'password' ? 'password' : field.type === 'boolean' ? 'checkbox' : field.type}"
        placeholder="${escapeHtml(field.placeholder || '')}">
      ${field.description ? `<small>${escapeHtml(field.description)}</small>` : ''}
    `
    const input = wrapper.querySelector('input')
    if (field.type === 'boolean') {
      input.checked = Boolean(value)
    } else {
      input.value = value
    }
    fieldsEl.append(wrapper)
  }

  syncInvokeTabs()
  setInvokeTemplate(getDefaultInvokeTemplate())
  invokeOutputEl.textContent = ''
}

function selectInvokeTemplate(template) {
  if (!supportsInvokeTemplate(template)) return
  setInvokeTemplate(template)
}

function setInvokeTemplate(template) {
  if (!selectedProvider) return
  const selectedTemplate = supportsInvokeTemplate(template) ? template : getDefaultInvokeTemplate()
  const operation = selectedTemplate === 'asr' ? 'transcribe' : 'synthesize'

  for (const tab of invokeTabs) {
    tab.classList.toggle('active', tab.dataset.template === selectedTemplate)
  }

  invokeInputEl.value = JSON.stringify({
    provider: selectedProvider.id,
    operation,
    input: operation === 'transcribe'
      ? { url: 'https://example.com/audio.m4a', format: 'txt' }
      : { text: '你好，voxout。', voice: selectedProvider.id === 'edge' ? 'zh-CN-XiaoyiNeural' : undefined },
  }, null, 2)
}

function syncInvokeTabs() {
  for (const tab of invokeTabs) {
    const supported = supportsInvokeTemplate(tab.dataset.template)
    tab.disabled = !supported
    tab.title = supported ? '' : 'Selected provider does not support this operation'
  }
}

function supportsInvokeTemplate(template) {
  if (!selectedProvider) return false
  if (template === 'asr') return Boolean(selectedProvider.capabilities?.asr)
  if (template === 'tts') return Boolean(selectedProvider.capabilities?.tts)
  return Boolean(selectedProvider.capabilities?.tts || selectedProvider.capabilities?.asr)
}

function getDefaultInvokeTemplate() {
  if (selectedProvider?.capabilities?.tts) return 'tts'
  if (selectedProvider?.capabilities?.asr) return 'asr'
  return 'provider'
}

async function saveSelectedProvider(event) {
  event.preventDefault()
  if (!selectedProvider) return
  saveStatusEl.textContent = 'Saving...'
  const config = {}
  const secrets = {}
  for (const input of fieldsEl.querySelectorAll('input')) {
    const key = input.dataset.key
    const target = input.dataset.secret === '1' ? secrets : config
    if (input.type === 'checkbox') {
      target[key] = input.checked
    } else if (input.value.trim()) {
      target[key] = input.type === 'number' ? Number(input.value) : input.value.trim()
    }
  }
  const response = await fetch(apiUrl(`/api/providers/${encodeURIComponent(selectedProvider.id)}/config`), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: enabledEl.checked, config, secrets }),
  })
  const payload = await response.json()
  if (!response.ok) {
    saveStatusEl.textContent = payload.error || 'Save failed'
    return
  }
  saveStatusEl.textContent = 'Saved'
  await loadProviders()
}

async function invokeSelectedProvider() {
  invokeStatusEl.textContent = 'Running...'
  invokeOutputEl.textContent = ''
  let body
  try {
    body = JSON.parse(invokeInputEl.value)
  } catch {
    invokeStatusEl.textContent = 'Invalid JSON'
    return
  }
  const response = await fetch(apiUrl('/api/invoke'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  invokeStatusEl.textContent = response.ok ? 'Done' : 'Failed'
  invokeOutputEl.textContent = JSON.stringify(payload, null, 2)
}

function showFatal(error) {
  providersEl.textContent = error.message
}

function apiUrl(path) {
  const apiBaseUrl = normalizeApiBaseUrl(appConfig.apiBaseUrl)
  return `${apiBaseUrl}${path}`
}

function normalizeApiBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '')
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]))
}
