import SwiftUI

@main
struct FilBucketApp: App {
    @StateObject private var settings = AppSettings()
    @StateObject private var library = FileLibrary()
    @StateObject private var uploader = UploadCoordinator()
    @StateObject private var health = HealthMonitor()

    init() {
        // Configure singletons that the env objects need.
        APIClient.shared.applySettings(AppSettings.snapshot())
    }

    var body: some Scene {
        WindowGroup("FilBucket") {
            RootView()
                .environmentObject(settings)
                .environmentObject(library)
                .environmentObject(uploader)
                .environmentObject(health)
                .frame(minWidth: 980, minHeight: 620)
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
        .windowToolbarStyle(.unified(showsTitle: true))
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("FilBucket") {
                Button("Refresh Library") { NotificationCenter.default.post(name: .fbRefresh, object: nil) }
                    .keyboardShortcut("r")
            }
        }

        Settings {
            SettingsView()
                .environmentObject(settings)
                .frame(width: 480)
        }
    }
}

extension Notification.Name {
    static let fbRefresh = Notification.Name("fb.refresh")
}
