import { PrismaClient } from '@prisma/client'
import type {
  JsonObject,
  ProviderConfigInput,
  ProviderConfigRecord,
  ProviderRuntimeConfig,
  VoiceInput,
  VoiceProviderLinkRecord,
  VoiceRecord,
} from './types.js'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
  voices?: VoiceRecord[]
}

export class ProviderConfigStore {
  private readonly prisma: PrismaClient | null

  constructor() {
    this.prisma = process.env.DATABASE_URL
      ? globalForPrisma.prisma ?? new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      })
      : null

    if (this.prisma && process.env.NODE_ENV !== 'production') {
      globalForPrisma.prisma = this.prisma
    }
  }

  isDatabaseEnabled(): boolean {
    return Boolean(this.prisma)
  }

  async listConfigs(): Promise<ProviderConfigRecord[]> {
    if (!this.prisma) return []
    const records = await this.prisma.providerConfig.findMany({ orderBy: { providerId: 'asc' } })
    return records.map(record => ({
      providerId: record.providerId,
      enabled: record.enabled,
      config: toJsonObject(record.config),
      secrets: toJsonObject(record.secrets),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }))
  }

  async getConfig(providerId: string): Promise<ProviderRuntimeConfig> {
    if (!this.prisma) return { enabled: true, config: {}, secrets: {} }
    const record = await this.prisma.providerConfig.findUnique({ where: { providerId } })
    if (!record) return { enabled: true, config: {}, secrets: {} }
    return {
      enabled: record.enabled,
      config: toJsonObject(record.config),
      secrets: toJsonObject(record.secrets),
    }
  }

  async upsertConfig(providerId: string, input: ProviderConfigInput): Promise<ProviderConfigRecord> {
    if (!this.prisma) {
      throw new Error('DATABASE_URL is required before provider settings can be persisted.')
    }
    const config = sanitizeObject(input.config)
    const secrets = sanitizeObject(input.secrets)
    const existing = await this.prisma.providerConfig.findUnique({ where: { providerId } })
    const hasNewSecrets = Object.keys(secrets).length > 0
    const mergedSecrets = hasNewSecrets ? secrets : toJsonObject(existing?.secrets)
    const record = await this.prisma.providerConfig.upsert({
      where: { providerId },
      create: {
        providerId,
        enabled: input.enabled ?? true,
        config,
        secrets: mergedSecrets,
      },
      update: {
        enabled: input.enabled ?? true,
        config,
        secrets: mergedSecrets,
      },
    })
    return {
      providerId: record.providerId,
      enabled: record.enabled,
      config: toJsonObject(record.config),
      secrets: toJsonObject(record.secrets),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }
  }

  async listVoices(providerId?: string): Promise<VoiceRecord[]> {
    if (!this.prisma) {
      const voices = globalForPrisma.voices ?? []
      return providerId ? voices.filter(voice => voice.links.some(link => link.providerId === providerId)) : voices
    }
    const records = await this.prisma.voice.findMany({
      where: providerId ? { providerLinks: { some: { providerId } } } : undefined,
      include: { providerLinks: true },
      orderBy: [{ name: 'asc' }],
    })
    return records.map(toVoiceRecord)
  }

  async getVoice(providerId: string, voiceId: string): Promise<VoiceRecord | null> {
    if (!this.prisma) {
      return (globalForPrisma.voices ?? []).find(voice => (
        voice.voiceId === voiceId
        || voice.links.some(link => link.providerId === providerId && (link.providerVoiceId === voiceId || link.providerVoiceKey === voiceId))
      )) ?? null
    }
    const record = await this.prisma.voice.findUnique({
      where: { voiceId },
      include: { providerLinks: true },
    })
    if (record) return toVoiceRecord(record)
    const link = await this.prisma.voiceProviderLink.findFirst({
      where: {
        providerId,
        OR: [
          { providerVoiceId: voiceId },
          { providerVoiceKey: voiceId },
        ],
      },
      include: { voice: { include: { providerLinks: true } } },
    })
    return link ? toVoiceRecord(link.voice) : null
  }

  async upsertVoice(input: VoiceInput): Promise<VoiceRecord> {
    const metadata = sanitizeObject(input.metadata)
    const voiceId = input.voiceId?.trim() || createLocalVoiceId(input.name)
    if (!this.prisma) {
      const voices = globalForPrisma.voices ?? []
      const index = voices.findIndex(voice => voice.voiceId === voiceId)
      const now = new Date().toISOString()
      const existing = index >= 0 ? voices[index] : undefined
      const record: VoiceRecord = {
        id: existing?.id ?? voiceId,
        voiceId,
        name: input.name,
        description: input.description,
        language: input.language,
        previewMimeType: input.previewMimeType,
        previewAudio: input.previewAudio,
        metadata,
        links: existing?.links ?? [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      if (input.providerLink) {
        const link = toMemoryVoiceProviderLink(record.id, input.providerLink, now)
        const linkIndex = record.links.findIndex(item => (
          item.providerId === link.providerId
          && item.providerAccountId === link.providerAccountId
        ))
        if (linkIndex >= 0) record.links[linkIndex] = { ...record.links[linkIndex], ...link, updatedAt: now }
        else record.links.push(link)
      }
      if (index >= 0) voices[index] = record
      else voices.push(record)
      globalForPrisma.voices = voices
      return record
    }
    const record = await this.prisma.voice.upsert({
      where: { voiceId },
      create: {
        voiceId,
        name: input.name,
        description: input.description,
        language: input.language,
        previewMimeType: input.previewMimeType,
        previewAudio: input.previewAudio,
        metadata,
      },
      update: {
        name: input.name,
        description: input.description,
        language: input.language,
        previewMimeType: input.previewMimeType,
        previewAudio: input.previewAudio,
        metadata,
      },
      include: { providerLinks: true },
    })
    if (!input.providerLink) return toVoiceRecord(record)
    const providerLink = input.providerLink
    const providerAccountId = providerLink.providerAccountId?.trim() || 'default'
    const providerVoiceKey = providerLink.providerVoiceKey?.trim()
      || providerLink.providerVoiceId?.trim()
      || voiceId
    await this.prisma.voiceProviderLink.upsert({
      where: {
        voiceRecordId_providerId_providerAccountId: {
          voiceRecordId: record.id,
          providerId: providerLink.providerId,
          providerAccountId,
        },
      },
      create: {
        voiceRecordId: record.id,
        providerId: providerLink.providerId,
        providerAccountId,
        providerVoiceId: providerLink.providerVoiceId,
        providerVoiceKey,
        previewMimeType: providerLink.previewMimeType,
        previewAudio: providerLink.previewAudio,
        metadata: sanitizeObject(providerLink.metadata),
      },
      update: {
        providerVoiceId: providerLink.providerVoiceId,
        providerVoiceKey,
        previewMimeType: providerLink.previewMimeType,
        previewAudio: providerLink.previewAudio,
        metadata: sanitizeObject(providerLink.metadata),
      },
    })
    const updated = await this.prisma.voice.findUniqueOrThrow({
      where: { id: record.id },
      include: { providerLinks: true },
    })
    return toVoiceRecord(updated)
  }
}

function sanitizeObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined),
  ) as JsonObject
}

