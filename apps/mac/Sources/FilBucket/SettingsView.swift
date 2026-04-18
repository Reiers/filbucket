import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var settings: AppSettings

    @State private var serverDraft: String = ""
    @State private var devUserDraft: String = ""
    @State private var bucketDraft: String = ""
    @State private var saved: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Settings")
                .font(FBFont.serif(20, weight: .semibold))
                .padding(.bottom, 4)

            field(label: "Server URL", binding: $serverDraft, placeholder: AppSettings.defaultServerURL)
            field(label: "Dev user ID", binding: $devUserDraft, placeholder: AppSettings.defaultDevUserId, mono: true)
            field(label: "Default bucket ID", binding: $bucketDraft, placeholder: AppSettings.defaultBucketId, mono: true)

            HStack {
                Button("Reset to defaults") {
                    serverDraft = AppSettings.defaultServerURL
                    devUserDraft = AppSettings.defaultDevUserId
                    bucketDraft = AppSettings.defaultBucketId
                }
                Spacer()
                if saved {
                    Label("Saved", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(FBColor.ok)
                        .font(FBFont.sans(11))
                }
                Button("Save") {
                    settings.serverURL = serverDraft.trimmingCharacters(in: .whitespaces)
                    settings.devUserId = devUserDraft.trimmingCharacters(in: .whitespaces)
                    settings.bucketId = bucketDraft.trimmingCharacters(in: .whitespaces)
                    saved = true
                    Task {
                        try? await Task.sleep(nanoseconds: 1_500_000_000)
                        await MainActor.run { saved = false }
                    }
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .tint(FBColor.accent)
            }
        }
        .padding(24)
        .onAppear {
            serverDraft = settings.serverURL
            devUserDraft = settings.devUserId
            bucketDraft = settings.bucketId
        }
    }

    @ViewBuilder
    private func field(label: String, binding: Binding<String>, placeholder: String, mono: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(FBFont.sans(11, weight: .semibold))
                .foregroundStyle(FBColor.inkSoft)
            TextField(placeholder, text: binding)
                .textFieldStyle(.roundedBorder)
                .font(mono ? FBFont.mono(12) : FBFont.sans(12))
        }
    }
}
