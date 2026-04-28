// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "PaddleupShared",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10),
    ],
    products: [
        .library(name: "PaddleupShared", targets: ["PaddleupShared"]),
    ],
    targets: [
        .target(
            name: "PaddleupShared",
            path: "Sources/PaddleupShared"
        ),
        .testTarget(
            name: "PaddleupSharedTests",
            dependencies: ["PaddleupShared"],
            path: "Tests/PaddleupSharedTests"
        ),
    ]
)
