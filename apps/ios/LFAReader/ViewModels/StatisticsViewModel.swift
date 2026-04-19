import Foundation

@Observable
class StatisticsViewModel {
    let workflow: DiseaseWorkflow
    var stats: GlobalStats?
    var isLoading = false
    var errorMessage: String?

    private let api = APIClient.shared

    init(workflow: DiseaseWorkflow) {
        self.workflow = workflow
    }

    @MainActor
    func loadStats() async {
        isLoading = true
        errorMessage = nil

        do {
            stats = try await api.fetchGlobalStats(diseaseCategory: workflow.label)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}
