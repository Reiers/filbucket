# Install the Mac app

Native macOS app for FilBucket. Apple Silicon (M-series) only, macOS 14 or later.

## From a pre-built `.app`

1. Grab the latest `FilBucket.app.zip` from the [Releases](https://github.com/Reiers/filbucket/releases) page.
2. Unzip it.
3. Drag `FilBucket.app` to `/Applications`.
4. First launch: Gatekeeper will warn because the app isn't notarized yet. Right-click → **Open** → **Open anyway**. You only need to do this once.

## Build from source

```bash
cd filbucket/apps/mac

# Create a stable local signing identity (one-time setup)
./Scripts/setup_dev_signing.sh

# Build, package, and launch
./Scripts/compile_and_run.sh
```

Under the hood:

- `swift build --configuration release --arch arm64`
- Assemble `.app` bundle with Info.plist, icon, entitlements
- Code-sign with the local dev identity
- Launch via `open`

## Settings

First run uses the defaults the dev environment is seeded with. To point at your own running server:

1. **FilBucket → Settings** (or `⌘,`)
2. Set **Server URL** (default `http://localhost:4000`)
3. Set **Dev user id** and **Default bucket id** (from your `db:seed` output)

These are stored in `UserDefaults` under `ai.filbucket.desktop`.

## What the Mac app does

- Drag files (or folders) anywhere on the main window
- Live progress bars on every in-flight upload
- Inline previews for images, video, audio, PDF, text
- Download and Share buttons per file
- Copy share link to clipboard on creation

## What it doesn't do yet

- Auto-updates (Phase 2 — Sparkle)
- Apple notarization (Phase 2)
- iCloud Drive-style sync folder (Phase 3)
- Menu-bar mode (Phase 2)

## Known limitations

- Gatekeeper warnings until we notarize with Apple.
- Single-window, single-bucket in this phase.
- App talks to a FilBucket server you run; there is no hosted backend yet.
