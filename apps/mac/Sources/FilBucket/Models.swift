import Foundation

// MARK: - File state

enum FileState: String, Codable, CaseIterable {
    case uploading
    case hot_ready
    case pdp_committed
    case archived_cold
    case restore_from_cold
    case failed

    /// Human label. Same rules as the web glossary: never expose internal terms.
    var label: String {
        switch self {
        case .uploading:         return "Uploading"
        case .hot_ready:         return "Ready"
        case .pdp_committed:     return "Secured"
        case .archived_cold:     return "Archived"
        case .restore_from_cold: return "Restoring"
        case .failed:            return "Failed"
        }
    }
}

// MARK: - DTOs (mirror packages/shared)

struct UploadProgressDTO: Codable, Equatable {
    let chunkIndex: Int
    let chunkTotal: Int
    let totalUploaded: Int
    let totalBytes: Int
}

struct FileDTO: Codable, Identifiable, Equatable {
    let id: String
    let bucketId: String
    let name: String
    let sizeBytes: Int
    let mimeType: String
    let state: FileState
    let progress: UploadProgressDTO?
    let createdAt: String
    let updatedAt: String
}

struct ListFilesResponse: Codable {
    let files: [FileDTO]
}

struct UploadInitRequest: Codable {
    let filename: String
    let size: Int
    let mimeType: String
    let bucketId: String
}

struct UploadInitResponse: Codable {
    let fileId: String
    let uploadUrl: String
    let s3Key: String
}

struct ShareCreateRequest: Codable {
    let password: String?
    let expiresInSeconds: Int?
    let maxDownloads: Int?
}

struct ShareDTO: Codable, Identifiable {
    let id: String
    let token: String
    let url: String
    let hasPassword: Bool
    let expiresAt: String?
    let maxDownloads: Int?
    let downloadCount: Int?
    let revokedAt: String?
    let createdAt: String
}

struct HealthzResponse: Codable {
    let ok: Bool
    let chain: String
    let walletAddress: String?
}

// MARK: - Local upload tracking

/// In-flight upload row shown in the UI before/while bytes are moving.
struct InFlightUpload: Identifiable, Equatable {
    let id: UUID
    var name: String
    var totalBytes: Int64
    var bytesSent: Int64
    var serverFileId: String?
    var status: Status

    enum Status: String, Equatable {
        case starting
        case uploading
        case finalizing
        case done
        case failed
    }
}