function toJsonObject(value: unknown): JsonObject {
  return sanitizeObject(value)
}

function toVoiceRecord(record: {
  id: string
  voiceId: string
  name: string
  description: string | null
  language: string | null
  previewMimeType: string | null
  previewAudio: string | null
  metadata: unknown
  providerLinks?: Array<{
    id: string
    voiceRecordId: string
    providerId: string
    providerAccountId: string
    providerVoiceId: string | null
    providerVoiceKey: string
    previewMimeType: string | null
    previewAudio: string | null
    metadata: unknown
    createdAt: Date
    updatedAt: Date
  }>
  createdAt: Date
  updatedAt: Date
}): VoiceRecord {
  return {
    id: record.id,
    voiceId: record.voiceId,
    name: record.name,
    description: record.description ?? undefined,
    language: record.language ?? undefined,
    previewMimeType: record.previewMimeType ?? undefined,
    previewAudio: record.previewAudio ?? undefined,
    metadata: toJsonObject(record.metadata),
    links: (record.providerLinks ?? []).map(toVoiceProviderLinkRecord),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

function toVoiceProviderLinkRecord(record: {
  id: string
  voiceRecordId: string
  providerId: string
  providerAccountId: string
  providerVoiceId: string | null
  providerVoiceKey: string
  previewMimeType: string | null
  previewAudio: string | null
  metadata: unknown
  createdAt: Date
  updatedAt: Date
}): VoiceProviderLinkRecord {
  return {
    id: record.id,
    voiceRecordId: record.voiceRecordId,
    providerId: record.providerId,
    providerAccountId: record.providerAccountId,
    providerVoiceId: record.providerVoiceId ?? undefined,
    providerVoiceKey: record.providerVoiceKey,
    previewMimeType: record.previewMimeType ?? undefined,
    previewAudio: record.previewAudio ?? undefined,
    metadata: toJsonObject(record.metadata),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

function toMemoryVoiceProviderLink(
  voiceRecordId: string,
  input: NonNullable<VoiceInput['providerLink']>,
  now: string,
): VoiceProviderLinkRecord {
  const providerAccountId = input.providerAccountId?.trim() || 'default'
  const providerVoiceKey = input.providerVoiceKey?.trim()
    || input.providerVoiceId?.trim()
    || voiceRecordId
  return {
    id: `${voiceRecordId}:${input.providerId}:${providerAccountId}`,
    voiceRecordId,
    providerId: input.providerId,
    providerAccountId,
    providerVoiceId: input.providerVoiceId,
    providerVoiceKey,
    previewMimeType: input.previewMimeType,
    previewAudio: input.previewAudio,
    metadata: sanitizeObject(input.metadata),
    createdAt: now,
    updatedAt: now,
  }
}

function createLocalVoiceId(name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `voice_${normalized || Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}
