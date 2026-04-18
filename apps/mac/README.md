# FilBucket — macOS app

Native macOS 14+ arm64 client for FilBucket.
SwiftUI, no Xcode project. SwiftPM-only.

> Phase 0 spike. Talks to the existing FilBucket server (`http://localhost:4000` by default) using the dev auth header. No real auth yet; that's Phase 2.

## What it does today

- Drag-and-drop uploads onto the main window — files **and** folders (recursively walked, paths preserved as `folder/sub/file.ext`).
- Sidebar library that polls `/api/files?bucketId=…` every 3 s and shows the same human state labels as the web (Uploading / Ready / Secured / Archived / Restoring / Failed).
- Per-upload progress bars (real `URLSession` delegate bytes, not a fake spinner).
- Inline previews for images, video, audio, PDF, and text.
- Per-file download (opens in browser via the same `?u=<devUserId>` trick the web uses) and share-link creation with expiry preset, optional password, and max-downloads cap. Created link is copied to the clipboard automatically.
- Settings panel (`⌘ ,`) for server URL, dev user ID, default bucket ID. Stored in `UserDefaults`.
- Offline banner when `/healthz` fails; auto-retries every 5 s.

## Build / run

Requirements: macOS 14+, Xcode command-line tools (Swift 6.x), `librsvg` (for the icon pipeline only — `brew install librsvg`).

```
# 1. Build the icon (once, or whenever the brand SVG changes)
Scripts/build_icon.sh

# 2. Dev loop: kill, package, launch
Scripts/compile_and_run.sh

# Or piecewise:
swift build                                   # debug build
swift test                                    # smoke tests
SIGNING_MODE=adhoc Scripts/package_app.sh     # produce FilBucket.app
Scripts/launch.sh                             # open the packaged .app
```

The packaged `FilBucket.app` lives at `apps/mac/FilBucket.app`. It launches as a regular window app (no menu-bar mode).

### First-time signing (optional, recommended)

`Scripts/setup_dev_signing.sh` creates a self-signed `FilBucket Development` cert in your login keychain. To make it usable as a code-signing identity, open Keychain Access, find the cert, set "When using this certificate → Always Trust" → "Code Signing → Always Trust", then export:

```
export APP_IDENTITY="FilBucket Development"
Scripts/package_app.sh release
```

Without this, the app is **adhoc-signed**. Adhoc is fine for local launches via `open` (which is how `compile_and_run.sh` runs it). It will be rejected by `spctl --assess --type execute` since adhoc has no anchor of trust — that's expected and not a launch blocker on this machine.

### Settings

Defaults match the seeded calibration dev environment:

| Key             | Default                                  |
|-----------------|------------------------------------------|
| Server URL      | `http://localhost:4000`                  |
| Dev user ID     | `9c391d6b-ec8c-42df-b910-9e553d82934e`   |
| Default bucket  | `0c946aae-387c-485b-a9d4-58c28b97af7e`   |

Change them via `FilBucket → Settings…` (`⌘ ,`). Settings are persisted in `UserDefaults` under the `fb.*` keys.

## Repo layout

```
apps/mac/
├── Package.swift
├── version.env
├── README.md
├── Icon.icns                    # generated, not checked in
├── Resources/
│   └── FilBucket.entitlements   # explicit network-client + user-selected file read
├── Scripts/
│   ├── build_icon.sh            # SVG → .icns via rsvg-convert + sips + iconutil
│   ├── compile_and_run.sh       # dev loop: kill, package, launch
│   ├── launch.sh                # launch packaged .app
│   ├── package_app.sh           # produce FilBucket.app from `swift build` output
│   ├── setup_dev_signing.sh     # one-time self-signed cert
│   └── sign-and-notarize.sh     # Phase 2 — Apple Developer ID notarization
├── Sources/FilBucket/
│   ├── App.swift                # @main, env objects, scene wiring
│   ├── Settings.swift           # UserDefaults-backed config
│   ├── Models.swift             # DTOs that mirror @filbucket/shared
│   ├── APIClient.swift          # REST client; injects X-Dev-User
│   ├── HealthMonitor.swift      # /healthz polling, offline banner driver
│   ├── FileLibrary.swift        # /api/files polling, selection state
│   ├── UploadCoordinator.swift  # drag-drop ingest + URLSession progress
│   ├── Theme.swift              # brand colors, font tokens, helpers
│   ├── RootView.swift           # NavigationSplitView shell, drop overlay
│   ├── SidebarView.swift        # library list + in-flight rows
│   ├── DetailPane.swift         # hero / dropzone + previews (image/AV/PDF/text)
│   ├── ShareSheet.swift         # share-link creation modal
│   └── SettingsView.swift       # ⌘, panel
├── Tests/FilBucketTests/
│   └── SmokeTests.swift
└── design-previews/             # screenshots for the spike report
```

## Known limitations (Phase 0)

- **Adhoc signature** by default. Real `Developer ID` cert + notarization is Phase 2 work (see `Scripts/sign-and-notarize.sh`).
- **No magic-link auth.** Dev header only. Settings panel exposes the dev user ID for switching identities locally.
- **No Sparkle auto-update.**
- **No menu-bar / status-item mode** — main window only.
- **Folder uploads** join the path with `/` into the filename. The server stores it verbatim; the web sidebar will show it the same way. If/when the web adds a real `path` field on the upload init payload, the macOS client should be updated to send it as a separate field.
- Error toasts are minimal — failures show in the in-flight row label but there is no global error sink yet.

## License

Internal — FilBucket project.
