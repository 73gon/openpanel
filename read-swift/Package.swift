// swift-tools-version: 6.1

import PackageDescription

let package = Package(
    name: "OpenPanel",
    platforms: [.iOS(.v18), .macOS(.v13)],
    products: [
        .library(name: "OpenPanel", targets: ["OpenPanel"])
    ],
    targets: [
        .target(
            name: "OpenPanel",
            path: "OpenPanel/Sources"
        )
    ]
)
