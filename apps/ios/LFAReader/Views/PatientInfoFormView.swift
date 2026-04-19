import SwiftUI

/// Reusable form section for entering optional patient metadata.
struct PatientInfoFormView: View {
    let workflow: DiseaseWorkflow?
    @Binding var shareInfo: Bool
    @Binding var age: String
    @Binding var sex: String
    @Binding var breed: String
    @Binding var areaCode: String
    @Binding var preventiveTreatment: Bool?

    var body: some View {
        Section("Patient Information") {
            Toggle("Share patient info", isOn: $shareInfo)

            if shareInfo {
                if let workflow {
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

                    if workflow.needsPreventiveTreatment {
                        Picker("Preventive Treatment in Last 6 Months", selection: $preventiveTreatment) {
                            Text("Select").tag(nil as Bool?)
                            Text("Yes").tag(true as Bool?)
                            Text("No").tag(false as Bool?)
                        }
                        .pickerStyle(.menu)
                    }

                    TextField("Area Code", text: $areaCode)
                        .keyboardType(.numberPad)
                        .textContentType(.postalCode)
                } else {
                    Text("Choose a disease workflow before entering patient information.")
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
