# Code Signing Setup Guide

Sorcerer uses **Azure Trusted Signing** (Windows) and **Apple Developer ID + Notarization** (macOS) to eliminate SmartScreen and Gatekeeper warnings for end users.

Both signing flows are integrated into the CI release workflow (`.github/workflows/release.yml`) and skip silently when credentials are not configured, so local dev builds are unaffected.

---

## Estimated Cost

| Platform | Service | Cost |
|----------|---------|------|
| macOS | Apple Developer Program | $99/year |
| Windows | Azure Trusted Signing | $10/month (~$120/year) |
| **Total** | | **~$220/year** |

---

## macOS Setup

### 1. Join the Apple Developer Program

- Go to https://developer.apple.com/programs/
- Enroll as an individual or organization ($99/year)
- Enrollment takes 24-48 hours for approval

### 2. Create a Developer ID Application Certificate

**Option A: Via Xcode**
1. Open Xcode → Settings → Accounts → Manage Certificates
2. Click `+` → "Developer ID Application"
3. The certificate is created and installed in your Keychain

**Option B: Via Apple Developer Portal**
1. Go to https://developer.apple.com/account/resources/certificates/list
2. Click `+` → "Developer ID Application"
3. Follow the CSR (Certificate Signing Request) flow
4. Download and install the .cer file

### 3. Export the Certificate as .p12

