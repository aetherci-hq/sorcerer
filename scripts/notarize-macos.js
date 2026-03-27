// macOS notarization after-sign hook for electron-builder
// Requires env vars: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
//
// When env vars are not set (local dev builds), notarization is skipped silently.

const { notarize } = require('@electron/notarize')

exports.default = async function notarizeMacOS(context) {
  const { electronPlatformName, appOutDir } = context

  if (electronPlatformName !== 'darwin') return

  // Skip notarization in local dev builds
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.log('[notarize-macos] No Apple credentials found, skipping notarization')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`

  console.log(`[notarize-macos] Notarizing: ${appPath}`)

  await notarize({
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
    tool: 'notarytool'
  })

  console.log('[notarize-macos] Notarization complete')
}
