import SwiftUI
import PaddleupShared

struct SettingsView: View {
    @EnvironmentObject var auth: AuthService
    @AppStorage("units") private var units: String = "metric"
    @AppStorage("defaultCraft") private var defaultCraft: String = CraftType.OC1.rawValue

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    if let email = auth.user?.email {
                        Text(email).foregroundStyle(.secondary)
                    }
                    Button("Sign out", role: .destructive) { auth.signOut() }
                }
                Section("Units") {
                    Picker("Distance", selection: $units) {
                        Text("Metric (km)").tag("metric")
                        Text("Imperial (mi)").tag("imperial")
                    }
                }
                Section("Craft") {
                    Picker("Default", selection: $defaultCraft) {
                        ForEach(CraftType.allCases, id: \.rawValue) { t in
                            Text(t.rawValue).tag(t.rawValue)
                        }
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}
