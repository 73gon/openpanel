import Foundation
import SwiftUI
import UIKit

// MARK: - Image Cache

actor ImageCache {
    static let shared = ImageCache()

    private let cache = NSCache<NSString, UIImage>()
    private var inFlight: [URL: Task<UIImage?, Error>] = [:]

    init() {
        cache.countLimit = 500
        cache.totalCostLimit = 100 * 1024 * 1024 // 100 MB
    }

    func image(for url: URL) async throws -> UIImage? {
        let key = url.absoluteString as NSString

        // Check memory cache
        if let cached = cache.object(forKey: key) {
            return cached
        }

        // Check in-flight
        if let existing = inFlight[key as String as URL] {
            return try await existing.value
        }

        let task = Task<UIImage?, Error> {
            let (data, response) = try await URLSession.shared.data(from: url)

            // Follow redirects (series thumbnails return 307)
            guard let http = response as? HTTPURLResponse,
                  (200...399).contains(http.statusCode) else {
                return nil
            }

            guard let image = UIImage(data: data) else { return nil }

            cache.setObject(image, forKey: key, cost: data.count)
            return image
        }

        inFlight[url] = task

        do {
            let result = try await task.value
            inFlight[url] = nil
            return result
        } catch {
            inFlight[url] = nil
            throw error
        }
    }

    func prefetch(urls: [URL]) {
        for url in urls {
            let key = url.absoluteString as NSString
            guard cache.object(forKey: key) == nil else { continue }
            Task {
                _ = try? await image(for: url)
            }
        }
    }
}

// MARK: - Cached Async Image

struct CachedAsyncImage<Placeholder: View>: View {
    let url: URL?
    let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var isLoading = false

    init(url: URL?, @ViewBuilder placeholder: @escaping () -> Placeholder) {
        self.url = url
        self.placeholder = placeholder
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
            } else {
                placeholder()
                    .task {
                        await loadImage()
                    }
            }
        }
    }

    private func loadImage() async {
        guard let url, !isLoading else { return }
        isLoading = true
        image = try? await ImageCache.shared.image(for: url)
        isLoading = false
    }
}
