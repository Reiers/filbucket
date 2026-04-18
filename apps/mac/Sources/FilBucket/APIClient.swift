import Foundation

/// Thin REST client for the FilBucket server. Adds the dev auth header to every
/// request. Server URL + dev user id come from `AppSettings`.
final class APIClient: @unchecked Sendable {
    static let shared = APIClient()

    private var snapshot: AppSettings.Snapshot
    private let session: URLSession
    private let lock = NSLock()

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 6 * 60 * 60
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
        self.snapshot = AppSettings.snapshot()
    }

    func applySettings(_ s: AppSettings.Snapshot) {
        lock.lock(); defer { lock.unlock() }
        self.snapshot = s
    }

    private func currentSnapshot() -> AppSettings.Snapshot {
        lock.lock(); defer { lock.unlock() }
        return snapshot
    }

    var serverURL: URL? { URL(string: currentSnapshot().serverURL) }
    var devUserId: String { currentSnapshot().devUserId }
    var bucketId: String { currentSnapshot().bucketId }

    private func makeRequest(path: String, query: [URLQueryItem] = [], method: String = "GET", body: Data? = nil, contentType: String? = nil, includeAuth: Bool = true) -> URLRequest? {
        guard let base = serverURL else { return nil }
        var comps = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty {
            comps?.queryItems = query
        }
        guard let url = comps?.url else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if includeAuth {
            req.setValue(devUserId, forHTTPHeaderField: "X-Dev-User")
        }
        if let body { req.httpBody = body }
        if let contentType { req.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        return req
    }

    // MARK: - Health

    func health() async throws -> HealthzResponse {
        guard let req = makeRequest(path: "/healthz", includeAuth: false) else { throw APIError.badURL }
        let (data, resp) = try await session.data(for: req)
        try Self.ensureOK(resp, data: data)
        return try JSONDecoder().decode(HealthzResponse.self, from: data)
    }

    // MARK: - Files

    func listFiles(bucketId: String) async throws -> [FileDTO] {
        guard let req = makeRequest(
            path: "/api/files",
            query: [URLQueryItem(name: "bucketId", value: bucketId)]
        ) else { throw APIError.badURL }
        let (data, resp) = try await session.data(for: req)
        try Self.ensureOK(resp, data: data)
        return try JSONDecoder().decode(ListFilesResponse.self, from: data).files
    }

    func deleteFile(id: String) async throws {
        guard let req = makeRequest(path: "/api/files/\(id)", method: "DELETE") else { throw APIError.badURL }
        let (data, resp) = try await session.data(for: req)
        try Self.ensureOK(resp, data: data)
    }

    /// Browser-friendly download URL. Uses `?u=` so that `NSWorkspace.open` does
    /// not need to inject a header. Same trick the web UI uses.
    func downloadURL(for fileId: String) -> URL? {
        guard let base = serverURL else { return nil }
        var comps = URLComponents(url: base.appendingPathComponent("/api/files/\(fileId)/download"), resolvingAgainstBaseURL: false)
        comps?.queryItems = [URLQueryItem(name: "u", value: devUserId)]
        return comps?.url
    }

    // MARK: - Uploads

    func uploadInit(filename: String, size: Int, mimeType: String, bucketId: String) async throws -> UploadInitResponse {
        let body = try JSONEncoder().encode(UploadInitRequest(
            filename: filename, size: size, mimeType: mimeType, bucketId: bucketId
        ))
        guard let req = makeRequest(
            path: "/api/uploads/init",
            method: "POST",
            body: body,
            contentType: "application/json"
        ) else { throw APIError.badURL }
        let (data, resp) = try await session.data(for: req)
        try Self.ensureOK(resp, data: data)
        return try JSONDecoder().decode(UploadInitResponse.self, from: data)
    }

    func uploadComplete(fileId: String) async throws -> FileDTO {
        guard let req = makeRequest(
            path: "/api/uploads/\(fileId)/complete",
            method: "POST"
        ) else { throw APIError.badURL }
        let (data, resp) = try await session.data(for: req)
        try Self.ensureOK(resp, data: data)
        return try JSONDecoder().decode(FileDTO.self, from: data)
    }

    // MARK: - Shares

    func createShare(fileId: String, password: String?, expiresInSeconds: Int?, maxDownloads: Int?) async throws -> ShareDTO {
        let body = try JSONEncoder().encode(ShareCreateRequest(
            password: password, expiresInSeconds: expiresInSeconds, maxDownloads: maxDownloads
        ))
        guard let req = makeRequest(
            path: "/api/files/\(fileId)/shares",
            method: "POST",
            body: body,
            contentType: "application/json"
        ) else { throw APIError.badURL }
        let (data, resp) = try await session.data(for: req)
        try Self.ensureOK(resp, data: data)
        return try JSONDecoder().decode(ShareDTO.self, from: data)
    }

    /// Build a public share URL for the user. Phase 0 the web app serves /s/<token>;
    /// for the desktop client we point at the API host since that's what the user
    /// configured. If the web UI is on a different host the user can edit later.
    func shareURL(token: String) -> URL? {
        guard let base = serverURL else { return nil }
        // Strip :4000 port and substitute :3010 if the user is on localhost — that's
        // where the web shareable page actually lives. Otherwise we just hand back
        // the API host with /s/<token> which won't render but at least it's truthy.
        if let host = base.host, host == "localhost" || host == "127.0.0.1" {
            return URL(string: "http://localhost:3010/s/\(token)")
        }
        return base.appendingPathComponent("/s/\(token)")
    }

    // MARK: - Helpers

    private static func ensureOK(_ resp: URLResponse, data: Data) throws {
        guard let http = resp as? HTTPURLResponse else { throw APIError.badResponse }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.http(status: http.statusCode, body: body)
        }
    }
}

enum APIError: Error, LocalizedError {
    case badURL
    case badResponse
    case http(status: Int, body: String)

    var errorDescription: String? {
        switch self {
        case .badURL:           return "Invalid server URL"
        case .badResponse:      return "Bad server response"
        case .http(let s, let b):
            let snippet = b.prefix(200)
            return "HTTP \(s): \(snippet)"
        }
    }
}
