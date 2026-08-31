import SwiftUI

private enum ImageVariant: String, CaseIterable, Identifiable {
    case processed
    case original

    var id: String { rawValue }

    var title: String {
        switch self {
        case .processed:
            return "Processed"
        case .original:
            return "Original"
        }
    }
}

struct ImageDetailView: View {
    @Environment(AuthViewModel.self) private var authViewModel
    @State private var viewModel: ImageDetailViewModel
    @State private var zoom: CGFloat = 1.0
    @State private var lastZoom: CGFloat = 1.0
    @State private var imageOffset: CGSize = .zero
    @State private var lastImageOffset: CGSize = .zero
    @State private var imageVariant: ImageVariant = .processed

    /// Pet owners see the plain-language summary and no per-analyte detail;
    /// clinical roles see the full clinical view. Correction stays for both.
    private var ownerView: Bool {
        !(authViewModel.currentUser?.isClinical ?? false)
    }

    init(imageId: Int, initialImage: TestImage? = nil) {
        _viewModel = State(initialValue: ImageDetailViewModel(imageId: imageId, initialImage: initialImage))
    }

    var body: some View {
        Group {
            if let image = viewModel.testImage {
                ScrollView {
                    VStack(spacing: 20) {
                        imageSection(image)
                        if let error = viewModel.detailError {
                            loadErrorSection(error)
                        }
                        if !image.warnings.isEmpty {
                            warningsSection(image.warnings)
                        }
                        resultSection(image)
                        correctionSection(image)
                        patientInfoSection(image)
                        metadataSection(image)
                    }
                    .padding()
                }
            } else if viewModel.isLoadingDetails {
                ProgressView("Loading image details...")
            } else if let error = viewModel.detailError {
                ContentUnavailableView("Error", systemImage: "exclamationmark.triangle", description: Text(error))
            } else {
                ContentUnavailableView("Image Not Available", systemImage: "photo", description: Text("This image could not be loaded."))
            }
        }
        .navigationTitle("Image #\(viewModel.imageId)")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.loadDetailsIfNeeded()
        }
        .task(id: imageVariant) {
            resetImageTransform()
            await viewModel.loadImage(original: imageVariant == .original)
        }
        .onDisappear {
            viewModel.stopPolling()
        }
    }

    private func imageSection(_ imageMeta: TestImage) -> some View {
        VStack(spacing: 14) {
            ZStack {
                if let image = viewModel.loadedImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(zoom)
                        .offset(imageOffset)
                        .simultaneousGesture(
                            MagnifyGesture()
                                .onChanged { value in
                                    zoom = min(max(lastZoom * value.magnification, 1.0), 5.0)
                                }
                                .onEnded { value in
                                    zoom = min(max(lastZoom * value.magnification, 1.0), 5.0)
                                    lastZoom = zoom
                                    if zoom == 1.0 {
                                        imageOffset = .zero
                                        lastImageOffset = .zero
                                    }
                                }
                        )
                        .simultaneousGesture(
                            DragGesture()
                                .onChanged { value in
                                    guard zoom > 1.0 else { return }
                                    imageOffset = CGSize(
                                        width: lastImageOffset.width + value.translation.width,
                                        height: lastImageOffset.height + value.translation.height
                                    )
                                }
                                .onEnded { _ in
                                    guard zoom > 1.0 else {
                                        imageOffset = .zero
                                        lastImageOffset = .zero
                                        return
                                    }
                                    lastImageOffset = imageOffset
                                }
                        )
                        .onTapGesture(count: 2) {
                            withAnimation {
                                resetImageTransform()
                            }
                        }
                } else if viewModel.isLoadingImage {
                    ProgressView()
                        .frame(height: 260)
                        .frame(maxWidth: .infinity)
                } else {
                    Image(systemName: "photo")
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                        .frame(height: 260)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 220)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 18))

            if imageMeta.isPreprocessed {
                Picker("Image Version", selection: $imageVariant) {
                    ForEach(ImageVariant.allCases) { variant in
                        Text(variant.title).tag(variant)
                    }
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private func loadErrorSection(_ error: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Image Loading Failed", systemImage: "exclamationmark.triangle.fill")
                .font(.headline)
                .foregroundStyle(.red)
            Text(error)
                .font(.caption)
                .foregroundStyle(.secondary)
            Button("Retry") {
                Task {
                    await viewModel.refreshImage()
                    await viewModel.loadImage(original: imageVariant == .original)
                }
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
    }

    private func warningsSection(_ warnings: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Advisory", systemImage: "exclamationmark.triangle.fill")
                .font(.headline)
                .foregroundStyle(.orange)

            ForEach(warnings, id: \.self) { warning in
                Text(resolveWarning(warning))
                    .font(.subheadline)
                    .foregroundStyle(.primary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
    }

    private func resultSection(_ image: TestImage) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            if ownerView {
                plainResultPanel(image)
            } else {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Classification")
                            .font(.headline)

                        Text(image.finalResult ?? "Pending")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(resultColor(for: image.finalResult ?? "Pending"))
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 8) {
                        statusBadge(image.readingStatus)

                        if image.manualCorrection != nil {
                            capsuleLabel(text: "Corrected", tint: .orange)
                        }
                    }
                }

                if let cvResult = image.cvResult {
                    LabeledContent("CV Result", value: cvResult)
                        .font(.subheadline)
                }

                if let confidence = image.cvConfidence {
                    LabeledContent("Confidence", value: confidence)
                        .font(.subheadline)
                }

                tickBornePanel(image)
            }

            if image.readingStatus == "running" {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Classification running...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Spacer()

                    Button("Cancel", role: .destructive) {
                        Task { await viewModel.cancelReclassification() }
                    }
                    .buttonStyle(.bordered)
                }
            } else {
                Button {
                    Task { await viewModel.reclassify() }
                } label: {
                    Label(
                        classificationButtonLabel(for: image),
                        systemImage: "arrow.clockwise"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }

            if let error = viewModel.classificationError
                ?? (image.readingStatus == "failed" ? image.readingError : nil) {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 18))
    }

    private func correctionSection(_ image: TestImage) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Manual Correction")
                .font(.headline)

            Text("Use this when the visible bands disagree with the CV result.")
                .font(.caption)
                .foregroundStyle(.secondary)

            correctionMenu(for: image)

            if let error = viewModel.correctionError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Button {
                Task { await viewModel.saveCorrection() }
            } label: {
                Label("Save Correction", systemImage: "checkmark.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(viewModel.selectedCorrection.isEmpty || viewModel.isSavingCorrection)

            if image.manualCorrection == nil, image.cvResult != nil {
                Button {
                    Task { await viewModel.approveCVResult() }
                } label: {
                    Label("Approve CV Result", systemImage: "checkmark.seal")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isSavingCorrection)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 18))
    }

    private func correctionMenu(for image: TestImage) -> some View {
        Menu {
            Button("Select...") {
                viewModel.selectedCorrection = ""
            }

            ForEach(correctionOptions(for: image), id: \.self) { category in
                Button {
                    viewModel.selectedCorrection = category
                } label: {
                    if category == viewModel.selectedCorrection {
                        Label(category, systemImage: "checkmark")
                    } else {
                        Text(category)
                    }
                }
            }
        } label: {
            HStack(alignment: .top, spacing: 8) {
                Text(
                    viewModel.selectedCorrection.isEmpty
                        ? "Select..."
                        : viewModel.selectedCorrection
                )
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption)
                    .padding(.top, 3)
            }
            .font(.subheadline)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                Color(.secondarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: 10)
            )
        }
        .buttonStyle(.plain)
        .foregroundStyle(.tint)
        .accessibilityLabel("Correction result")
        .accessibilityValue(
            viewModel.selectedCorrection.isEmpty
                ? "Not selected"
                : viewModel.selectedCorrection
        )
    }

    /// Owner-facing summary: plain language instead of the clinical tags and
    /// the per-analyte panel. The raw category still shows as a footnote
    /// because the correction picker uses the same values.
    private func plainResultPanel(_ image: TestImage) -> some View {
        let workflow = image.diseaseCategory ?? image.patientInfo?.diseaseCategory
        let plain = plainResult(workflow: workflow, result: image.finalResult)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                Text(plain.title)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(plain.tone.color)

                Spacer()

                statusBadge(image.readingStatus)
            }

            Text(plain.summary)
                .font(.subheadline)

            if let final = image.finalResult {
                Text("Result category: \(final)\(image.manualCorrection != nil ? " (reviewed)" : "")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(plain.tone.color.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private func tickBornePanel(_ image: TestImage) -> some View {
        let rows = tickBorneAnalyteRows(image)
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Tick Borne Panel")
                    .font(.subheadline.weight(.semibold))

                ForEach(rows, id: \.0) { row in
                    HStack {
                        Text(row.0)
                            .foregroundStyle(.secondary)
                        Spacer()
                        capsuleLabel(
                            text: row.1,
                            tint: row.1 == "Positive" ? .red : .green
                        )
                    }
                    .font(.subheadline)
                }
            }
            .padding(12)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    @ViewBuilder
    private func patientInfoSection(_ image: TestImage) -> some View {
        if let info = image.patientInfo {
            VStack(alignment: .leading, spacing: 8) {
                Text("Patient Information")
                    .font(.headline)

                LabeledContent("Disease", value: info.diseaseCategory)
                if let species = info.species { LabeledContent("Species", value: species) }
                if let age = info.age { LabeledContent("Age", value: age) }
                if let sex = info.sex { LabeledContent("Sex", value: sex) }
                if let breed = info.breed { LabeledContent("Breed", value: breed) }
                if let preventiveTreatment = info.preventiveTreatment {
                    LabeledContent("Preventive Treatment", value: preventiveTreatment ? "Yes" : "No")
                }
                if let areaCode = info.areaCode { LabeledContent("Area Code", value: areaCode) }
            }
            .font(.subheadline)
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 18))
        }
    }

    private func metadataSection(_ image: TestImage) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Details")
                .font(.headline)

            if let disease = image.diseaseCategory {
                LabeledContent("Disease", value: disease)
            }
            LabeledContent("Filename", value: image.originalFilename)
            LabeledContent("Size", value: formatFileSize(image.fileSize))
            LabeledContent("Preprocessed", value: image.isPreprocessed ? "Yes" : "No")
            LabeledContent("Created", value: image.createdAt.formattedDate)
        }
        .font(.subheadline)
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 18))
    }

    private func tickBorneAnalyteRows(_ image: TestImage) -> [(String, String)] {
        guard let analytes = image.finalResultDetail?.analytes else { return [] }
        return TickBorneResult.analytes.compactMap { analyte in
            guard let value = analytes[analyte.key] else { return nil }
            return (analyte.label, value)
        }
    }

    private func correctionOptions(for image: TestImage) -> [String] {
        let workflow = image.diseaseCategory ?? image.patientInfo?.diseaseCategory
        if workflow == "Tick Borne" {
            return TickBorneResult.correctionOptions
        }
        return ClassificationCategory.allCases.map(\.rawValue)
    }

    private func classificationButtonLabel(for image: TestImage) -> String {
        if image.readingStatus == "failed" {
            return "Retry Classification"
        }
        return image.cvResult == nil ? "Run Classification" : "Re-run Classification"
    }

    private func resetImageTransform() {
        zoom = 1.0
        lastZoom = 1.0
        imageOffset = .zero
        lastImageOffset = .zero
    }

    private func formatFileSize(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / (1024 * 1024))
    }

    private func statusBadge(_ status: String?) -> some View {
        let value = status ?? "idle"
        return Text(statusLabel(value))
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
        case "running":
            return .orange
        case "completed":
            return .green
        case "failed":
            return .red
        default:
            return .gray
        }
    }
}
