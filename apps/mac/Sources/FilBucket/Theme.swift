import SwiftUI

/// Brand tokens, mirrors apps/web/src/app/globals.css.
enum FBColor {
    static let paper        = Color(red: 0.969, green: 0.957, blue: 0.933)   // #f7f4ee
    static let paperRaised  = Color(red: 0.984, green: 0.976, blue: 0.957)   // #fbf9f4
    static let ink          = Color(red: 0.102, green: 0.094, blue: 0.090)   // #1a1817
    static let inkSoft      = Color(red: 0.361, green: 0.345, blue: 0.322)   // #5c5852
    static let inkMute      = Color(red: 0.541, green: 0.522, blue: 0.490)   // #8a857d
    static let line         = Color(red: 0.906, green: 0.882, blue: 0.831)   // #e7e1d4
    static let lineStrong   = Color(red: 0.835, green: 0.800, blue: 0.729)   // #d5ccba
    static let accent       = Color(red: 0.710, green: 0.290, blue: 0.090)   // #b54a17 burnt sienna
    static let accentSoft   = Color(red: 0.953, green: 0.851, blue: 0.769)   // #f3d9c4
    static let ok           = Color(red: 0.247, green: 0.420, blue: 0.227)   // #3f6b3a
    static let warn         = Color(red: 0.647, green: 0.447, blue: 0.043)   // #a5720b
    static let err          = Color(red: 0.635, green: 0.227, blue: 0.165)   // #a23a2a
    static let medallion    = Color(red: 0.043, green: 0.435, blue: 0.753)   // #0b6fc0 Filecoin-blue echo
    static let medallionSoft = Color(red: 0.660, green: 0.820, blue: 1.000)  // #a8d2ff
}

enum FBFont {
    /// Display serif. Uses New York if available, falls back to system serif.
    static func serif(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
    static func sans(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

/// Color for a file's pill state badge.
extension FileState {
    var badgeColor: Color {
        switch self {
        case .uploading:         return FBColor.warn
        case .hot_ready:         return FBColor.accent
        case .pdp_committed:     return FBColor.ok
        case .archived_cold:     return FBColor.inkMute
        case .restore_from_cold: return FBColor.warn
        case .failed:            return FBColor.err
        }
    }
}

/// Format byte counts the way Finder does.
func fbByteString(_ bytes: Int) -> String {
    fbByteString(Int64(bytes))
}
func fbByteString(_ bytes: Int64) -> String {
    let f = ByteCountFormatter()
    f.countStyle = .file
    f.allowedUnits = [.useKB, .useMB, .useGB, .useTB, .useBytes]
    return f.string(fromByteCount: bytes)
}

func fbRelativeDate(_ iso: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    var date = formatter.date(from: iso)
    if date == nil {
        let f2 = ISO8601DateFormatter()
        f2.formatOptions = [.withInternetDateTime]
        date = f2.date(from: iso)
    }
    guard let date else { return iso }
    let rel = RelativeDateTimeFormatter()
    rel.unitsStyle = .abbreviated
    return rel.localizedString(for: date, relativeTo: Date())
}
