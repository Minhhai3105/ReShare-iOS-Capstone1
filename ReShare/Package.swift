// swift-tools-version: 5.9
import PackageDescription

// Chạy cùng file logic được app sử dụng; không thay SDK hoặc thêm dependency.
let package = Package(
    name: "ReShareCore",
    platforms: [.macOS(.v13), .iOS(.v17)],
    products: [.library(name: "ReShareCore", targets: ["ReShareCore"])],
    targets: [
        .target(name: "ReShareCore", path: "ReShare/Core", sources: ["DonationQuantity.swift", "ReShareAPIConfiguration.swift"]),
        .testTarget(name: "ReShareCoreTests", dependencies: ["ReShareCore"], path: "ReShareCoreTests")
    ]
)
