import Foundation
import Combine

/// Polls the file list every 3s. Single source of truth for the sidebar.
@MainActor
final class FileLibrary: ObservableObject {
    @Published private(set) var files: [FileDTO] = []
    @Published private(set) var loading: Bool = false
    @Published private(set) var lastError: String? = nil
    @Published var selectedFileId: String? = nil

    private var task: Task<Void, Never>?
    private weak var settings: AppSettings?
    private var refreshSubject = PassthroughSubject<Void, Never>()
    private var bag = Set<AnyCancellable>()

    init() {
        refreshSubject
            .debounce(for: .milliseconds(150), scheduler: DispatchQueue.main)
            .sink { [weak self] in
                Task { await self?.refresh() }
            }
            .store(in: &bag)

        NotificationCenter.default.publisher(for: .fbRefresh)
            .sink { [weak self] _ in self?.refreshSoon() }
            .store(in: &bag)
    }

    func start(settings: AppSettings) {
        self.settings = settings
        task?.cancel()
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
    }

    func refreshSoon() {
        refreshSubject.send(())
    }

    func refresh() async {
        guard let settings else { return }
        let bucketId = settings.bucketId
        loading = true
        defer { loading = false }
        do {
            let files = try await APIClient.shared.listFiles(bucketId: bucketId)
            self.files = files
            self.lastError = nil
            // Drop selection if the file vanished.
            if let sel = selectedFileId, !files.contains(where: { $0.id == sel }) {
                selectedFileId = nil
            }
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    func delete(_ id: String) {
        Task {
            do {
                try await APIClient.shared.deleteFile(id: id)
                await refresh()
            } catch {
                self.lastError = error.localizedDescription
            }
        }
    }

    var selectedFile: FileDTO? {
        guard let id = selectedFileId else { return nil }
        return files.first { $0.id == id }
    }
}
