import Foundation

@Observable
class ResultsViewModel {
    var images: [TestImageSummary] = []
    var isLoading = false
    var errorMessage: String?
    var deleteTargetId: Int?

    private let api = APIClient.shared

    // MARK: - Load

    @MainActor
    func loadImages() async {
        isLoading = true
        errorMessage = nil

        do {
            images = try await api.fetchImages()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Delete

    @MainActor
    func deleteImage(id: Int) async {
        do {
            try await api.deleteImage(id: id)
            images.removeAll { $0.id == id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
