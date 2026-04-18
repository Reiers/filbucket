import SwiftUI

/// What appears in the sidebar column when the user picks "Overview".
/// Kept narrow because the detail pane on the right carries the rich content.
struct OverviewSidebar: View {
    @EnvironmentObject var library: FileLibrary
    @EnvironmentObject var uploader: UploadCoordinator

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Overview")
                    .font(.system(size: 17, weight: .semibold, design: .serif))
                    .foregroundStyle(FBColor.ink)
                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 12)

            Divider()

            // Quick stat tiles
            VStack(spacing: 10) {
                statTile(label: "Items", value: "\(library.files.count)", icon: "doc.on.doc")
                statTile(label: "Used", value: fbByteString(totalBytes), icon: "internaldrive")
                statTile(label: "Secured", value: "\(securedCount)", icon: "checkmark.shield")
                if uploader.inFlight.count > 0 {
                    statTile(
                        label: "In flight",
                        value: "\(uploader.inFlight.count)",
                        icon: "arrow.up.circle"
                    )
                }
            }
            .padding(14)

            Spacer(minLength: 0)
        }
        .background(FBColor.paperRaised)
        .background(.regularMaterial)
    }

    private func statTile(label: String, value: String, icon: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .frame(width: 24, height: 24)
                .foregroundStyle(FBColor.accent)
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(FBColor.accent.opacity(0.10))
                )
            VStack(alignment: .leading, spacing: 1) {
                Text(label.uppercased())
                    .font(.system(size: 9, weight: .semibold))
                    .tracking(0.7)
                    .foregroundStyle(FBColor.inkMute)
                Text(value)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(FBColor.ink)
            }
            Spacer()
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(.regularMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(FBColor.line, lineWidth: 0.5)
        )
    }

    private var totalBytes: Int64 {
        library.files.reduce(Int64(0)) { $0 + Int64($1.sizeBytes) }
    }
    private var securedCount: Int {
        library.files.filter { $0.state == .pdp_committed }.count
    }
}

// MARK: - Overview detail pane

struct OverviewDetail: View {
    @EnvironmentObject var library: FileLibrary
    @EnvironmentObject var uploader: UploadCoordinator
    @EnvironmentObject var health: HealthMonitor
    @EnvironmentObject var settings: AppSettings

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Hero
                HStack(alignment: .top, spacing: 18) {
                    Image("BrandMark")
                        .resizable()
                        .frame(width: 64, height: 64)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Your bucket")
                            .font(.system(size: 11, weight: .semibold))
                            .tracking(1)
                            .foregroundStyle(FBColor.inkMute)
                            .textCase(.uppercase)
                        Text("Files kept safe in the background.")
                            .font(.system(size: 28, weight: .medium, design: .serif))
                            .foregroundStyle(FBColor.ink)
                            .lineLimit(2)
                        Text("\(library.files.count) item\(library.files.count == 1 ? "" : "s") · \(fbByteString(totalBytes)) total")
                            .font(.system(size: 13))
                            .foregroundStyle(FBColor.inkSoft)
                    }
                    Spacer()
                }

                // Distribution row
                StateDistribution(files: library.files)

                // Recent activity
                if !recentFiles.isEmpty {
                    sectionHeader("Recent")
                    VStack(spacing: 1) {
                        ForEach(recentFiles) { f in
                            ActivityRow(file: f)
                        }
                    }
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(.regularMaterial)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .strokeBorder(FBColor.line, lineWidth: 0.5)
                    )
                }

                // System info
                sectionHeader("System")
                infoGrid
            }
            .padding(28)
            .frame(maxWidth: 920, alignment: .leading)
        }
    }

    private func sectionHeader(_ s: String) -> some View {
        Text(s.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .tracking(1)
            .foregroundStyle(FBColor.inkMute)
    }

    private var infoGrid: some View {
        VStack(spacing: 0) {
            infoRow("Server", value: settings.serverURL, icon: "server.rack")
            Divider().padding(.leading, 44)
            infoRow("Network", value: (health.chain ?? "—").uppercased(), icon: "network")
            Divider().padding(.leading, 44)
            infoRow(
                "Ops wallet",
                value: health.walletAddress ?? "—",
                icon: "wallet.pass",
                monospaced: true
            )
            Divider().padding(.leading, 44)
            infoRow(
                "Default bucket",
                value: settings.bucketId,
                icon: "tray.full",
                monospaced: true
            )
            Divider().padding(.leading, 44)
            infoRow(
                "Status",
                value: health.isReachable ? "Online" : "Offline",
                icon: health.isReachable ? "wifi" : "wifi.slash",
                tint: health.isReachable ? FBColor.ok : FBColor.err
            )
        }
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(.regularMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(FBColor.line, lineWidth: 0.5)
        )
    }

    private func infoRow(
        _ label: String,
        value: String,
        icon: String,
        monospaced: Bool = false,
        tint: Color = FBColor.inkSoft
    ) -> some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: icon)
                .frame(width: 18)
                .foregroundStyle(tint)
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(FBColor.inkSoft)
                .frame(width: 130, alignment: .leading)
            Text(value)
                .font(.system(size: 12, design: monospaced ? .monospaced : .default))
                .foregroundStyle(FBColor.ink)
                .lineLimit(1)
                .truncationMode(.middle)
                .textSelection(.enabled)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var totalBytes: Int64 {
        library.files.reduce(Int64(0)) { $0 + Int64($1.sizeBytes) }
    }
    private var recentFiles: [FileDTO] {
        Array(library.files.prefix(6))
    }
}

// MARK: - Distribution bar

struct StateDistribution: View {
    let files: [FileDTO]

    private struct Slice: Identifiable {
        let id: FileState
        let count: Int
    }

    var body: some View {
        let slices: [Slice] = orderedStates.compactMap { st in
            let c = files.filter { $0.state == st }.count
            return c > 0 ? Slice(id: st, count: c) : nil
        }
        let total = max(1, slices.reduce(0) { $0 + $1.count })

        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 0) {
                ForEach(slices) { s in
                    Rectangle()
                        .fill(s.id.badgeColor)
                        .frame(width: nil, height: 8)
                        .frame(maxWidth: .infinity)
                        .layoutPriority(Double(s.count))
                }
                if slices.isEmpty {
                    Rectangle().fill(FBColor.line).frame(height: 8)
                }
            }
            .clipShape(Capsule())

            HStack(spacing: 16) {
                ForEach(slices) { s in
                    HStack(spacing: 6) {
                        Circle().fill(s.id.badgeColor).frame(width: 6, height: 6)
                        Text(s.id.label)
                            .font(.system(size: 11))
                            .foregroundStyle(FBColor.inkSoft)
                        Text("\(s.count)")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(FBColor.inkMute)
                    }
                }
                Spacer()
                Text("\(total) total")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(FBColor.inkMute)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(.regularMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(FBColor.line, lineWidth: 0.5)
        )
    }

    private var orderedStates: [FileState] {
        [.pdp_committed, .hot_ready, .uploading, .restore_from_cold, .archived_cold, .failed]
    }
}

struct ActivityRow: View {
    let file: FileDTO
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: file.state.statusSymbol)
                .foregroundStyle(file.state.badgeColor)
                .frame(width: 18)
            Text(file.name)
                .font(.system(size: 13))
                .foregroundStyle(FBColor.ink)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
            Text(fbByteString(file.sizeBytes))
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(FBColor.inkMute)
            Text(fbRelativeDate(file.createdAt))
                .font(.system(size: 11))
                .foregroundStyle(FBColor.inkMute)
                .frame(width: 70, alignment: .trailing)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }
}