1. Open **Keychain Access** on your Mac
2. Find the "Developer ID Application" certificate under "My Certificates"
3. Right-click → "Export" → choose `.p12` format
4. Set a strong password (you'll need this for CI)
5. Base64-encode it for GitHub Actions:
   ```bash
   base64 -i DeveloperIDApplication.p12 | pbcopy
   ```
   This copies the base64 string to your clipboard.

### 4. Generate an App-Specific Password

1. Go to https://appleid.apple.com → Sign In
2. Navigate to "App-Specific Passwords"
3. Click "Generate" → name it "Sorcerer CI"
4. Save the generated password

### 5. Find Your Team ID

1. Go to https://developer.apple.com/account → Membership Details
2. Your Team ID is a 10-character alphanumeric string

### 6. Add GitHub Actions Secrets

Go to your repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret Name | Value |
|-------------|-------|
| `MAC_CERTIFICATE_BASE64` | The base64-encoded .p12 from step 3 |
| `MAC_CERTIFICATE_PASSWORD` | The password you set when exporting the .p12 |
| `APPLE_ID` | Your Apple ID email address |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password from step 4 |
| `APPLE_TEAM_ID` | Your 10-character Team ID from step 5 |

### Verification

After the next tagged release, check the CI logs for:
```
[notarize-macos] Notarizing: .../Sorcerer.app
[notarize-macos] Notarization complete
```

You can verify locally on a Mac:
```bash
spctl --assess --verbose=4 --type execute "Sorcerer.app"
# Should output: accepted, source=Notarized Developer ID

codesign --verify --deep --strict "Sorcerer.app"
# Should output: valid on disk, satisfies its Designated Requirement
```

---

## Windows Setup

### 1. Create an Azure Account

- Go to https://portal.azure.com
- Create a free account or use an existing one
- A pay-as-you-go subscription is required for Trusted Signing

### 2. Set Up Azure Trusted Signing

1. In Azure Portal, search for **"Trusted Signing"** (formerly "Code Signing")
2. Click **Create** → choose subscription, resource group, region
3. Pricing tier: select the standard tier (~$10/month)

### 3. Complete Identity Validation

1. In your Trusted Signing resource, go to **Identity Validation**
2. Choose **Private** (for a business/company) or **Public** (for verified publishers)
3. For Private validation, you'll need:
   - Legal business name
   - Business address
   - Business phone number
   - Company website
4. Microsoft will verify your identity (can take 1-7 business days)

### 4. Create a Certificate Profile

1. After identity validation completes, go to **Certificate Profiles**
2. Click **Create** → name it (e.g., "sorcerer-signing")
3. Select your validated identity
4. Choose profile type: **Private Trust** or **Public Trust**
   - Public Trust = immediate SmartScreen reputation (recommended)
5. Note the **profile name** — you'll need it for CI

### 5. Note Your Account Details

From your Trusted Signing resource, collect:
- **Endpoint URL**: Found on the Overview page (e.g., `https://eus.codesigning.azure.net`)
- **Account name**: The name you gave the Trusted Signing resource

### 6. Create a Service Principal for CI

This gives GitHub Actions access to sign without interactive login.

```bash
# Install Azure CLI if needed, then:
az login

# Create service principal
az ad sp create-for-rbac \
  --name "sorcerer-signing-ci" \
  --role "Trusted Signing Certificate Profile Signer" \
  --scopes "/subscriptions/{SUB_ID}/resourceGroups/{RG_NAME}/providers/Microsoft.CodeSigning/codeSigningAccounts/{ACCOUNT_NAME}"
```

This outputs:
```json
{
  "appId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "displayName": "sorcerer-signing-ci",
  "password": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "tenant": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

Save these values — `appId` is your Client ID, `password` is your Client Secret, `tenant` is your Tenant ID.

### 7. Add GitHub Actions Secrets

Go to your repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret Name | Value |
|-------------|-------|
| `AZURE_TENANT_ID` | The `tenant` from step 6 |
| `AZURE_CLIENT_ID` | The `appId` from step 6 |
| `AZURE_CLIENT_SECRET` | The `password` from step 6 |
| `AZURE_CODE_SIGNING_ENDPOINT` | Endpoint URL from step 5 (e.g., `https://eus.codesigning.azure.net`) |
| `AZURE_CODE_SIGNING_ACCOUNT` | Your Trusted Signing account name from step 5 |
| `AZURE_CODE_SIGNING_PROFILE` | Certificate profile name from step 4 |

### Verification

After the next tagged release, check the CI logs for:
```
[sign-windows] Signing: .../Sorcerer Setup 1.x.x.exe
[sign-windows] Signed successfully: ...
```

You can verify on Windows:
```powershell
# Right-click the .exe → Properties → Digital Signatures tab
# Should show a valid signature with your organization name

# Or via PowerShell:
Get-AuthenticodeSignature "Sorcerer Setup 1.x.x.exe"
# Status should be "Valid"
```

---

## Android Setup

Sorcerer Remote is distributed as a directly installable APK. Android requires
the same package ID and signing certificate for every future update, so create
and back up the release key before publishing the first APK.

The permanent package ID is `com.aetherci.sorcerer.remote`.

### 1. Generate the release key

Use the JDK `keytool` command on a trusted machine:

```bash
keytool -genkeypair -v \
  -keystore sorcerer-remote.jks \
  -alias sorcerer-remote \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Use strong, unique passwords. Store the keystore and its recovery information
in at least two encrypted locations. Do not commit the keystore or passwords.
Losing this key prevents installed copies from receiving normal updates.

### 2. Encode the keystore for CI

macOS or Linux:

```bash
base64 < sorcerer-remote.jks | tr -d '\n'
```

PowerShell:

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes((Resolve-Path .\sorcerer-remote.jks))
) | Set-Clipboard
```

### 3. Add GitHub Actions secrets

| Secret Name | Value |
|-------------|-------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore contents |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | `sorcerer-remote` |
| `ANDROID_KEY_PASSWORD` | Private-key password |

The Android release workflow fails closed when signing credentials are absent;
it never publishes an unsigned APK.

### 4. Publish and verify

Push an independent Android tag:

```bash
git tag android-v0.1.0
git push origin android-v0.1.0
```

CI runs lint and unit tests, builds the signed APK, verifies its signature,
records package metadata, and publishes both the APK and its SHA-256 checksum.
Test both a clean install and an upgrade before announcing the release:

```bash
adb install Sorcerer-Remote-0.1.0.apk
adb install -r Sorcerer-Remote-0.1.1.apk
```

For distribution beyond personal ADB installs, register the package name and
signing certificate through the
[Android Developer Console](https://developer.android.com/developer-verification/guides/android-developer-console).

---

## How It Works in CI

The release workflow (`.github/workflows/release.yml`) handles everything automatically:

1. **On tag push** (`v*`): CI triggers the release build
2. **macOS runner**:
   - Imports .p12 certificate into a temporary keychain
   - electron-builder signs the .app with hardened runtime
   - `scripts/notarize-macos.js` submits to Apple for notarization
   - Notarization ticket is stapled to the .dmg
3. **Windows runner**:
   - Installs Azure CLI trusted signing extension
   - electron-builder calls `scripts/sign-windows.js` for each binary
   - Script authenticates with Azure and signs via Trusted Signing API
4. **Release job**: Collects all artifacts and creates a GitHub Release

Android releases use a separate `android-v*` workflow so an Android signing or
SDK failure cannot block the Windows, macOS, or Linux desktop release.

### Without Credentials

If secrets are not configured:
- macOS: `identity` falls back to unsigned, notarization is skipped
- Windows: Signing script detects missing env vars and skips
- Builds still succeed — just unsigned (with SmartScreen/Gatekeeper warnings)

---

## Troubleshooting

### macOS: "The app is damaged and can't be opened"
- The app was not properly notarized or the notarization ticket wasn't stapled
- Check CI logs for notarization errors
- Verify with: `spctl --assess --verbose=4 --type execute Sorcerer.app`

### macOS: Notarization fails with "The binary uses an SDK older than..."
- Update Electron to a recent version
- Ensure `hardenedRuntime: true` is set in build config

### macOS: "code object is not signed at all"
- The .p12 certificate may not be a "Developer ID Application" certificate
- Check you're not using an iOS distribution cert by mistake

### Windows: SmartScreen still shows warning
- Azure Trusted Signing with Public Trust profile should have immediate reputation
- If using Private Trust, it may take time to build reputation
- Verify the signature: right-click .exe → Properties → Digital Signatures

### Windows: "az trustedsigning" command not found
- The Azure CLI extension may not be installed: `az extension add --name trustedsigning`
- Check the CI logs for the extension install step

### General: Signing works in CI but not locally
- Local builds intentionally skip signing when credentials aren't set
- To test signing locally, export the required environment variables first
