import SwiftUI

@main
struct FilBucketApp: App {
    @StateObject private var settings = AppSettings()
    @StateObject private var library = FileLibrary()
    @StateObject private var uploader = UploadCoordinator()
    @StateObject private var health = HealthMonitor()

    init() {
        APIClient.shared.applySettings(AppSettings.snapshot())
    }

    var body: some Scene {
        WindowGroup("FilBucket") {
            RootView()
                .environmentObject(settings)
                .environmentObject(library)
                .environmentObject(uploader)
                .environmentObject(health)
                .frame(minWidth: 1000, minHeight: 660)
                .onAppear {
                    APIClient.shared.applySettings(settings.snapshot())
                    library.start(settings: settings)
                    uploader.bind(library: library, settings: settings)
                    health.start(settings: settings)
                }
                .onChange(of: settings.serverURL) { _, _ in
                    APIClient.shared.applySettings(settings.snapshot())
                    health.kick()
                    library.refreshSoon()
                }
                .onChange(of: settings.devUserId) { _, _ in
                    APIClient.shared.applySettings(settings.snapshot())
                    library.refreshSoon()
                }
                .onChange(of: settings.bucketId) { _, _ in
                    library.refreshSoon()
                }
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified(showsTitle: false))
        .commands {
            // Replace the default New menu with FilBucket-appropriate items.
            CommandGroup(replacing: .newItem) {
                Button("Upload Files…") {
                    NotificationCenter.default.post(name: .fbPickFiles, object: nil)
                }
                .keyboardShortcut("o", modifiers: .command)
                Button("Upload Folder…") {
                    NotificationCenter.default.post(name: .fbPickFolder, object: nil)
                }
                .keyboardShortcut("o", modifiers: [.command, .shift])
            }

            CommandMenu("File") {
                Button("Refresh Library") {
                    NotificationCenter.default.post(name: .fbRefresh, object: nil)
                }
                .keyboardShortcut("r", modifiers: .command)

                Divider()

                Button("Share Selected File…") {
                    NotificationCenter.default.post(name: .fbShareSelected, object: nil)
                }
                .keyboardShortcut("s", modifiers: [.command, .shift])

                Button("Reveal in Finder") {
                    NotificationCenter.default.post(name: .fbRevealSelected, object: nil)
                }
                .keyboardShortcut("r", modifiers: [.command, .shift])
            }

            CommandGroup(after: .help) {
                Divider()
                Button("FilBucket Documentation") {
                    if let url = URL(string: "https://docs.filbucket.ai") {
                        NSWorkspace.shared.open(url)
                    }
                }
                Button("Source on GitHub") {
                    if let url = URL(string: "https://github.com/Reiers/filbucket") {
                        NSWorkspace.shared.open(url)
                    }
                }
            }
        }

        Settings {
            SettingsView()
                .environmentObject(settings)
                .frame(width: 520)
        }
    }
}

extension Notification.Name {
    static let fbRefresh        = Notification.Name("fb.refresh")
    static let fbPickFiles      = Notification.Name("fb.pick.files")
    static let fbPickFolder     = Notification.Name("fb.pick.folder")
    static let fbShareSelected  = Notification.Name("fb.share.selected")
    static let fbRevealSelected = Notification.Name("fb.reveal.selected")
}
