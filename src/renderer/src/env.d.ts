import type { SorcererAPI } from '../../../preload/index'

declare global {
  interface Window {
    sorcerer: SorcererAPI
  }
}
