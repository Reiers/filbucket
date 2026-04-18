import Foundation
import Combine

/// Pings /healthz periodically. Drives the offline banner.
@MainActor
final class HealthMonitor: ObservableObject {
    @Published private(set) var isReachable: Bool = true
    @Published private(set) var chain: String? = nil
    @Published private(set) var walletAddress: String? = nil
    @Published private(set) var lastError: String? = nil

    private var task: Task<Void, Never>?

    func start(settings: AppSettings) {
        task?.cancel()
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.tick()
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
    }

    func kick() {
        Task { await tick() }
    }

    private func tick() async {
        do {
            let h = try await APIClient.shared.health()
            self.isReachable = h.ok
            self.chain = h.chain
            self.walletAddress = h.walletAddress
            self.lastError = nil
        } catch {
            self.isReachable = false
            self.lastError = error.localizedDescription
        }
    }
}
