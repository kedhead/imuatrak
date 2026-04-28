import Foundation
import HealthKit

@MainActor
final class HealthKitService {
    private let store = HKHealthStore()

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestAuthorization() async throws {
        guard isAvailable else { return }
        let toShare: Set<HKSampleType> = [.workoutType()]
        let toRead: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .distanceSwimming)!, // closest paddle proxy
        ]
        try await store.requestAuthorization(toShare: toShare, read: toRead)
    }

    func writePaddlingWorkout(start: Date, end: Date, distanceMeters: Double, calories: Double) async throws {
        guard isAvailable else { return }
        let config = HKWorkoutConfiguration()
        config.activityType = .paddleSports
        let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: nil)
        try await builder.beginCollection(at: start)

        if distanceMeters > 0 {
            let dist = HKQuantity(unit: .meter(), doubleValue: distanceMeters)
            let distSample = HKQuantitySample(
                type: HKQuantityType(.distanceSwimming),
                quantity: dist,
                start: start,
                end: end
            )
            try await builder.addSamples([distSample])
        }
        if calories > 0 {
            let kcal = HKQuantity(unit: .kilocalorie(), doubleValue: calories)
            let calSample = HKQuantitySample(
                type: HKQuantityType(.activeEnergyBurned),
                quantity: kcal,
                start: start,
                end: end
            )
            try await builder.addSamples([calSample])
        }
        try await builder.endCollection(at: end)
        _ = try await builder.finishWorkout()
    }
}
