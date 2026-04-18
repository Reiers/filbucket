import SwiftUI
import AVKit
import PDFKit
import AppKit

struct DetailPane: View {
    @EnvironmentObject var library: FileLibrary
    @EnvironmentObject var uploader: UploadCoordinator
    @Binding var showShareSheetFor: FileDTO?

    var body: some View {
        Group {
            if let file = library.selectedFile {
                FileDetailView(file: file, showShareSheetFor: $showShareSheetFor)
            } else {
                Hero()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(FBColor.paper)
    }
}

// MARK: - Hero / dropzone landing pane

struct Hero: View {
    @EnvironmentObject var uploader: UploadCoordinator
    @EnvironmentObject var health: HealthMonitor

    var body: some View {
        VStack(spacing: 22) {
            Spacer()
            VStack(spacing: 8) {
                Text("Files that stay put.")
                    .font(FBFont.serif(34, weight: .semibold))
                    .foregroundStyle(FBColor.ink)
                Text("Drag anything in. We secure it. You stop worrying.")
                    .font(FBFont.sans(14))
                    .foregroundStyle(FBColor.inkSoft)
            }

            DropZoneCard()
                .frame(maxWidth: 540)

            HStack(spacing: 6) {
                Image(systemName: health.isReachable ? "circle.fill" : "exclamationmark.circle.fill")
                    .foregroundStyle(health.isReachable ? FBColor.ok : FBColor.err)
                    .font(.system(size: 8))
                Text(health.isReachable ? "Connected" : "Offline")
                    .font(FBFont.sans(11))
                    .foregroundStyle(FBColor.inkMute)
                if let chain = health.chain {
                    Text("· \(chain)")
                        .font(FBFont.sans(11))
                        .foregroundStyle(FBColor.inkMute)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 40)
    }
}

struct DropZoneCard: View {
    @EnvironmentObject var uploader: UploadCoordinator
    var body: some View {
        Button {
            uploader.openPickerAndUpload()
        } label: {
            VStack(spacing: 14) {
                Image(systemName: "arrow.up.doc.on.clipboard")
                    .font(.system(size: 30))
                    .foregroundStyle(FBColor.accent)
                Text("Choose files or drop them anywhere")
                    .font(FBFont.serif(16, weight: .semibold))
                    .foregroundStyle(FBColor.ink)
                Text("Folders preserve their structure")
                    .font(FBFont.sans(12))
                    .foregroundStyle(FBColor.inkMute)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 36)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(FBColor.paperRaised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(FBColor.lineStrong, style: StrokeStyle(lineWidth: 1.2, dash: [6, 5]))
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Detail for a selected file

struct FileDetailView: View {
    let file: FileDTO
    @Binding var showShareSheetFor: FileDTO?
    @EnvironmentObject var library: FileLibrary

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(alignment: .center, spacing: 16) {
                FileIcon(mimeType: file.mimeType, name: file.name)
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 4) {
                    Text(file.name)
                        .font(FBFont.serif(20, weight: .semibold))
                        .foregroundStyle(FBColor.ink)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    HStack(spacing: 8) {
                        StateBadge(state: file.state)
                        Text(fbByteString(file.sizeBytes))
                            .font(FBFont.sans(11))
                            .foregroundStyle(FBColor.inkMute)
                        Text(file.mimeType)
                            .font(FBFont.mono(10))
                            .foregroundStyle(FBColor.inkMute)
                    }
                }
                Spacer()
                actions
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 18)
            .background(.regularMaterial)
            .overlay(Rectangle().frame(height: 1).foregroundStyle(FBColor.line), alignment: .bottom)

            // Preview
            PreviewSurface(file: file)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(FBColor.paper)
        }
    }

    private var actions: some View {
        HStack(spacing: 8) {
            Button {
                if let url = APIClient.shared.downloadURL(for: file.id) {
                    NSWorkspace.shared.open(url)
                }
            } label: {
                Label("Download", systemImage: "arrow.down.circle")
            }
            .controlSize(.regular)

            Button {
                showShareSheetFor = file
            } label: {
                Label("Share", systemImage: "link")
            }
            .controlSize(.regular)
            .buttonStyle(.borderedProminent)
            .tint(FBColor.accent)

            Menu {
                Button("Delete", role: .destructive) {
                    library.delete(file.id)
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .menuStyle(.borderlessButton)
            .frame(width: 28)
        }
    }
}

// MARK: - Preview surface

struct PreviewSurface: View {
    let file: FileDTO

    var body: some View {
        Group {
            if file.state == .uploading || file.state == .restore_from_cold {
                placeholder(text: "\(file.state.label)…")
            } else if let url = APIClient.shared.downloadURL(for: file.id) {
                if file.mimeType.hasPrefix("image/") {
                    ImagePreview(url: url)
                } else if file.mimeType.hasPrefix("video/") || file.mimeType.hasPrefix("audio/") {
                    MediaPlayerView(url: url)
                } else if file.mimeType == "application/pdf" {
                    PDFPreview(url: url)
                } else if file.mimeType.hasPrefix("text/") || file.mimeType.contains("json") || file.mimeType.contains("xml") || file.mimeType.contains("javascript") {
                    TextPreview(url: url)
                } else {
                    NoPreviewAvailable(file: file)
                }
            } else {
                placeholder(text: "Server unavailable")
            }
        }
        .padding(28)
    }

    private func placeholder(text: String) -> some View {
        VStack(spacing: 10) {
            ProgressView()
            Text(text)
                .font(FBFont.sans(12))
                .foregroundStyle(FBColor.inkSoft)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct NoPreviewAvailable: View {
    let file: FileDTO
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "eye.slash")
                .font(.system(size: 44))
                .foregroundStyle(FBColor.inkMute)
            Text("No preview available")
                .font(FBFont.serif(16, weight: .semibold))
                .foregroundStyle(FBColor.inkSoft)
            Text("Use Download to open it locally.")
                .font(FBFont.sans(12))
                .foregroundStyle(FBColor.inkMute)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Image preview

struct ImagePreview: View {
    let url: URL
    @State private var image: NSImage?
    @State private var error: String?

    var body: some View {
        ZStack {
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(FBColor.paperRaised)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10).strokeBorder(FBColor.line, lineWidth: 1)
                    )
            } else if let error {
                Text(error).foregroundStyle(FBColor.err)
            } else {
                ProgressView()
            }
        }
        .task(id: url) { await load() }
    }

    private func load() async {
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            if let img = NSImage(data: data) {
                self.image = img
                self.error = nil
            } else {
                self.error = "Could not decode image"
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - AV preview

struct MediaPlayerView: NSViewRepresentable {
    let url: URL
    func makeNSView(context: Context) -> MediaPlayerWrapper {
        let v = MediaPlayerWrapper()
        v.url = url
        return v
    }
    func updateNSView(_ nsView: MediaPlayerWrapper, context: Context) {
        if nsView.url != url {
            nsView.url = url
        }
    }
}

final class MediaPlayerWrapper: NSView {
    let playerView = AVPlayerView()
    var url: URL? {
        didSet {
            guard let url else { return }
            let player = AVPlayer(url: url)
            playerView.player = player
        }
    }
    override init(frame: NSRect) {
        super.init(frame: frame)
        addSubview(playerView)
        playerView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            playerView.leadingAnchor.constraint(equalTo: leadingAnchor),
            playerView.trailingAnchor.constraint(equalTo: trailingAnchor),
            playerView.topAnchor.constraint(equalTo: topAnchor),
            playerView.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        playerView.controlsStyle = .inline
        playerView.showsFullScreenToggleButton = true
    }
    required init?(coder: NSCoder) { fatalError() }
}

// MARK: - PDF preview

struct PDFPreview: NSViewRepresentable {
    let url: URL
    func makeNSView(context: Context) -> PDFView {
        let v = PDFView()
        v.autoScales = true
        v.backgroundColor = .clear
        v.displayMode = .singlePageContinuous
        Task { await load(into: v) }
        return v
    }
    func updateNSView(_ nsView: PDFView, context: Context) {
        Task { await load(into: nsView) }
    }
    private func load(into view: PDFView) async {
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            await MainActor.run {
                view.document = PDFDocument(data: data)
            }
        } catch {
            // fail silently in preview
        }
    }
}

// MARK: - Text preview

struct TextPreview: View {
    let url: URL
    @State private var text: String = ""
    @State private var error: String?

    var body: some View {
        ScrollView {
            if let error {
                Text(error).foregroundStyle(FBColor.err).padding()
            } else {
                Text(text)
                    .font(FBFont.mono(12))
                    .foregroundStyle(FBColor.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
            }
        }
        .background(FBColor.paperRaised)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(FBColor.line, lineWidth: 1))
        .task(id: url) {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                if let s = String(data: data, encoding: .utf8) {
                    // Cap at 200 KB so we don't melt the UI on giant logs.
                    self.text = s.count > 200_000 ? String(s.prefix(200_000)) + "\n… [truncated]" : s
                } else {
                    self.error = "File is not UTF-8 text"
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
