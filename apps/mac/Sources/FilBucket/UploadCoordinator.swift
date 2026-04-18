import Foundation
import AppKit
import UniformTypeIdentifiers

/// Manages a queue of in-flight uploads. For each file:
///   1. POST /api/uploads/init  → get presigned PUT url + fileId
///   2. PUT bytes to S3 with progress reporting
///   3. POST /api/uploads/<fileId>/complete
@MainActor
final class UploadCoordinator: NSObject, ObservableObject {
    @Published private(set) var inFlight: [InFlightUpload] = []

    private weak var library: FileLibrary?
    private weak var settings: AppSettings?

    /// Strong refs by task id so the URLSession delegate can find them.
    private var trackers: [Int: UploadTracker] = [:]
    private lazy var session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForResource = 6 * 60 * 60
        cfg.waitsForConnectivity = true
        return URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }()

    func bind(library: FileLibrary, settings: AppSettings) {
        self.library = library
        self.settings = settings
    }

    // MARK: - Public entry points

    /// Drag-and-drop entry. URLs may be files or folders.
    func handleDrop(urls: [URL]) {
        Task { await ingest(urls: urls) }
    }

    /// Programmatic open-file dialog entry (files only).
    func openPickerAndUpload() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.title = "Upload Files to FilBucket"
        panel.prompt = "Upload"
        if panel.runModal() == .OK {
            handleDrop(urls: panel.urls)
        }
    }

    /// Folder-only picker. Walks recursively in expand().
    func openFolderPickerAndUpload() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.title = "Upload Folder to FilBucket"
        panel.message = "Folder structure will be preserved."
        panel.prompt = "Upload"
        if panel.runModal() == .OK {
            handleDrop(urls: panel.urls)
        }
    }

    // MARK: - Ingest

    private func ingest(urls: [URL]) async {
        let expanded = expand(urls: urls)
        for entry in expanded {
            await startUpload(entry: entry)
        }
    }

    /// Walks any directory entries recursively. Preserves the relative path so
    /// folder uploads keep their structure in the displayed filename. Symlinks
    /// and hidden files are skipped to avoid junk like `.DS_Store`.
    private func expand(urls: [URL]) -> [UploadEntry] {
        var out: [UploadEntry] = []
        let fm = FileManager.default
        for url in urls {
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: url.path, isDirectory: &isDir) else { continue }
            if isDir.boolValue {
                let rootName = url.lastPathComponent
                guard let enumerator = fm.enumerator(
                    at: url,
                    includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey],
                    options: [.skipsHiddenFiles, .skipsPackageDescendants]
                ) else { continue }
                for case let fileURL as URL in enumerator {
                    let values = try? fileURL.resourceValues(forKeys: [.isRegularFileKey])
                    guard values?.isRegularFile == true else { continue }
                    let rel = fileURL.path.replacingOccurrences(of: url.path + "/", with: "")
                    let displayName = "\(rootName)/\(rel)"
                    out.append(UploadEntry(fileURL: fileURL, displayName: displayName))
                }
            } else {
                out.append(UploadEntry(fileURL: url, displayName: url.lastPathComponent))
            }
        }
        return out
    }

    private struct UploadEntry {
        let fileURL: URL
        let displayName: String
    }

    private func startUpload(entry: UploadEntry) async {
        guard let settings else { return }
        let url = entry.fileURL
        let attrs: [FileAttributeKey: Any]
        do {
            attrs = try FileManager.default.attributesOfItem(atPath: url.path)
        } catch {
            registerFailed(name: entry.displayName, error: error)
            return
        }
        let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
        let mime = mimeType(for: url)

        let local = InFlightUpload(
            id: UUID(),
            name: entry.displayName,
            totalBytes: Int64(size),
            bytesSent: 0,
            serverFileId: nil,
            status: .starting
        )
        inFlight.append(local)
        let localId = local.id

        do {
            let init_ = try await APIClient.shared.uploadInit(
                filename: entry.displayName,
                size: size,
                mimeType: mime,
                bucketId: settings.bucketId
            )
            update(localId) { $0.serverFileId = init_.fileId; $0.status = .uploading }

            try await putToPresigned(
                url: URL(string: init_.uploadUrl)!,
                fileURL: url,
                contentType: mime,
                localId: localId
            )

            update(localId) { $0.status = .finalizing }
            _ = try await APIClient.shared.uploadComplete(fileId: init_.fileId)
            update(localId) { $0.status = .done; $0.bytesSent = $0.totalBytes }

            // Pop the row after a short pause so the user sees "done".
            Task {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                await MainActor.run {
                    self.inFlight.removeAll { $0.id == localId }
                }
            }
            await library?.refresh()
        } catch {
            update(localId) { $0.status = .failed }
            // Leave failed rows up so the user can see them.
            print("[upload] \(entry.displayName) failed: \(error.localizedDescription)")
        }
    }

    private func update(_ id: UUID, _ mutate: (inout InFlightUpload) -> Void) {
        if let i = inFlight.firstIndex(where: { $0.id == id }) {
            mutate(&inFlight[i])
        }
    }

    private func registerFailed(name: String, error: Error) {
        inFlight.append(InFlightUpload(
            id: UUID(), name: name, totalBytes: 0, bytesSent: 0,
            serverFileId: nil, status: .failed
        ))
        print("[upload] \(name) failed: \(error.localizedDescription)")
    }

    // MARK: - PUT to presigned URL with progress

    private func putToPresigned(url: URL, fileURL: URL, contentType: String, localId: UUID) async throws {
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let totalBytes = (try? FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? NSNumber)?.int64Value ?? 0
        req.setValue(String(totalBytes), forHTTPHeaderField: "Content-Length")

        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            let task = self.session.uploadTask(with: req, fromFile: fileURL)
            let tracker = UploadTracker(
                localId: localId,
                continuation: cont,
                coordinator: self,
                totalBytes: totalBytes
            )
            self.trackers[task.taskIdentifier] = tracker
            task.resume()
        }
    }

    nonisolated fileprivate func progressUpdate(taskId: Int, bytesSent: Int64, total: Int64) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard let t = self.trackers[taskId] else { return }
            self.update(t.localId) {
                $0.bytesSent = bytesSent
                if $0.totalBytes <= 0 { $0.totalBytes = total }
            }
        }
    }

    nonisolated fileprivate func taskFinished(taskId: Int, error: Error?, statusCode: Int?) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard let t = self.trackers.removeValue(forKey: taskId) else { return }
            if let error {
                t.continuation.resume(throwing: error)
                return
            }
            if let status = statusCode, !(200..<300).contains(status) {
                t.continuation.resume(throwing: APIError.http(status: status, body: ""))
                return
            }
            t.continuation.resume(returning: ())
        }
    }
}

extension UploadCoordinator: URLSessionTaskDelegate {
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        progressUpdate(taskId: task.taskIdentifier, bytesSent: totalBytesSent, total: totalBytesExpectedToSend)
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        let status = (task.response as? HTTPURLResponse)?.statusCode
        taskFinished(taskId: task.taskIdentifier, error: error, statusCode: status)
    }
}

/// Per-upload-task bookkeeping the delegate uses to find the local row and resume the continuation.
final class UploadTracker {
    let localId: UUID
    let continuation: CheckedContinuation<Void, Error>
    weak var coordinator: UploadCoordinator?
    let totalBytes: Int64

    init(localId: UUID, continuation: CheckedContinuation<Void, Error>, coordinator: UploadCoordinator, totalBytes: Int64) {
        self.localId = localId
        self.continuation = continuation
        self.coordinator = coordinator
        self.totalBytes = totalBytes
    }
}

/// Best-effort MIME inference from the file extension via UTType.
func mimeType(for url: URL) -> String {
    if let utType = UTType(filenameExtension: url.pathExtension),
       let mime = utType.preferredMIMEType {
        return mime
    }
    return "application/octet-stream"
}
