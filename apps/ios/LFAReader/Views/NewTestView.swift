import SwiftUI

struct NewTestView: View {
    @State private var viewModel = NewTestViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.uploadComplete {
                    successView
                } else if viewModel.selectedImage != nil {
                    reviewView
                } else {
                    sourceSelectionView
                }
            }
            .navigationTitle("New Test")
            .sheet(isPresented: $viewModel.showCamera) {
                CameraCaptureView { image in
                    viewModel.handleCapturedImage(image)
                }
            }
            .sheet(isPresented: $viewModel.showPhotoPicker) {
                PhotoPickerView(selectionLimit: 1) { images in
                    viewModel.handlePickedImages(images)
                }
            }
        }
    }

    // MARK: - Step 1: Workflow + Image Source

    private var sourceSelectionView: some View {
        Form {
            workflowSections
            imageSelectionSection
        }
    }

    // MARK: - Step 2: Review & Patient Info

    private var reviewView: some View {
        Form {
            if let workflow = viewModel.selectedWorkflow {
                Section("Workflow") {
                    workflowPill(workflow)
                }
            }

            if let image = viewModel.selectedImage {
                Section("Image Preview") {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 250)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }

            PatientInfoFormView(
                workflow: viewModel.selectedWorkflow,
                shareInfo: $viewModel.shareInfo,
                age: $viewModel.age,
                sex: $viewModel.sex,
                breed: $viewModel.breed,
                areaCode: $viewModel.areaCode,
                preventiveTreatment: $viewModel.preventiveTreatment
            )

            if let error = viewModel.uploadError {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button {
                    Task { await viewModel.upload() }
                } label: {
                    Label("Upload", systemImage: "arrow.up.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!viewModel.canUpload)

                Button("Retake / Re-select", role: .destructive) {
                    viewModel.selectedImage = nil
                    viewModel.uploadError = nil
                }
                .disabled(viewModel.isUploading)
            }
        }
        .overlay {
            if viewModel.isUploading {
                UploadProgressView(message: "Uploading image...")
            }
        }
    }

    // MARK: - Step 3: Success

    private var successView: some View {
        VStack(spacing: 20) {
            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(.green)

            Text("Upload Successful")
                .font(.title2.bold())

            if let result = viewModel.uploadResult {
                VStack(spacing: 4) {
                    if let workflow = viewModel.selectedWorkflow {
                        Text(workflow.label)
                    }
                    Text("Image ID: \(result.id)")
                    if result.patientInfo != nil {
                        Text("Patient info saved")
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
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
                } label: {
                    Label("New Test", systemImage: "plus.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
    }

    private var workflowSections: some View {
        ForEach(DiseaseWorkflow.groupedByCategory(), id: \.category) { group in
            Section(group.category) {
                ForEach(group.items) { workflow in
                    Button {
                        viewModel.selectWorkflow(workflow.id)
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(workflow.label)
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Text(workflow.species.displayName)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Image(systemName: viewModel.selectedWorkflowId == workflow.id ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(viewModel.selectedWorkflowId == workflow.id ? Color.accentColor : Color.secondary.opacity(0.4))
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var imageSelectionSection: some View {
        Section("Image") {
            if let workflow = viewModel.selectedWorkflow {
                workflowPill(workflow)
            } else {
                Text("Choose a disease workflow before capturing or selecting an image.")
                    .foregroundStyle(.secondary)
            }

            Button {
                viewModel.showCamera = true
            } label: {
                Label("Take Photo", systemImage: "camera.fill")
            }
            .disabled(viewModel.selectedWorkflow == nil)

            Button {
                viewModel.showPhotoPicker = true
            } label: {
                Label("Choose from Library", systemImage: "photo.on.rectangle")
            }
            .disabled(viewModel.selectedWorkflow == nil)
        }
    }

    private func workflowPill(_ workflow: DiseaseWorkflow) -> some View {
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
}

#Preview {
    NewTestView()
}
