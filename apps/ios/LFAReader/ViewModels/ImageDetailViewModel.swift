import Foundation
import UIKit

@Observable
class ImageDetailViewModel {
    let imageId: Int
    var testImage: TestImage?
    var loadedImage: UIImage?
    var isLoadingImage = false
    var isLoadingDetails = false
    var isSavingCorrection = false
    var selectedCorrection: String
    var isReclassifying = false

    // Separate error fields so they don't interfere
    var classificationError: String?
    var correctionError: String?
    var detailError: String?

    private let api = APIClient.shared
    private var pollingTask: Task<Void, Never>?

    init(imageId: Int, initialImage: TestImage? = nil) {
        self.imageId = imageId
        self.testImage = initialImage
        self.selectedCorrection = initialImage?.manualCorrection ?? initialImage?.cvResult ?? ""
    }

    deinit {
        pollingTask?.cancel()
    }

    @MainActor
    func loadDetailsIfNeeded() async {
        if testImage == nil {
            await refreshImage()
        } else if testImage?.readingStatus == "running" {
            startPollingIfNeeded()
        }
    }

    @MainActor
    func refreshImage() async {
        isLoadingDetails = true
        detailError = nil

        do {
            let image = try await api.fetchImage(id: imageId)
            testImage = image
            selectedCorrection = image.manualCorrection ?? image.cvResult ?? selectedCorrection
            if image.readingStatus == "running" {
                startPollingIfNeeded()
            } else {
                stopPolling()
            }
        } catch {
            detailError = error.localizedDescription
        }

        isLoadingDetails = false
    }

    @MainActor
    func loadImage(original: Bool = false) async {
        isLoadingImage = true

        if let cached = await ImageCache.shared.image(for: imageId, original: original) {
            loadedImage = cached
            isLoadingImage = false
            return
        }

        do {
            let data = try await api.fetchImageData(imageId: imageId, original: original)
            if let image = UIImage(data: data) {
                await ImageCache.shared.store(image, for: imageId, original: original)
                loadedImage = image
            }
        } catch {
            detailError = error.localizedDescription
        }

        isLoadingImage = false
    }

    @MainActor
    func reclassify() async {
        guard !isReclassifying else { return }

        classificationError = nil

        do {
            try await api.startClassification(imageId: imageId)
            if var image = testImage {
                image.readingStatus = "running"
                image.readingError = nil
                image.cvResult = nil
                image.cvConfidence = nil
                testImage = image
            }
            startPollingIfNeeded()
        } catch {
            classificationError = error.localizedDescription
        }
    }

    @MainActor
    func cancelReclassification() async {
        do {
            try await api.cancelClassification(imageId: imageId)
            stopPolling()
            await refreshImage()
        } catch {
            classificationError = error.localizedDescription
        }
    }

    @MainActor
    func saveCorrection() async {
        guard !selectedCorrection.isEmpty, !isSavingCorrection else { return }
        isSavingCorrection = true
        correctionError = nil

        do {
            let response = try await api.correctImage(imageId: imageId, correction: selectedCorrection)
            if var image = testImage {
                image.manualCorrection = response.manualCorrection
                image.cvResult = response.cvResult
                testImage = image
            }
        } catch {
            correctionError = error.localizedDescription
        }

        isSavingCorrection = false
    }

    @MainActor
    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
        isReclassifying = false
    }

    @MainActor
    private func startPollingIfNeeded() {
        guard pollingTask == nil else { return }
        guard testImage?.readingStatus == "running" else {
            isReclassifying = false
            return
        }

        isReclassifying = true
        pollingTask = Task { [weak self] in
            guard let self else { return }

            while !Task.isCancelled {
                do {
                    let status = try await self.api.fetchClassificationStatus(imageId: self.imageId)
                    await MainActor.run {
                        self.apply(status)
                    }

                    if status.status != "running" {
                        await self.refreshImage()
                        await MainActor.run {
                            if status.status == "failed" {
                                self.classificationError = status.readingError ?? "Classification failed"
                            }
                            self.stopPolling()
                        }
                        break
                    }

                    try await Task.sleep(for: .seconds(2))
                } catch is CancellationError {
                    break
                } catch {
                    await MainActor.run {
                        self.classificationError = error.localizedDescription
                        self.stopPolling()
                    }
                    break
                }
            }
        }
    }

    @MainActor
    private func apply(_ status: ClassificationStatus) {
        if var image = testImage {
            image.readingStatus = status.readingStatus
            image.readingError = status.readingError
            image.cvResult = status.cvResult
            image.cvConfidence = status.cvConfidence
            testImage = image
        }
    }
}
