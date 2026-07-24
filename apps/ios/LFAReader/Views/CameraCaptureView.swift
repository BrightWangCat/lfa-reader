import SwiftUI
import AVFoundation
import CoreImage

/// Full-screen camera interface for capturing test strip images.
struct CameraCaptureView: View {
    let onCaptured: (UIImage) -> Void

    private let guideWidthFraction: CGFloat = 0.85
    private let guideAspectRatio: CGFloat = 2

    @State private var cameraService = CameraService()
    @State private var previewGeometry = CameraPreviewGeometry()
    @State private var isCapturing = false
    @State private var croppedImage: UIImage?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            if let croppedImage {
                capturedPreview(croppedImage)
            } else if cameraService.permissionGranted {
                cameraContent
            } else {
                permissionDeniedContent
            }
        }
        .background(.black)
        .ignoresSafeArea()
        .task {
            await cameraService.checkPermission()
            if cameraService.permissionGranted {
                cameraService.configureSession()
                cameraService.startSession()
            }
        }
        .onDisappear {
            cameraService.stopSession()
        }
    }

    // MARK: - Camera content

    private var cameraContent: some View {
        GeometryReader { geometry in
            ZStack {
                // Live preview
                CameraPreviewView(
                    session: cameraService.captureSession,
                    captureDevice: cameraService.captureDevice,
                    geometry: previewGeometry
                )
                    .ignoresSafeArea()

                // Scan guide overlay
                scanGuideOverlay(in: geometry.size)

                // Bottom controls
                VStack {
                    Spacer()
                    controlBar(previewSize: geometry.size)
                }

                // Error message
                if let error = cameraService.error {
                    VStack {
                        Text(error)
                            .foregroundStyle(.white)
                            .padding()
                            .background(.red.opacity(0.8), in: RoundedRectangle(cornerRadius: 8))
                        Spacer()
                    }
                    .padding(.top, 60)
                }
            }
        }
    }

    private func scanGuideOverlay(in previewSize: CGSize) -> some View {
        let guideSize = guideSize(in: previewSize)

        return ZStack {
            RoundedRectangle(cornerRadius: 12)
                .stroke(.white.opacity(0.7), style: StrokeStyle(lineWidth: 2, dash: [8, 6]))
                .frame(width: guideSize.width, height: guideSize.height)

            Text("Please place the cassette inside the frame, CLI facing up")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.8))
                .multilineTextAlignment(.center)
                .frame(maxWidth: previewSize.width * 0.9)
                .offset(y: -(guideSize.height / 2 + 28))
        }
    }

    private func controlBar(previewSize: CGSize) -> some View {
        HStack {
            // Cancel button
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(width: 50, height: 50)
            }

            Spacer()

            // Capture button
            Button {
                guard !isCapturing, cameraService.isSessionRunning else { return }
                let cropGuideRect = guideRect(in: previewSize)
                guard let captureGeometry = previewGeometry.captureGeometry(
                    for: cropGuideRect
                ) else {
                    cameraService.error = "Camera preview is not ready"
                    return
                }

                isCapturing = true
                Task {
                    do {
                        let image = try await cameraService.capturePhoto(
                            rotationAngle: captureGeometry.rotationAngle
                        )
                        guard let cropped = cropImage(
                            image,
                            normalizedRect: captureGeometry.normalizedCropRect
                        ) else {
                            cameraService.error = "Failed to crop the captured photo"
                            isCapturing = false
                            return
                        }
                        cameraService.stopSession()
                        croppedImage = cropped
                    } catch {
                        cameraService.error = error.localizedDescription
                    }
                    isCapturing = false
                }
            } label: {
                ZStack {
                    Circle()
                        .stroke(.white, lineWidth: 4)
                        .frame(width: 70, height: 70)
                    Circle()
                        .fill(.white)
                        .frame(width: 58, height: 58)
                        .opacity(isCapturing ? 0.5 : 1)
                }
            }
            .disabled(isCapturing || !cameraService.isSessionRunning)

            Spacer()

            // Spacer for symmetry
            Color.clear.frame(width: 50, height: 50)
        }
        .padding(.horizontal, 30)
        .padding(.bottom, 40)
    }

    // MARK: - Captured preview

    private func capturedPreview(_ image: UIImage) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 8))

            HStack(spacing: 16) {
                Button("Retake") {
                    croppedImage = nil
                    cameraService.error = nil
                    cameraService.startSession()
                }
                .buttonStyle(.bordered)
                .tint(.white)
                .controlSize(.large)
                .frame(maxWidth: .infinity)

                Button("Confirm") {
                    onCaptured(image)
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .frame(maxWidth: .infinity)
            }

            Spacer()
                .frame(height: 16)
        }
        .padding(24)
    }

    private func guideSize(in previewSize: CGSize) -> CGSize {
        let width = previewSize.width * guideWidthFraction
        return CGSize(width: width, height: width / guideAspectRatio)
    }

    private func guideRect(in previewSize: CGSize) -> CGRect {
        let size = guideSize(in: previewSize)
        return CGRect(
            x: (previewSize.width - size.width) / 2,
            y: (previewSize.height - size.height) / 2,
            width: size.width,
            height: size.height
        )
    }

    /// Crops using the preview layer's normalized device coordinates, then
    /// flattens the photo orientation so the backend receives upright pixels.
    private func cropImage(_ image: UIImage, normalizedRect: CGRect) -> UIImage? {
        guard let sourceCGImage = image.cgImage else {
            return nil
        }

        let pixelBounds = CGRect(
            x: 0,
            y: 0,
            width: sourceCGImage.width,
            height: sourceCGImage.height
        )
        let cropRect = CGRect(
            x: normalizedRect.minX * pixelBounds.width,
            y: normalizedRect.minY * pixelBounds.height,
            width: normalizedRect.width * pixelBounds.width,
            height: normalizedRect.height * pixelBounds.height
        ).integral.intersection(pixelBounds)

        guard !cropRect.isNull,
              cropRect.width > 0,
              cropRect.height > 0,
              let croppedCGImage = sourceCGImage.cropping(to: cropRect) else {
            return nil
        }

        let croppedImage = UIImage(
            cgImage: croppedCGImage,
            scale: image.scale,
            orientation: image.imageOrientation
        )
        guard let orientedImage = CIImage(
            image: croppedImage,
            options: [.applyOrientationProperty: true]
        ),
        let flattenedCGImage = CIContext().createCGImage(
            orientedImage,
            from: orientedImage.extent
        ) else {
            return nil
        }

        return UIImage(
            cgImage: flattenedCGImage,
            scale: image.scale,
            orientation: .up
        )
    }

    // MARK: - Permission denied

    private var permissionDeniedContent: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)

            Text("Camera Access Required")
                .font(.title3.bold())
                .foregroundStyle(.white)

            Text("Please allow camera access in Settings to capture test strip images.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 8)

            Button("Cancel") {
                dismiss()
            }
            .foregroundStyle(.white)
            .padding(.top, 4)
        }
    }
}
