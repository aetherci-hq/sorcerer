import { spawnSync } from 'child_process'
import { DatabaseService } from './database-service'
import { getProviderRunners, type ProviderRunner } from './provider-runners'

const PROVIDER_REGISTRY_KEY = 'providerRegistry'
const LEGACY_DEFAULT_MODEL_KEY = 'defaultModel'

interface StoredProviderEntry {
  id: string
  name: string
  apiKeyEnv: string | null
  binaryPath: string | null
  detected: boolean
  detectionError?: string
  supportsMcpConfig: boolean
  supportsModelOverride: boolean
  supportsRemoteControl: boolean
  supportsSystemPrompt: boolean
  models: string[]
  usesFallbackModels: boolean
  lastCheckedAt: number
}

interface StoredProviderRegistry {
  providers: StoredProviderEntry[]
  refreshedAt: number
}

export interface ProviderRegistryEntry extends StoredProviderEntry {
  defaultModel: string
  isDefault: boolean
}

export function getDefaultProviderId(db: DatabaseService): string {
  const providers = listProviders(db)
  return providers.find((provider) => provider.isDefault)?.id || providers[0]?.id || 'claude'
}

export function listProviders(db: DatabaseService): ProviderRegistryEntry[] {
  const cached = readStoredRegistry(db)
  if (!cached || cached.providers.length === 0) {
    return refreshProviders(db)
  }
  return decorateProviders(db, cached.providers)
}

export function refreshProviders(db: DatabaseService): ProviderRegistryEntry[] {
  const checkedAt = Math.floor(Date.now() / 1000)
  const providers = getProviderRunners().map((runner) => probeRunner(runner, checkedAt))
  db.setSetting(PROVIDER_REGISTRY_KEY, JSON.stringify({
    providers,
    refreshedAt: checkedAt
  } satisfies StoredProviderRegistry))
  return decorateProviders(db, providers)
}

function decorateProviders(
  db: DatabaseService,
  providers: StoredProviderEntry[]
): ProviderRegistryEntry[] {
  const defaultProviderId = ensureDefaultProvider(db, providers)
  return providers.map((provider) => ({
    ...provider,
    defaultModel: getDefaultModel(db, provider, defaultProviderId),
    isDefault: provider.id === defaultProviderId
  }))
}

function ensureDefaultProvider(
  db: DatabaseService,
  providers: StoredProviderEntry[]
): string {
  const savedDefault = db.getSetting('defaultProvider')
  const detectedProviders = providers.filter((provider) => provider.detected)
  const fallbackDefault = detectedProviders[0]?.id || providers[0]?.id || 'claude'
  const nextDefault = savedDefault && detectedProviders.some((provider) => provider.id === savedDefault)
    ? savedDefault
    : fallbackDefault

  if (nextDefault && nextDefault !== savedDefault) {
    db.setSetting('defaultProvider', nextDefault)
  }

  return nextDefault
}

function getDefaultModel(
  db: DatabaseService,
  provider: StoredProviderEntry,
  defaultProviderId: string
): string {
  const keyedValue = db.getSetting(getDefaultModelSettingKey(provider.id))
  if (keyedValue) return keyedValue

  const legacyValue = db.getSetting(LEGACY_DEFAULT_MODEL_KEY)
  if (legacyValue && provider.id === defaultProviderId) {
    return legacyValue
  }

  return provider.models[0] || ''
}

function getDefaultModelSettingKey(providerId: string): string {
  return `defaultModel.${providerId}`
}

function readStoredRegistry(db: DatabaseService): StoredProviderRegistry | null {
  const raw = db.getSetting(PROVIDER_REGISTRY_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredProviderRegistry
    if (!Array.isArray(parsed.providers)) return null
    return parsed
  } catch {
    return null
  }
}

function probeRunner(
  runner: ProviderRunner,
  checkedAt: number
): StoredProviderEntry {
  const binaryPath = runner.resolveBinary()
  const probe = probeBinary(binaryPath)
  const discoveredModels = runner.discoverModels?.() || {
    models: runner.fallbackModels,
    usesFallback: true
  }

  return {
    id: runner.id,
    name: runner.name,
    apiKeyEnv: runner.apiKeyEnv,
    binaryPath: probe.detected ? binaryPath : null,
    detected: probe.detected,
    detectionError: probe.detected ? undefined : probe.error,
    supportsMcpConfig: runner.capabilities.supportsMcpConfig,
    supportsModelOverride: runner.capabilities.supportsModelOverride && probe.supportsModelFlag,
    supportsRemoteControl: runner.capabilities.supportsRemoteControl,
    supportsSystemPrompt: runner.capabilities.supportsSystemPrompt,
    models: dedupeModels(discoveredModels.models),
    usesFallbackModels: discoveredModels.usesFallback,
    lastCheckedAt: checkedAt
  }
}

function probeBinary(binaryPath: string): {
  detected: boolean
  error?: string
  supportsModelFlag: boolean
} {
  const useShell = /\.cmd$|\.bat$/i.test(binaryPath)
  const result = spawnSync(binaryPath, ['--help'], {
    encoding: 'utf8',
    timeout: 4000,
    windowsHide: true,
    shell: useShell
  })

  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim()
  const supportsModelFlag = /(^|\s)(-m,\s*)?--model\b/m.test(output)

  if (result.error) {
    return {
      detected: false,
      error: result.error.message,
      supportsModelFlag
    }
  }

  if (result.status === 0 || /usage:/i.test(output)) {
    return {
      detected: true,
      supportsModelFlag
    }
  }

  return {
    detected: false,
    error: output.split('\n')[0] || `Exited with status ${result.status}`,
    supportsModelFlag
  }
}

function dedupeModels(models: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const model of models) {
    const normalized = model.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push(normalized)
  }
  return deduped
}
