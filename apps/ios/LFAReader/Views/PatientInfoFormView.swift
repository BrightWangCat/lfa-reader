import SwiftUI

/// Reusable form section for entering optional patient metadata. The owner
/// experience uses plain wording and folds the secondary fields away (D6:
/// same field set, all optional, secondary fields collapsed).
struct PatientInfoFormView: View {
    let workflow: DiseaseWorkflow?
    var ownerExperience: Bool = false
    @Binding var shareInfo: Bool?
    @Binding var age: String
    @Binding var sex: String
    @Binding var breed: String
    @Binding var areaCode: String
    @Binding var preventiveTreatment: Bool?

    @State private var showSecondaryFields = false

    var body: some View {
        Section(ownerExperience ? "About Your Pet" : "Patient Information") {
            VStack(alignment: .leading, spacing: 10) {
                Text(
                    ownerExperience
                        ? "Would you like to add a few optional details? This helps track disease activity in your area."
                        : "Would you like to share confidential patient information?"
                )
                .font(.subheadline)

                Picker("Share patient information", selection: $shareInfo) {
                    Text("Yes").tag(true as Bool?)
                    Text("No").tag(false as Bool?)
                }
                .pickerStyle(.segmented)

                if shareInfo == nil {
                    Text("Select Yes or No before submitting.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 2)

            if shareInfo == true {
                if let workflow {
                    if workflow.needsPreventiveTreatment {
                        Picker(
                            ownerExperience
                                ? "Tick or heartworm preventive in the last 6 months?"
                                : "Preventive Treatment in Last 6 Months",
                            selection: $preventiveTreatment
                        ) {
                            Text("Select").tag(nil as Bool?)
                            Text("Yes").tag(true as Bool?)
                            Text("No").tag(false as Bool?)
                        }
                        .pickerStyle(.menu)
                    }

                    TextField(
                        ownerExperience ? "ZIP code, for the community map" : "Area Code",
                        text: $areaCode
                    )
                    .keyboardType(.numberPad)
                    .textContentType(.postalCode)

                    if ownerExperience {
                        DisclosureGroup(
                            "More details (optional)",
                            isExpanded: $showSecondaryFields
                        ) {
                            secondaryFields(workflow)
                        }
                    } else {
                        secondaryFields(workflow)
                    }
                } else {
                    Text("Choose a disease workflow before entering patient information.")
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private func secondaryFields(_ workflow: DiseaseWorkflow) -> some View {
        LabeledContent("Species", value: workflow.species.displayName)

        Picker("Age", selection: $age) {
            Text("Not specified").tag("")
            ForEach(ageOptionsBySpecies[workflow.species] ?? [], id: \.self) { option in
                Text(option).tag(option)
            }
        }
        .pickerStyle(.menu)

        Picker("Sex", selection: $sex) {
            Text("Not specified").tag("")
            ForEach(PatientSexOption.allCases) { option in
                Text(option.displayName).tag(option.rawValue)
            }
        }
        .pickerStyle(.menu)

        Picker("Breed", selection: $breed) {
            Text("Not specified").tag("")
            ForEach(breedOptionsBySpecies[workflow.species] ?? [], id: \.self) { option in
                Text(option).tag(option)
            }
        }
        .pickerStyle(.menu)
    }
}
