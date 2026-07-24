import SwiftUI

/// Semi-transparent overlay shown during image upload.
struct UploadProgressView: View {
    let message: String
    var progress: Double? = nil

    var body: some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                if let progress {
                    ProgressView(value: progress)
                        .progressViewStyle(.linear)
                        .tint(.white)
                        .frame(width: 180)
                    Text("\(Int((progress * 100).rounded()))%")
                        .font(.title3.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.white)
                } else {
                    ProgressView()
                        .scaleEffect(1.5)
                        .tint(.white)
                }

                Text(message)
                    .font(.headline)
                    .foregroundStyle(.white)
            }
            .padding(32)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
    }
}

#Preview {
    UploadProgressView(message: "Uploading image...", progress: 0.42)
}
