import Foundation
import Combine

/// Persisted user-tunable config. Stored in UserDefaults.
final class AppSettings: ObservableObject {
    @Published var serverURL: String {
        didSet { UserDefaults.standard.set(serverURL, forKey: Keys.serverURL) }
    }
    @Published var devUserId: String {
        didSet { UserDefaults.standard.set(devUserId, forKey: Keys.devUserId) }
    }
    @Published var bucketId: String {
        didSet { UserDefaults.standard.set(bucketId, forKey: Keys.bucketId) }
    }

    enum Keys {
        static let serverURL = "fb.serverURL"
        static let devUserId = "fb.devUserId"
        static let bucketId  = "fb.bucketId"
    }

    static let defaultServerURL = "http://localhost:4000"
    static let defaultDevUserId = "9c391d6b-ec8c-42df-b910-9e553d82934e"
    static let defaultBucketId  = "0c946aae-387c-485b-a9d4-58c28b97af7e"

    init() {
        let d = UserDefaults.standard
        self.serverURL = d.string(forKey: Keys.serverURL) ?? Self.defaultServerURL
        self.devUserId = d.string(forKey: Keys.devUserId) ?? Self.defaultDevUserId
        self.bucketId  = d.string(forKey: Keys.bucketId)  ?? Self.defaultBucketId
    }

    func snapshot() -> Snapshot {
        Snapshot(serverURL: serverURL, devUserId: devUserId, bucketId: bucketId)
    }

    static func snapshot() -> Snapshot {
        let d = UserDefaults.standard
        return Snapshot(
            serverURL: d.string(forKey: Keys.serverURL) ?? defaultServerURL,
            devUserId: d.string(forKey: Keys.devUserId) ?? defaultDevUserId,
            bucketId:  d.string(forKey: Keys.bucketId)  ?? defaultBucketId
        )
    }

    struct Snapshot: Sendable {
        let serverURL: String
        let devUserId: String
        let bucketId: String
    }
}
