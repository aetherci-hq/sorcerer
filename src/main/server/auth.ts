import crypto from 'crypto'
import { DatabaseService } from '../services/database-service'

/** Get existing auth token or create a new one */
export function getOrCreateAuthToken(db: DatabaseService): string {
  let token = db.getSetting('remoteAuthToken')
  if (!token) {
    token = crypto.randomBytes(32).toString('hex')
    db.setSetting('remoteAuthToken', token)
  }
  return token
}

/** Generate a new auth token (invalidates old one) */
export function regenerateAuthToken(db: DatabaseService): string {
  const token = crypto.randomBytes(32).toString('hex')
  db.setSetting('remoteAuthToken', token)
  return token
}
