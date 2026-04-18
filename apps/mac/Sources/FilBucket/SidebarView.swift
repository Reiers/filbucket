import SwiftUI

struct SidebarView: View {
    @EnvironmentObject var library: FileLibrary
    @EnvironmentObject var uploader: UploadCoordinator

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Library")
                    .font(FBFont.serif(20, weight: .semibold))
                    .foregroundStyle(FBColor.ink)
                Spacer()
                if library.loading {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Text("\(library.files.count) item\(library.files.count == 1 ? "" : "s")")
                        .font(FBFont.sans(11))
                        .foregroundStyle(FBColor.inkMute)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 10)

            Divider().foregroundStyle(FBColor.line)

            ScrollView {
                LazyVStack(spacing: 0) {
                    if !uploader.inFlight.isEmpty {
                        InFlightSection(items: uploader.inFlight)
                            .padding(.bottom, 6)
                        Divider().padding(.horizontal, 14)
                    }

                    ForEach(library.files) { file in
                        FileRow(file: file, isSelected: library.selectedFileId == file.id)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                library.selectedFileId = file.id
                            }
                            .contextMenu {
                                Button("Reveal in Library") { library.selectedFileId = file.id }
                                Button("Delete", role: .destructive) { library.delete(file.id) }
                            }
                    }

                    if library.files.isEmpty && uploader.inFlight.isEmpty && !library.loading {
                        EmptyState()
                            .padding(.top, 40)
                    }
                }
                .padding(.vertical, 6)
            }
        }
        .background(FBColor.paperRaised)
        .background(.regularMaterial)
    }
}

// MARK: - File row

struct FileRow: View {
    let file: FileDTO
    let isSelected: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            FileIcon(mimeType: file.mimeType, name: file.name)
                .frame(width: 28, height: 28)

            VStack(alignment: .leading, spacing: 3) {
                Text(file.name)
                    .font(FBFont.sans(13, weight: .medium))
                    .foregroundStyle(FBColor.ink)
                    .lineLimit(1)
                    .truncationMode(.middle)

                HStack(spacing: 6) {
                    StateBadge(state: file.state)
                    Text("·").foregroundStyle(FBColor.inkMute)
                    Text(fbByteString(file.sizeBytes))
                        .font(FBFont.sans(11))
                        .foregroundStyle(FBColor.inkMute)
                    Text("·").foregroundStyle(FBColor.inkMute)
                    Text(fbRelativeDate(file.createdAt))
                        .font(FBFont.sans(11))
                        .foregroundStyle(FBColor.inkMute)
                }

                if let p = file.progress, file.state == .uploading || file.state == .hot_ready {
                    if p.totalBytes > 0 && p.totalUploaded < p.totalBytes {
                        ProgressView(value: Double(p.totalUploaded), total: Double(p.totalBytes))
                            .progressViewStyle(.linear)
                            .tint(FBColor.accent)
                            .padding(.top, 2)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(isSelected ? FBColor.accent.opacity(0.12) : .clear)
                .padding(.horizontal, 6)
        )
    }
}

struct StateBadge: View {
    let state: FileState
    var body: some View {
        Text(state.label.uppercased())
            .font(FBFont.sans(9, weight: .semibold))
            .tracking(0.6)
            .foregroundStyle(state.badgeColor)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(
                Capsule().fill(state.badgeColor.opacity(0.12))
            )
            .overlay(
                Capsule().strokeBorder(state.badgeColor.opacity(0.3), lineWidth: 0.5)
            )
    }
}

struct FileIcon: View {
    let mimeType: String
    let name: String
    var body: some View {
        let symbol: String = {
            if mimeType.hasPrefix("image/") { return "photo" }
            if mimeType.hasPrefix("video/") { return "play.rectangle" }
            if mimeType.hasPrefix("audio/") { return "waveform" }
            if mimeType == "application/pdf" { return "doc.richtext" }
            if mimeType.hasPrefix("text/") || mimeType.contains("json") || mimeType.contains("xml") { return "doc.text" }
            if mimeType.contains("zip") || mimeType.contains("compressed") || mimeType.contains("tar") { return "archivebox" }
            return "doc"
        }()
        ZStack {
            RoundedRectangle(cornerRadius: 6)
                .fill(FBColor.accent.opacity(0.10))
            Image(systemName: symbol)
                .foregroundStyle(FBColor.accent)
                .font(.system(size: 14, weight: .medium))
        }
    }
}

// MARK: - In-flight section

struct InFlightSection: View {
    let items: [InFlightUpload]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Uploading")
                .font(FBFont.sans(10, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(FBColor.inkMute)
                .padding(.horizontal, 18)
                .padding(.top, 8)

            ForEach(items) { item in
                InFlightRow(item: item)
            }
        }
    }
}

struct InFlightRow: View {
    let item: InFlightUpload

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 6).fill(FBColor.warn.opacity(0.12))
                Image(systemName: item.status == .failed ? "xmark.octagon" : "arrow.up.circle")
                    .foregroundStyle(item.status == .failed ? FBColor.err : FBColor.warn)
            }
            .frame(width: 28, height: 28)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.name)
                    .font(FBFont.sans(13, weight: .medium))
                    .lineLimit(1)
                    .truncationMode(.middle)
                HStack {
                    Text(statusLabel)
                        .font(FBFont.sans(11))
                        .foregroundStyle(FBColor.inkSoft)
                    Spacer()
                    Text("\(fbByteString(item.bytesSent)) / \(fbByteString(item.totalBytes))")
                        .font(FBFont.sans(11))
                        .foregroundStyle(FBColor.inkMute)
                }
                if item.totalBytes > 0 {
                    ProgressView(value: Double(item.bytesSent), total: Double(item.totalBytes))
                        .progressViewStyle(.linear)
                        .tint(item.status == .failed ? FBColor.err : FBColor.accent)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private var statusLabel: String {
        switch item.status {
        case .starting:   return "Preparing"
        case .uploading:  return "Uploading"
        case .finalizing: return "Finalizing"
        case .done:       return "Done"
        case .failed:     return "Failed"
        }
    }
}

// MARK: - Empty state

struct EmptyState: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "tray")
                .font(.system(size: 36))
                .foregroundStyle(FBColor.inkMute.opacity(0.6))
            Text("No files yet")
                .font(FBFont.serif(15, weight: .semibold))
                .foregroundStyle(FBColor.inkSoft)
            Text("Drag files anywhere onto the window\nor use the upload button.")
                .multilineTextAlignment(.center)
                .font(FBFont.sans(11))
                .foregroundStyle(FBColor.inkMute)
        }
        .padding(.horizontal, 24)
    }
}
