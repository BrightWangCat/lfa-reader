import SwiftUI

struct ResultsView: View {
    @State private var viewModel = ResultsViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.images.isEmpty {
                    ProgressView("Loading results...")
                } else if viewModel.images.isEmpty {
                    emptyState
                } else {
                    resultList
                }
            }
            .navigationTitle("Results")
            .task {
                await viewModel.loadImages()
            }
            .refreshable {
                await viewModel.loadImages()
            }
            .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
                Button("OK") { viewModel.errorMessage = nil }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .alert("Delete Image?", isPresented: .constant(viewModel.deleteTargetId != nil)) {
                Button("Cancel", role: .cancel) { viewModel.deleteTargetId = nil }
                Button("Delete", role: .destructive) {
                    if let id = viewModel.deleteTargetId {
                        viewModel.deleteTargetId = nil
                        Task { await viewModel.deleteImage(id: id) }
                    }
                }
            } message: {
                Text("Delete this image? This cannot be undone.")
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "list.bullet.clipboard")
                .font(.system(size: 72))
                .foregroundStyle(.tint)

            Text("No Results Yet")
                .font(.largeTitle.bold())

            Text("Upload a test strip image to see your history here")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Spacer()
        }
    }

    private var resultList: some View {
        List {
            ForEach(viewModel.images) { image in
                NavigationLink {
                    ImageDetailView(imageId: image.id)
                } label: {
                    imageRow(image)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        viewModel.deleteTargetId = image.id
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private func statusBadge(_ status: String?) -> some View {
        let s = status ?? "idle"
        Text(statusLabel(s))
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(statusColor(s).opacity(0.15), in: Capsule())
            .foregroundStyle(statusColor(s))
    }

    private func imageRow(_ image: TestImageSummary) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(image.originalFilename)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                if let disease = image.diseaseCategory {
                    Text(disease)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Text(image.createdAt.formattedDate)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 6) {
                statusBadge(image.readingStatus)

                if let result = image.finalResult {
                    Text(result)
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(resultColor(for: result).opacity(0.15), in: Capsule())
                        .foregroundStyle(resultColor(for: result))
                } else {
                    Text("Pending")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "running":
            return "Running"
        case "completed":
            return "Done"
        case "failed":
            return "Failed"
        default:
            return "Idle"
        }
    }

    private func statusColor(_ status: String) -> Color {
        switch status {
        case "completed":
            return .green
        case "running":
            return .orange
        case "failed":
            return .red
        default:
            return .gray
        }
    }
}

#Preview {
    ResultsView()
}
