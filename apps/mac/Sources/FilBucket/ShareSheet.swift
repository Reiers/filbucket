import SwiftUI
import AppKit

struct ShareSheet: View {
    let file: FileDTO
    @Environment(\.dismiss) private var dismiss

    enum Expiry: String, CaseIterable, Identifiable {
        case never = "Never"
        case oneHour = "1 hour"
        case oneDay = "24 hours"
        case oneWeek = "7 days"
        case thirtyDays = "30 days"

        var id: String { rawValue }
        var seconds: Int? {
            switch self {
            case .never:      return nil
            case .oneHour:    return 60 * 60
            case .oneDay:     return 60 * 60 * 24
            case .oneWeek:    return 60 * 60 * 24 * 7
            case .thirtyDays: return 60 * 60 * 24 * 30
            }
        }
    }

    @State private var expiry: Expiry = .oneWeek
    @State private var passwordOn: Bool = false
    @State private var password: String = ""
    @State private var maxOn: Bool = false
    @State private var maxDownloads: Int = 5
    @State private var isCreating: Bool = false
    @State private var createdShare: ShareDTO?
    @State private var createdURL: URL?
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Share file")
                        .font(FBFont.serif(18, weight: .semibold))
                    Text(file.name)
                        .font(FBFont.sans(11))
                        .foregroundStyle(FBColor.inkSoft)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(FBColor.inkSoft)
                }
                .buttonStyle(.borderless)
            }
            .padding(20)
            .background(.regularMaterial)

            Divider()

            if let url = createdURL {
                successView(url: url)
            } else {
                form
            }
        }
        .frame(width: 420)
        .background(FBColor.paper)
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Expires")
                    .font(FBFont.sans(11, weight: .semibold))
                    .foregroundStyle(FBColor.inkSoft)
                Picker("", selection: $expiry) {
                    ForEach(Expiry.allCases) { e in
                        Text(e.rawValue).tag(e)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

            VStack(alignment: .leading, spacing: 6) {
                Toggle(isOn: $passwordOn) {
                    Text("Password protect")
                        .font(FBFont.sans(12, weight: .medium))
                }
                if passwordOn {
                    SecureField("Password (min 4 chars)", text: $password)
                        .textFieldStyle(.roundedBorder)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Toggle(isOn: $maxOn) {
                    Text("Limit downloads")
                        .font(FBFont.sans(12, weight: .medium))
                }
                if maxOn {
                    Stepper("Max \(maxDownloads) download\(maxDownloads == 1 ? "" : "s")",
                            value: $maxDownloads, in: 1...10_000)
                        .font(FBFont.sans(12))
                }
            }

            if let error {
                Text(error)
                    .font(FBFont.sans(11))
                    .foregroundStyle(FBColor.err)
            }

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                Button {
                    create()
                } label: {
                    if isCreating {
                        ProgressView().controlSize(.small)
                    } else {
                        Text("Create link")
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(FBColor.accent)
                .disabled(isCreating || (passwordOn && password.count < 4))
            }
        }
        .padding(20)
    }

    private func successView(url: URL) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Link created", systemImage: "checkmark.circle.fill")
                .foregroundStyle(FBColor.ok)
                .font(FBFont.sans(12, weight: .semibold))

            VStack(alignment: .leading, spacing: 6) {
                Text("Share URL")
                    .font(FBFont.sans(11, weight: .semibold))
                    .foregroundStyle(FBColor.inkSoft)
                HStack(spacing: 8) {
                    Text(url.absoluteString)
                        .font(FBFont.mono(11))
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(FBColor.paperRaised)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(FBColor.line, lineWidth: 1))
                    Button {
                        let pb = NSPasteboard.general
                        pb.clearContents()
                        pb.setString(url.absoluteString, forType: .string)
                    } label: {
                        Label("Copy", systemImage: "doc.on.doc")
                    }
                }
            }

            HStack {
                Spacer()
                Button("Done") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
    }

    private func create() {
        isCreating = true
        error = nil
        Task {
            defer { isCreating = false }
            do {
                let share = try await APIClient.shared.createShare(
                    fileId: file.id,
                    password: passwordOn && !password.isEmpty ? password : nil,
                    expiresInSeconds: expiry.seconds,
                    maxDownloads: maxOn ? maxDownloads : nil
                )
                self.createdShare = share
                if let url = APIClient.shared.shareURL(token: share.token) {
                    self.createdURL = url
                    // Copy on create — PRD says "Copy to clipboard on create".
                    let pb = NSPasteboard.general
                    pb.clearContents()
                    pb.setString(url.absoluteString, forType: .string)
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
