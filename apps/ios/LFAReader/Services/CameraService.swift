import AVFoundation
import UIKit

@Observable
class CameraService: NSObject, @unchecked Sendable {
    var capturedImage: UIImage?
    var isSessionRunning = false
    var permissionGranted = false
    var error: String?
    private(set) var captureDevice: AVCaptureDevice?

    let captureSession = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(label: "com.lfareader.camera")
    private var photoContinuation: CheckedContinuation<UIImage, any Error>?

    func checkPermission() async {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        switch status {
        case .authorized:
            permissionGranted = true
        case .notDetermined:
            permissionGranted = await AVCaptureDevice.requestAccess(for: .video)
        default:
            permissionGranted = false
        }
    }

    func configureSession() {
        sessionQueue.async { [self] in
            captureSession.beginConfiguration()
            captureSession.sessionPreset = .photo

            // Add camera input
            guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
                Task { @MainActor in self.error = "No rear camera available" }
                captureSession.commitConfiguration()
                return
            }
            Task { @MainActor in self.captureDevice = camera }

            do {
                let input = try AVCaptureDeviceInput(device: camera)
                if captureSession.canAddInput(input) {
                    captureSession.addInput(input)
                }
            } catch {
                Task { @MainActor in self.error = "Failed to configure camera: \(error.localizedDescription)" }
                captureSession.commitConfiguration()
                return
            }

            // Add photo output
            if captureSession.canAddOutput(photoOutput) {
                captureSession.addOutput(photoOutput)
                photoOutput.maxPhotoQualityPrioritization = .quality
            }

            captureSession.commitConfiguration()
        }
    }

    func startSession() {
        sessionQueue.async { [self] in
            if !captureSession.isRunning {
                captureSession.startRunning()
                Task { @MainActor in self.isSessionRunning = true }
            }
        }
    }

    func stopSession() {
        sessionQueue.async { [self] in
            if captureSession.isRunning {
                captureSession.stopRunning()
                Task { @MainActor in self.isSessionRunning = false }
            }
        }
    }

    func capturePhoto(rotationAngle: CGFloat) async throws -> UIImage {
        try await withCheckedThrowingContinuation { continuation in
            self.photoContinuation = continuation
            sessionQueue.async { [self] in
                if let connection = photoOutput.connection(with: .video),
                   connection.isVideoRotationAngleSupported(rotationAngle) {
                    connection.videoRotationAngle = rotationAngle
                }
                let settings = AVCapturePhotoSettings(
                    format: [AVVideoCodecKey: AVVideoCodecType.jpeg]
                )
                photoOutput.capturePhoto(with: settings, delegate: self)
            }
        }
    }
}

// MARK: - AVCapturePhotoCaptureDelegate

extension CameraService: AVCapturePhotoCaptureDelegate {
    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: (any Error)?
    ) {
        if let error {
            photoContinuation?.resume(throwing: error)
            photoContinuation = nil
            return
        }

        guard let data = photo.fileDataRepresentation(),
              let image = UIImage(data: data) else {
            photoContinuation?.resume(throwing: CameraError.captureDataMissing)
            photoContinuation = nil
            return
        }

        photoContinuation?.resume(returning: image)
        photoContinuation = nil

        Task { @MainActor in
            self.capturedImage = image
        }
    }
}

enum CameraError: LocalizedError {
    case captureDataMissing

    var errorDescription: String? {
        switch self {
        case .captureDataMissing:
            return "Failed to capture photo data"
        }
    }
}
