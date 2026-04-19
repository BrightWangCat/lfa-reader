import SwiftUI

struct ResultsView: View {
    @State private var viewModel = ResultsViewModel()
    @State private var navigationPath: [Int] = []

    var body: some View {
        NavigationStack(path: $navigationPath) {
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
            .navigationDestination(for: Int.self) { imageId in
                ImageDetailView(imageId: imageId)
            }
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

            Text("Your analyzed images will appear here.")
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
                Button {
                    navigationPath.append(image.id)
                } label: {
                    resultCard(for: image)
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        viewModel.deleteTargetId = image.id
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color(.systemGroupedBackground))
    }

    private func resultCard(for image: TestImageSummary) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                if let disease = image.diseaseCategory {
                    capsuleLabel(text: disease, tint: .blue)
                }

                Spacer()

                statusBadge(image.readingStatus)
            }

            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(image.finalResult ?? "Pending Review")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(resultForeground(for: image.finalResult))

                    Text(image.originalFilename)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
                    .padding(.top, 4)
            }

            HStack(spacing: 10) {
                Text(image.createdAt.formattedDate)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)

                if image.manualCorrection != nil {
                    capsuleLabel(text: "Corrected", tint: .orange)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground))
        )
    }

    @ViewBuilder
    private func statusBadge(_ status: String?) -> some View {
        let value = status ?? "idle"
        Text(statusLabel(value))
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(statusColor(value).opacity(0.14), in: Capsule())
            .foregroundStyle(statusColor(value))
    }

    private func capsuleLabel(text: String, tint: Color) -> some View {
        Text(text)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.12), in: Capsule())
            .foregroundStyle(tint)
    }

    private func resultForeground(for result: String?) -> Color {
        guard let result else { return .secondary }
        return resultColor(for: result)
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
