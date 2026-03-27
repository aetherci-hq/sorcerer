// Windows code signing via Azure Trusted Signing
// Requires: az CLI with trustedsigning extension, plus env vars:
//   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
//   AZURE_CODE_SIGNING_ACCOUNT, AZURE_CODE_SIGNING_PROFILE, AZURE_CODE_SIGNING_ENDPOINT
//
// When env vars are not set (local dev builds), signing is skipped silently.

const { execSync } = require('child_process')

exports.default = async function sign(configuration) {
  // Skip signing in local dev builds
  if (!process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_ID) {
    console.log('[sign-windows] No Azure credentials found, skipping signing')
    return
  }

  const filePath = configuration.path
  console.log(`[sign-windows] Signing: ${filePath}`)

  try {
    // Authenticate with Azure
    execSync(
      `az login --service-principal --username "${process.env.AZURE_CLIENT_ID}" --password "${process.env.AZURE_CLIENT_SECRET}" --tenant "${process.env.AZURE_TENANT_ID}"`,
      { stdio: 'pipe' }
    )

    // Sign with Azure Trusted Signing
    execSync(
      `az trustedsigning sign ` +
      `--azure-key-vault-url "${process.env.AZURE_CODE_SIGNING_ENDPOINT}" ` +
      `--account "${process.env.AZURE_CODE_SIGNING_ACCOUNT}" ` +
      `--certificate-profile "${process.env.AZURE_CODE_SIGNING_PROFILE}" ` +
      `--files "${filePath}" ` +
      `--timestamp-url "http://timestamp.acs.microsoft.com" ` +
      `--timestamp-digest "SHA256" ` +
      `--file-digest "SHA256"`,
      { stdio: 'inherit' }
    )

    console.log(`[sign-windows] Signed successfully: ${filePath}`)
  } catch (err) {
    console.error(`[sign-windows] Signing failed:`, err.message)
    throw err
  }
}
