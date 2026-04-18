import XCTest
@testable import FilBucket

/// Smoke tests. Don't hit the network. Just verify wiring.
final class SmokeTests: XCTestCase {

    func testFileStateLabels() {
        XCTAssertEqual(FileState.uploading.label, "Uploading")
        XCTAssertEqual(FileState.hot_ready.label, "Ready")
        XCTAssertEqual(FileState.pdp_committed.label, "Secured")
        XCTAssertEqual(FileState.archived_cold.label, "Archived")
        XCTAssertEqual(FileState.restore_from_cold.label, "Restoring")
        XCTAssertEqual(FileState.failed.label, "Failed")
    }

    func testByteFormatting() {
        XCTAssertFalse(fbByteString(0).isEmpty)
        XCTAssertTrue(fbByteString(1024 * 1024).contains("MB") || fbByteString(1024 * 1024).contains("KB"))
    }

    func testFileDTODecoding() throws {
        let json = """
        {
          "id": "00000000-0000-0000-0000-000000000001",
          "bucketId": "00000000-0000-0000-0000-000000000002",
          "name": "test.bin",
          "sizeBytes": 1024,
          "mimeType": "application/octet-stream",
          "state": "hot_ready",
          "createdAt": "2026-04-18T19:38:20.107Z",
          "updatedAt": "2026-04-18T19:38:20.216Z"
        }
        """.data(using: .utf8)!
        let dto = try JSONDecoder().decode(FileDTO.self, from: json)
        XCTAssertEqual(dto.name, "test.bin")
        XCTAssertEqual(dto.state, .hot_ready)
    }

    func testSettingsDefaults() {
        let snap = AppSettings.snapshot()
        XCTAssertFalse(snap.serverURL.isEmpty)
        XCTAssertFalse(snap.devUserId.isEmpty)
        XCTAssertFalse(snap.bucketId.isEmpty)
    }
}
