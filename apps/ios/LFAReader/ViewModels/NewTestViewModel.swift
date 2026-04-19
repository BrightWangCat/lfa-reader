import Foundation
import UIKit

@Observable
class NewTestViewModel {
    // MARK: - Image source

    var showCamera = false
    var showPhotoPicker = false

    // MARK: - Selected image

    var selectedImage: UIImage?

    // MARK: - Patient info

    var selectedWorkflowId = ""
    var shareInfo = false
    var age = ""
    var sex = ""
    var breed = ""
    var areaCode = ""
    var preventiveTreatment: Bool?

    // MARK: - Upload state

    var isUploading = false
    var uploadError: String?
    var uploadComplete = false
    var uploadResult: SingleUploadResponse?

    private let api = APIClient.shared

    // MARK: - Image selection

    func handleCapturedImage(_ image: UIImage) {
        selectedImage = image
        uploadError = nil
        uploadComplete = false
    }

    func handlePickedImages(_ images: [UIImage]) {
        guard let first = images.first else { return }
        selectedImage = first
        uploadError = nil
        uploadComplete = false
    }

    var selectedWorkflow: DiseaseWorkflow? {
        DiseaseWorkflow.workflow(id: selectedWorkflowId)
    }

    var canUpload: Bool {
        guard selectedWorkflow != nil, selectedImage != nil, !isUploading else {
            return false
        }
        if shareInfo && (selectedWorkflow?.needsPreventiveTreatment == true) && preventiveTreatment == nil {
            return false
        }
        return true
    }

    func selectWorkflow(_ workflowId: String) {
        guard selectedWorkflowId != workflowId else { return }
        selectedWorkflowId = workflowId
        selectedImage = nil
        shareInfo = false
        age = ""
        sex = ""
        breed = ""
        areaCode = ""
        preventiveTreatment = nil
        uploadError = nil
        uploadComplete = false
        uploadResult = nil
    }

    // MARK: - Upload

    @MainActor
    func upload() async {
        guard let image = selectedImage,
              let data = image.jpegData(compressionQuality: 0.85) else {
            uploadError = "No image selected"
            return
        }
        guard let workflow = selectedWorkflow else {
            uploadError = "Please choose a disease workflow"
            return
        }
        if shareInfo && workflow.needsPreventiveTreatment && preventiveTreatment == nil {
            uploadError = "Please answer the preventive treatment question"
            return
        }

        isUploading = true
        uploadError = nil

        let filename = "photo_\(Int(Date().timeIntervalSince1970)).jpg"

        do {
            uploadResult = try await api.uploadSingle(
                imageData: data,
                filename: filename,
                diseaseCategory: workflow.label,
                shareInfo: shareInfo,
                age: shareInfo ? age : nil,
                sex: shareInfo ? sex : nil,
                breed: shareInfo ? breed : nil,
                areaCode: shareInfo ? areaCode : nil,
                preventiveTreatment: shareInfo ? preventiveTreatment : nil
            )
            uploadComplete = true
        } catch {
            uploadError = error.localizedDescription
        }

        isUploading = false
    }

    // MARK: - Reset

    func reset(keepWorkflow: Bool = false) {
        selectedImage = nil
        if !keepWorkflow {
            selectedWorkflowId = ""
        }
        shareInfo = false
        age = ""
        sex = ""
        breed = ""
        areaCode = ""
        preventiveTreatment = nil
        isUploading = false
        uploadError = nil
        uploadComplete = false
        uploadResult = nil
    }
}
