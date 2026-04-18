import SwiftUI
import UniformTypeIdentifiers

struct RootView: View {
    @EnvironmentObject var settings: AppSettings
    @EnvironmentObject var library: FileLibrary
    @EnvironmentObject var uploader: UploadCoordinator
    @EnvironmentObject var health: HealthMonitor

    @State private var isDropTargeted: Bool = false
    @State private var showShareSheetFor: FileDTO? = nil
    @State private var sidebarSection: SidebarSection = .library

    enum SidebarSection: Hashable {
        case overview
        case library
    }

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                List(selection: $sidebarSection) {
                    Section {
                        Label("Overview", systemImage: "chart.bar.doc.horizontal")
                            .tag(SidebarSection.overview)
                        Label("Library", systemImage: "tray.full")
                            .badge(library.files.count)
                            .tag(SidebarSection.library)
                    }
                }
                .listStyle(.sidebar)
                .frame(maxHeight: 100)

                Divider()

                // Main area below the section list — Library shows the file list,
                // Overview shows storage stats inside the sidebar (the detail pane
                // takes over the right side).
                if sidebarSection == .library {
                    SidebarView()
                } else {
                    OverviewSidebar()
                }
            }
            .navigationSplitViewColumnWidth(min: 280, ideal: 320, max: 460)
        } detail: {
            ZStack(alignment: .topLeading) {
                FBColor.paper.ignoresSafeArea()

                VStack(spacing: 0) {
                    if !health.isReachable {
                        OfflineBanner()
                    }
                    if sidebarSection == .overview {
                        OverviewDetail()
                    } else {
                        DetailPane(showShareSheetFor: $showShareSheetFor)
                    }
                    Spacer(minLength: 0)
                    StatusBar()
                }

                if isDropTargeted {
                    DropOverlay()
                        .transition(.opacity)
                }
            }
        }
        .navigationTitle("FilBucket")
        .navigationSubtitle(navigationSubtitle)
        .toolbar {
            ToolbarItem(placement: .navigation) {
                BrandMark()
            }
            ToolbarItem(placement: .principal) {
                ConnectionPill()
            }
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    NotificationCenter.default.post(name: .fbRefresh, object: nil)
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .help("Refresh library (⌘R)")

                Button {
                    uploader.openFolderPickerAndUpload()
                } label: {
                    Label("Upload Folder", systemImage: "folder.badge.plus")
                }
                .help("Upload a folder (⇧⌘O)")

                Button {
                    uploader.openPickerAndUpload()
                } label: {
                    Label("Upload Files", systemImage: "arrow.up.doc.fill")
                }
                .help("Upload files (⌘O)")
                .keyboardShortcut("o", modifiers: .command)
            }
        }
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted, perform: handleDrop(providers:))
        .sheet(item: $showShareSheetFor) { file in
            ShareSheet(file: file)
        }
        .onReceive(NotificationCenter.default.publisher(for: .fbPickFiles)) { _ in
            uploader.openPickerAndUpload()
        }
        .onReceive(NotificationCenter.default.publisher(for: .fbPickFolder)) { _ in
            uploader.openFolderPickerAndUpload()
        }
        .onReceive(NotificationCenter.default.publisher(for: .fbShareSelected)) { _ in
            if let id = library.selectedFileId,
               let file = library.files.first(where: { $0.id == id }) {
                showShareSheetFor = file
            }
        }
    }

    private var navigationSubtitle: String {
        let totalBytes = library.files.reduce(Int64(0)) { $0 + Int64($1.sizeBytes) }
        let active = uploader.inFlight.count
        if active > 0 {
            return "\(library.files.count) files · \(fbByteString(totalBytes)) · \(active) uploading"
        }
        return "\(library.files.count) files · \(fbByteString(totalBytes))"
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
            Image("BrandMark")
                .resizable()
                .frame(width: 22, height: 22)
                .accessibilityHidden(true)
            Text("FilBucket")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(FBColor.ink)
        }
    }
}

// MARK: - Connection pill (toolbar)

