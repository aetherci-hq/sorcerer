import type { SorcererAPI } from '../../../preload/index'

declare global {
  const __APP_VERSION__: string
  interface Window {
    sorcerer?: SorcererAPI
  }
}
