import SwiftUI

struct RootView: View {
    @EnvironmentObject var auth: AuthService

    var body: some View {
        if auth.isSignedIn {
            HomeView()
        } else {
            OnboardingView()
        }
    }
}
