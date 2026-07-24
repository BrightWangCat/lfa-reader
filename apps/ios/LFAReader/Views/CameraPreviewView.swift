import SwiftUI
import AVFoundation

struct CameraCaptureGeometry {
    let normalizedCropRect: CGRect
    let rotationAngle: CGFloat
}

/// KVO callbacks are documented to arrive on the main queue. This wrapper
/// makes that externally guaranteed isolation explicit to Swift concurrency.
private final class PreviewLayerReference: @unchecked Sendable {
    weak var value: AVCaptureVideoPreviewLayer?
}

/// Keeps crop and rotation calculations tied to the actual preview layer.
@MainActor
final class CameraPreviewGeometry {
    private weak var previewLayer: AVCaptureVideoPreviewLayer?
    private weak var captureDevice: AVCaptureDevice?
    private var rotationCoordinator: AVCaptureDevice.RotationCoordinator?
    private var previewRotationObservation: NSKeyValueObservation?
    private let previewLayerReference = PreviewLayerReference()

    func attach(
        previewLayer: AVCaptureVideoPreviewLayer,
        captureDevice: AVCaptureDevice?
    ) {
        self.previewLayer = previewLayer
        previewLayerReference.value = previewLayer

        guard let captureDevice else {
            self.captureDevice = nil
            previewRotationObservation?.invalidate()
            previewRotationObservation = nil
            rotationCoordinator = nil
            return
        }

        if self.captureDevice !== captureDevice
            || rotationCoordinator?.previewLayer !== previewLayer {
            self.captureDevice = captureDevice
            previewRotationObservation?.invalidate()

            let coordinator = AVCaptureDevice.RotationCoordinator(
                device: captureDevice,
                previewLayer: previewLayer
            )
            rotationCoordinator = coordinator
            previewRotationObservation = coordinator.observe(
                \.videoRotationAngleForHorizonLevelPreview,
                options: [.initial, .new]
            ) { [previewLayerReference] coordinator, _ in
                guard let previewLayer = previewLayerReference.value,
                      let connection = previewLayer.connection else {
                    return
                }
                let angle = coordinator.videoRotationAngleForHorizonLevelPreview
                if connection.isVideoRotationAngleSupported(angle) {
                    connection.videoRotationAngle = angle
                }
            }
        }

        updatePreviewRotation()
    }

    func updatePreviewRotation() {
        guard let previewLayer,
              let angle = rotationCoordinator?.videoRotationAngleForHorizonLevelPreview,
              let connection = previewLayer.connection,
              connection.isVideoRotationAngleSupported(angle) else {
            return
        }
        connection.videoRotationAngle = angle
    }

    func captureGeometry(for guideRect: CGRect) -> CameraCaptureGeometry? {
        updatePreviewRotation()

        guard let previewLayer,
              let rotationCoordinator else {
            return nil
        }

        let normalizedBounds = CGRect(x: 0, y: 0, width: 1, height: 1)
        let normalizedRect = previewLayer
            .metadataOutputRectConverted(fromLayerRect: guideRect)
            .intersection(normalizedBounds)

        guard !normalizedRect.isNull,
              normalizedRect.width > 0,
              normalizedRect.height > 0 else {
            return nil
        }

        return CameraCaptureGeometry(
            normalizedCropRect: normalizedRect,
            rotationAngle: rotationCoordinator.videoRotationAngleForHorizonLevelCapture
        )
    }
}

/// Wraps AVCaptureVideoPreviewLayer for use in SwiftUI.
struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession
    let captureDevice: AVCaptureDevice?
    let geometry: CameraPreviewGeometry

    func makeUIView(context: Context) -> PreviewUIView {
        let view = PreviewUIView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        view.onLayout = { [weak geometry] layer in
            geometry?.attach(
                previewLayer: layer,
                captureDevice: captureDevice
            )
        }
        geometry.attach(
            previewLayer: view.previewLayer,
            captureDevice: captureDevice
        )
        return view
    }

    func updateUIView(_ uiView: PreviewUIView, context: Context) {
        uiView.previewLayer.session = session
        uiView.onLayout = { [weak geometry] layer in
            geometry?.attach(
                previewLayer: layer,
                captureDevice: captureDevice
            )
        }
        geometry.attach(
            previewLayer: uiView.previewLayer,
            captureDevice: captureDevice
        )
    }

    /// Custom UIView subclass that uses AVCaptureVideoPreviewLayer as its backing layer.
    class PreviewUIView: UIView {
        var onLayout: ((AVCaptureVideoPreviewLayer) -> Void)?

        override class var layerClass: AnyClass {
            AVCaptureVideoPreviewLayer.self
        }

        var previewLayer: AVCaptureVideoPreviewLayer {
            layer as! AVCaptureVideoPreviewLayer
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            onLayout?(previewLayer)
        }
    }
}
