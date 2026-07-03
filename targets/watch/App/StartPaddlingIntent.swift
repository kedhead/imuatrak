import AppIntents
import Foundation

// ── StartPaddlingIntent.swift ─────────────────────────────────────────────────
// Siri / Shortcuts entry point: "Hey Siri, ImuaTrak" (or a user-named personal
// shortcut, e.g. "Imua") starts a paddling workout on the watch. The optional
// craft parameter lets a shortcut pin a boat (e.g. OC6); when omitted the last
// craft picked in the app is used.

enum CraftChoice: String, AppEnum {
    case oc1 = "OC1"
    case oc2 = "OC2"
    case oc6 = "OC6"
    case v1 = "V1"
    case sup = "SUP"
    case surfski = "SURFSKI"
    case other = "OTHER"

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Craft")
    static var caseDisplayRepresentations: [CraftChoice: DisplayRepresentation] = [
        .oc1: DisplayRepresentation(title: "OC1"),
        .oc2: DisplayRepresentation(title: "OC2"),
        .oc6: DisplayRepresentation(title: "OC6"),
        .v1: DisplayRepresentation(title: "V1"),
        .sup: DisplayRepresentation(title: "SUP"),
        .surfski: DisplayRepresentation(title: "Surfski"),
        .other: DisplayRepresentation(title: "Other"),
    ]
}

struct StartPaddlingIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Paddling"
    static var description = IntentDescription(
        "Starts recording a paddling workout on your Apple Watch."
    )
    // Launch the watch app so the workout UI (and its HealthKit/GPS session)
    // runs in the foreground.
    static var openAppWhenRun = true

    @Parameter(title: "Craft")
    var craft: CraftChoice?

    @MainActor
    func perform() async throws -> some IntentResult {
        let workoutManager = WorkoutManager.shared
        guard !workoutManager.isRecording else { return .result() }
        if let craft {
            workoutManager.currentCraft = craft.rawValue
        }
        await workoutManager.start()
        return .result()
    }
}

struct ImuaTrakShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartPaddlingIntent(),
            phrases: [
                "\(.applicationName)",
                "Start \(.applicationName)",
                "Start paddling with \(.applicationName)",
                "Start a \(.applicationName) workout",
            ],
            shortTitle: "Start Paddling",
            systemImageName: "play.circle.fill"
        )
    }
}