struct ConnectionPill: View {
    @EnvironmentObject var health: HealthMonitor
    @EnvironmentObject var settings: AppSettings

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(health.isReachable ? FBColor.ok : FBColor.err)
                .frame(width: 6, height: 6)
                .overlay(
                    Circle()
                        .fill(health.isReachable ? FBColor.ok.opacity(0.4) : .clear)
                        .frame(width: 14, height: 14)
                        .blur(radius: 4)
                )
            Text(health.isReachable ? "Connected" : "Offline")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(FBColor.inkSoft)
            Text("·")
                .foregroundStyle(FBColor.inkMute)
            Text(health.chain ?? "calibration")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(FBColor.inkMute)
                .textCase(.uppercase)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(.regularMaterial)
        )
        .overlay(
            Capsule().strokeBorder(FBColor.line, lineWidth: 0.5)
        )
        .help("\(settings.serverURL) · ops wallet \(health.walletAddress?.shortAddress ?? "—")")
    }
}

// MARK: - Status bar (Finder-style footer)

struct StatusBar: View {
    @EnvironmentObject var library: FileLibrary
    @EnvironmentObject var uploader: UploadCoordinator
    @EnvironmentObject var health: HealthMonitor
    @EnvironmentObject var settings: AppSettings

    var body: some View {
        HStack(spacing: 12) {
            if let file = selectedFile {
                Image(systemName: file.state.statusSymbol)
                    .foregroundStyle(file.state.badgeColor)
                Text(file.name)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text("·")
                    .foregroundStyle(FBColor.inkMute)
                Text(fbByteString(file.sizeBytes))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(FBColor.inkMute)
            } else {
                Text("\(library.files.count) item\(library.files.count == 1 ? "" : "s")")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(FBColor.inkSoft)
                Text("·")
                    .foregroundStyle(FBColor.inkMute)
                Text(fbByteString(totalBytes))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(FBColor.inkMute)
            }
            Spacer()
            if !uploader.inFlight.isEmpty {
                Image(systemName: "arrow.up.circle.fill")
                    .foregroundStyle(FBColor.accent)
                    .symbolEffect(.pulse)
                Text("\(uploader.inFlight.count) uploading")
                    .font(.system(size: 11))
                    .foregroundStyle(FBColor.accent)
                Text("·")
                    .foregroundStyle(FBColor.inkMute)
            }
            Text("Stored on")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(FBColor.inkMute)
                .textCase(.uppercase)
            Text("Filecoin")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(FBColor.medallion)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(.regularMaterial)
        .overlay(
            Rectangle().frame(height: 1).foregroundStyle(FBColor.line),
            alignment: .top
        )
    }

    private var selectedFile: FileDTO? {
        library.files.first(where: { $0.id == library.selectedFileId })
    }

    private var totalBytes: Int64 {
        library.files.reduce(Int64(0)) { $0 + Int64($1.sizeBytes) }
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
                    .font(.system(size: 12, weight: .semibold))
                Text(health.lastError ?? "Retrying every few seconds…")
                    .font(.system(size: 11))
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
            FBColor.medallion.opacity(0.10)
                .ignoresSafeArea()
            VStack(spacing: 14) {
                Image(systemName: "arrow.down.to.line.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(FBColor.medallion)
                    .symbolEffect(.bounce, value: 1)
                Text("Drop to upload")
                    .font(.system(size: 28, weight: .semibold, design: .serif))
                    .foregroundStyle(FBColor.ink)
                Text("Files and folders welcome")
                    .font(.system(size: 13))
                    .foregroundStyle(FBColor.inkSoft)
            }
            .padding(48)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(.ultraThickMaterial)
                    .shadow(color: .black.opacity(0.12), radius: 24, y: 8)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(FBColor.medallion, style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
            )
        }
    }
}

extension String {
    var shortAddress: String {
        guard count > 12 else { return self }
        return String(prefix(6)) + "…" + String(suffix(4))
    }
}

extension FileState {
    var statusSymbol: String {
        switch self {
        case .uploading:         return "arrow.up.circle"
        case .hot_ready:         return "circle.fill"
        case .pdp_committed:     return "checkmark.shield.fill"
        case .archived_cold:     return "snowflake"
        case .restore_from_cold: return "arrow.clockwise.circle"
        case .failed:            return "xmark.octagon.fill"
        }
    }
}
