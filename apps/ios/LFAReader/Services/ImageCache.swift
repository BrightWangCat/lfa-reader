import UIKit

/// In-memory image cache backed by NSCache.
actor ImageCache {
    static let shared = ImageCache()

    private let cache: NSCache<NSString, UIImage>

    private init() {
        cache = NSCache()
        cache.countLimit = 100
        cache.totalCostLimit = 50 * 1024 * 1024
    }

    private func cacheKey(for id: Int, original: Bool) -> NSString {
        "\(id)-\(original ? "original" : "processed")" as NSString
    }

    func image(for id: Int, original: Bool) -> UIImage? {
        cache.object(forKey: cacheKey(for: id, original: original))
    }

    func store(_ image: UIImage, for id: Int, original: Bool) {
        cache.setObject(image, forKey: cacheKey(for: id, original: original))
    }

    func clear() {
        cache.removeAllObjects()
    }
}
