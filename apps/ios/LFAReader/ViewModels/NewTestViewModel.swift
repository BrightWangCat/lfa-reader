import Foundation
import UIKit

@Observable
class NewTestViewModel {
    private static let maximumJPEGSize = 20 * 1024 * 1024

    // MARK: - Image source

    var showCamera = false
    var showPhotoPicker = false

    // MARK: - Selected image

    var selectedImage: UIImage?

    // MARK: - Patient info

    var selectedWorkflowId = ""
    var shareInfo: Bool?
    var age = ""
    var sex = ""
    var breed = ""
    var areaCode = ""
    var preventiveTreatment: Bool?

    // MARK: - Upload state

    var isUploading = false
    var uploadProgress: Double?
    var uploadError: String?
    var uploadComplete = false
    var uploadResult: SingleUploadResponse?

    private let api = APIClient.shared
    private var activeUploadId: UUID?

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
        guard selectedWorkflow != nil,
              selectedImage != nil,
              shareInfo != nil,
              !isUploading else {
            return false
        }
        if shareInfo == true &&
            (selectedWorkflow?.needsPreventiveTreatment == true) &&
            preventiveTreatment == nil {
            return false
        }
        return true
    }

    func selectWorkflow(_ workflowId: String) {
        guard selectedWorkflowId != workflowId else { return }
        invalidateUpload()
        selectedWorkflowId = workflowId
        selectedImage = nil
        shareInfo = nil
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
    func upload() async -> Bool {
        guard let image = selectedImage,
              let data = image.jpegData(compressionQuality: 0.85) else {
            uploadError = "No image selected"
            return false
        }
        guard data.count <= Self.maximumJPEGSize else {
            uploadError = "Image exceeds the 20 MiB upload limit"
            return false
        }
        guard let workflow = selectedWorkflow else {
            uploadError = "Please choose a disease workflow"
            return false
        }
        guard let shareInfo else {
            uploadError = "Please choose whether to share patient information"
            return false
        }
        if shareInfo && workflow.needsPreventiveTreatment && preventiveTreatment == nil {
            uploadError = "Please answer the preventive treatment question"
            return false
        }

        let uploadId = UUID()
        activeUploadId = uploadId
        isUploading = true
        uploadProgress = 0
        uploadError = nil
        uploadComplete = false
        uploadResult = nil

        defer {
            if activeUploadId == uploadId {
                activeUploadId = nil
                isUploading = false
                uploadProgress = nil
            }
        }

        let filename = "photo_\(Int(Date().timeIntervalSince1970)).jpg"

        do {
            let result = try await api.uploadSingle(
                imageData: data,
                filename: filename,
                diseaseCategory: workflow.label,
                shareInfo: shareInfo,
                age: shareInfo ? age : nil,
                sex: shareInfo ? sex : nil,
                breed: shareInfo ? breed : nil,
                areaCode: shareInfo ? areaCode : nil,
                preventiveTreatment: shareInfo ? preventiveTreatment : nil,
                onProgress: { [weak self] progress in
                    guard self?.activeUploadId == uploadId else { return }
                    self?.uploadProgress = progress
                }
            )

            guard activeUploadId == uploadId else {
                return false
            }
            uploadResult = result
            uploadProgress = 1
            uploadComplete = true
            return true
        } catch {
            guard activeUploadId == uploadId else {
                return false
            }
            uploadError = error.localizedDescription
            return false
        }
    }

    // MARK: - Reset

    func cancelUpload() {
        invalidateUpload()
    }

    func reset(keepWorkflow: Bool = false) {
        invalidateUpload()
        selectedImage = nil
        if !keepWorkflow {
            selectedWorkflowId = ""
        }
        shareInfo = nil
        age = ""
        sex = ""
        breed = ""
        areaCode = ""
        preventiveTreatment = nil
        uploadError = nil
        uploadComplete = false
        uploadResult = nil
    }

    private func invalidateUpload() {
        activeUploadId = nil
        isUploading = false
        uploadProgress = nil
    }
}
