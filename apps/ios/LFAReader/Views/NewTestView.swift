import SwiftUI

private enum NewTestDestination: Hashable {
    case source(DiseaseWorkflow)
    case review(DiseaseWorkflow)
    case success(DiseaseWorkflow)
}

struct NewTestView: View {
    @State private var viewModel = NewTestViewModel()
    @State private var path: [NewTestDestination] = []

    var body: some View {
        NavigationStack(path: $path) {
            workflowList
                .navigationTitle("New Test")
                .navigationDestination(for: NewTestDestination.self) { destination in
                    switch destination {
                    case .source(let workflow):
                        imageSourceView(for: workflow)
                    case .review(let workflow):
                        reviewView(for: workflow)
                    case .success(let workflow):
                        successView(for: workflow)
                    }
                }
                .sheet(isPresented: $viewModel.showCamera) {
                    CameraCaptureView { image in
                        viewModel.handleCapturedImage(image)
                        pushReviewIfNeeded()
                    }
                }
                .sheet(isPresented: $viewModel.showPhotoPicker) {
                    PhotoPickerView(selectionLimit: 1) { images in
                        viewModel.handlePickedImages(images)
                        pushReviewIfNeeded()
                    }
                }
        }
    }

    private var workflowList: some View {
        List {
            Section {
                Text("Choose the disease workflow that matches the cassette you are about to read.")
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 4)
            }

            ForEach(DiseaseWorkflow.groupedByCategory(), id: \.category) { group in
                Section(group.category) {
                    ForEach(group.items) { workflow in
                        NavigationLink(value: NewTestDestination.source(workflow)) {
                            workflowRow(workflow)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func imageSourceView(for workflow: DiseaseWorkflow) -> some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    workflowBadge(workflow)

                    Text("Add a single cassette image for the \(workflow.label) workflow.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 6)
            }

            if viewModel.selectedWorkflowId == workflow.id, let image = viewModel.selectedImage {
                Section("Current Image") {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: .infinity)
                        .frame(height: 210)
                        .clipShape(RoundedRectangle(cornerRadius: 14))

                    Button {
                        path.append(.review(workflow))
                    } label: {
                        Label("Continue to Review", systemImage: "arrow.right.circle.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }

            Section("Add Image") {
                Button {
                    viewModel.showCamera = true
                } label: {
                    settingsStyleRow(
                        title: "Take Photo",
                        subtitle: "Use the device camera for a new capture",
                        symbol: "camera.fill"
                    )
                }
                .buttonStyle(.plain)

                Button {
                    viewModel.showPhotoPicker = true
                } label: {
                    settingsStyleRow(
                        title: "Choose from Library",
                        subtitle: "Use an existing photo from Photos",
                        symbol: "photo.on.rectangle"
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .navigationTitle(workflow.label)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            viewModel.selectWorkflow(workflow.id)
        }
    }

    private func reviewView(for workflow: DiseaseWorkflow) -> some View {
        Form {
            Section("Workflow") {
                workflowBadge(workflow)
            }

            if let image = viewModel.selectedImage {
                Section("Selected Image") {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 260)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }

            PatientInfoFormView(
                workflow: workflow,
                shareInfo: $viewModel.shareInfo,
                age: $viewModel.age,
                sex: $viewModel.sex,
                breed: $viewModel.breed,
                areaCode: $viewModel.areaCode,
                preventiveTreatment: $viewModel.preventiveTreatment
            )

            if let error = viewModel.uploadError {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button {
                    Task {
                        await viewModel.upload()
                        if viewModel.uploadComplete {
                            path.append(.success(workflow))
                        }
                    }
                } label: {
                    Label("Submit Image", systemImage: "arrow.up.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!viewModel.canUpload)

                Button {
                    viewModel.selectedImage = nil
                    viewModel.uploadError = nil
                    if !path.isEmpty {
                        path.removeLast()
                    }
                } label: {
                    Label("Choose Another Image", systemImage: "arrow.uturn.backward")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(viewModel.isUploading)
            }
        }
        .navigationTitle("Review & Submit")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if viewModel.isUploading {
                UploadProgressView(message: "Uploading image...")
            }
        }
    }

    private func successView(for workflow: DiseaseWorkflow) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(.green)

            VStack(spacing: 8) {
                Text("Upload Successful")
                    .font(.title2.bold())

                if let result = viewModel.uploadResult {
                    Text(workflow.label)
                        .font(.subheadline.weight(.semibold))
                    Text("Image ID: \(result.id)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if result.patientInfo != nil {
                        Text("Patient info saved")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            VStack(spacing: 12) {
                if let result = viewModel.uploadResult {
                    NavigationLink {
                        ImageDetailView(imageId: result.id, initialImage: result)
                    } label: {
                        Label("View Result", systemImage: "doc.text.magnifyingglass")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }

                Button {
                    viewModel.reset()
                    path.removeAll()
                } label: {
                    Label("Start Another Test", systemImage: "plus.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .navigationBarBackButtonHidden()
    }

    private func pushReviewIfNeeded() {
        guard let workflow = viewModel.selectedWorkflow else { return }
        guard path.last == .source(workflow) else { return }
        path.append(.review(workflow))
    }

    private func workflowRow(_ workflow: DiseaseWorkflow) -> some View {
        HStack(spacing: 12) {
            Image(systemName: workflowIcon(for: workflow))
                .font(.title3)
                .foregroundStyle(.tint)
                .frame(width: 30)

            VStack(alignment: .leading, spacing: 4) {
                Text(workflow.label)
                    .font(.headline)
                Text(workflow.species.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }

    private func workflowBadge(_ workflow: DiseaseWorkflow) -> some View {
        HStack(spacing: 8) {
            Text(workflow.label)
                .font(.subheadline.weight(.semibold))
            Text(workflow.species.displayName)
                .font(.caption)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color(.systemGray5), in: Capsule())
                .foregroundStyle(.secondary)
        }
    }

    private func settingsStyleRow(title: String, subtitle: String, symbol: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(.tint)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }

    private func workflowIcon(for workflow: DiseaseWorkflow) -> String {
        switch workflow.id {
        case "fiv_felv":
            return "cross.case.fill"
        case "tick_borne":
            return "pawprint.fill"
        case "canine_urothelial_carcinoma":
            return "drop.fill"
        default:
            return "testtube.2"
        }
    }
}

#Preview {
    NewTestView()
}
