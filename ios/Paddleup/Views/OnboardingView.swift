import AuthenticationServices
import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var auth: AuthService

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Text("Paddleup")
                .font(.largeTitle.bold())
            Text("Track your outrigger sessions — distance, pace, stroke rate, and more.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 32)
            Spacer()
            SignInWithAppleButton(.signIn,
                onRequest: auth.configure,
                onCompletion: { result in
                    Task { try? await auth.handle(result) }
                })
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)
                .padding(.horizontal, 32)
                .padding(.bottom, 32)
        }
    }
}
