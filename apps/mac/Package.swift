// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "FilBucket",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(name: "FilBucket", targets: ["FilBucket"]),
    ],
    targets: [
        .executableTarget(
            name: "FilBucket",
            path: "Sources/FilBucket",
            resources: [
                .process("Resources"),
            ]
        ),
        .testTarget(
            name: "FilBucketTests",
            dependencies: ["FilBucket"],
            path: "Tests/FilBucketTests"
        ),
    ]
)
