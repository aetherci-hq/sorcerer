import type { SorcererAPI } from '../../../preload/index'

declare global {
  interface Window {
    sorcerer?: SorcererAPI
  }
}

let _api: SorcererAPI | null = null

/**
 * Get the API client. Returns window.sorcerer in Electron,
 * or the remote client in browser.
 */
export function getApi(): SorcererAPI {
  if (_api) return _api
  if (window.sorcerer) {
    _api = window.sorcerer
    return _api
  }
  throw new Error('API not initialized. Call initRemoteClient() first in browser context.')
}

export async function initRemoteClient(baseUrl: string, token: string): Promise<void> {
  const { createRemoteClient } = await import('./remote-client')
  _api = createRemoteClient(baseUrl, token)
}

/** True if running inside Electron (context bridge available) */
export const isElectron = typeof window !== 'undefined' && !!window.sorcerer
