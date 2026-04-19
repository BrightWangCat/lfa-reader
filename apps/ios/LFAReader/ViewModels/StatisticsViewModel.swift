import Foundation

@Observable
class StatisticsViewModel {
    var stats: GlobalStats?
    var isLoading = false
    var errorMessage: String?
    var selectedWorkflowId = ""

    private let api = APIClient.shared

    var selectedWorkflow: DiseaseWorkflow? {
        DiseaseWorkflow.workflow(id: selectedWorkflowId)
    }

    @MainActor
    func selectWorkflow(_ workflowId: String) {
        selectedWorkflowId = workflowId
    }

    @MainActor
    func loadStats() async {
        guard let workflow = selectedWorkflow else {
            stats = nil
            errorMessage = nil
            isLoading = false
            return
        }

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
