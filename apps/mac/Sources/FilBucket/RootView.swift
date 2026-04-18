import SwiftUI
import UniformTypeIdentifiers

struct RootView: View {
    @EnvironmentObject var settings: AppSettings
    @EnvironmentObject var library: FileLibrary
    @EnvironmentObject var uploader: UploadCoordinator
    @EnvironmentObject var health: HealthMonitor

    @State private var isDropTargeted: Bool = false
    @State private var showShareSheetFor: FileDTO? = nil

    var body: some View {
        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 280, ideal: 340, max: 460)
        } detail: {
            ZStack(alignment: .topLeading) {
                FBColor.paper.ignoresSafeArea()

                VStack(spacing: 0) {
                    if !health.isReachable {
                        OfflineBanner()
                    }
                    DetailPane(showShareSheetFor: $showShareSheetFor)
                }

                if isDropTargeted {
                    DropOverlay()
                        .transition(.opacity)
                }
            }
        }
        .navigationTitle("FilBucket")
        .toolbar {
            ToolbarItem(placement: .navigation) {
                BrandMark()
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    uploader.openPickerAndUpload()
                } label: {
                    Label("Upload", systemImage: "arrow.up.circle.fill")
                }
                .help("Upload files")
            }
        }
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted, perform: handleDrop(providers:))
        .sheet(item: $showShareSheetFor) { file in
            ShareSheet(file: file)
        }
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        let collector = URLCollector()
        let group = DispatchGroup()
        for p in providers {
            group.enter()
            _ = p.loadObject(ofClass: URL.self) { url, _ in
                if let url { collector.append(url) }
                group.leave()
            }
        }
        group.notify(queue: .main) {
            uploader.handleDrop(urls: collector.snapshot())
        }
        return true
    }
}

/// Thread-safe URL collector for the drag-and-drop providers callback.
final class URLCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var urls: [URL] = []
    func append(_ url: URL) { lock.lock(); urls.append(url); lock.unlock() }
    func snapshot() -> [URL] { lock.lock(); defer { lock.unlock() }; return urls }
}

// MARK: - Brand mark

struct BrandMark: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "tray.full.fill")
                .foregroundStyle(FBColor.accent)
            Text("FilBucket")
                .font(FBFont.serif(15, weight: .semibold))
                .foregroundStyle(FBColor.ink)
        }
    }
}

// MARK: - Banners

struct OfflineBanner: View {
    @EnvironmentObject var health: HealthMonitor
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(FBColor.err)
            VStack(alignment: .leading, spacing: 2) {
                Text("Server unreachable")
                    .font(FBFont.sans(12, weight: .semibold))
                Text(health.lastError ?? "Retrying every few seconds…")
                    .font(FBFont.sans(11))
                    .foregroundStyle(FBColor.inkSoft)
            }
            Spacer()
            Button("Retry") { health.kick() }
                .controlSize(.small)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(FBColor.accentSoft.opacity(0.6))
        .overlay(Rectangle().frame(height: 1).foregroundStyle(FBColor.lineStrong), alignment: .bottom)
    }
}

// MARK: - Drop overlay

struct DropOverlay: View {
    var body: some View {
        ZStack {
            FBColor.accent.opacity(0.12)
                .ignoresSafeArea()
            VStack(spacing: 14) {
                Image(systemName: "arrow.down.to.line.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(FBColor.accent)
                Text("Drop to upload")
                    .font(FBFont.serif(28, weight: .semibold))
                    .foregroundStyle(FBColor.ink)
                Text("Files and folders welcome")
                    .font(FBFont.sans(13))
                    .foregroundStyle(FBColor.inkSoft)
            }
            .padding(40)
            .background(
                RoundedRectangle(cornerRadius: 18)
                    .fill(FBColor.paperRaised)
                    .shadow(color: .black.opacity(0.08), radius: 20, y: 6)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .strokeBorder(FBColor.accent, style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
            )
        }
    }
}
