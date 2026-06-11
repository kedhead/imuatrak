import Foundation
import FirebaseCore
import FirebaseAuth
import AuthenticationServices
import CryptoKit

// ── AuthManager.swift ─────────────────────────────────────────────────────────
// Single source of truth for Firebase auth on the watch. Two ways in:
//
//  1. Inherit-from-phone: the phone mints a Firebase custom token (issueWatchToken
//     Cloud Function) and sends it over WatchConnectivity; we sign in with it.
//  2. Native Sign in with Apple on the watch (watchOS 9+): ASAuthorizationController
//     → Apple identity token → mobileAppleSignIn Cloud Function → custom token.
//
// After either path, FirebaseAuth persists a refresh token in the watch keychain
// and refreshes ID tokens itself — so the watch syncs directly to Firestore over
// cellular with no phone present.

@MainActor
final class AuthManager: NSObject, ObservableObject {
    static let shared = AuthManager()

    @Published var uid: String?
    @Published var isSigningIn = false

    private var currentNonce: String?

    override init() {
        super.init()
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        uid = Auth.auth().currentUser?.uid
        Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in self?.uid = user?.uid }
        }
    }

    var isSignedIn: Bool { uid != nil }

    // ── Path 1: custom token handed over from the phone ─────────────────────────

    func signIn(withCustomToken token: String) async {
        do {
            try await Auth.auth().signIn(withCustomToken: token)
        } catch {
            print("[AuthManager] custom-token sign-in failed: \(error)")
        }
    }

    // ── Path 2: native Sign in with Apple on the watch ──────────────────────────

    func startSignInWithApple() {
        let nonce = Self.randomNonce()
        currentNonce = nonce
        isSigningIn = true

        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    /// Exchange an Apple identity token for a Firebase custom token via the same
    /// mobileAppleSignIn Cloud Function the phone uses, then sign in.
    private func exchangeAppleToken(_ idToken: String) async {
        defer { isSigningIn = false }
        do {
            let url = FunctionsConfig.url(for: "mobileAppleSignIn")
            var request = URLRequest(url: url, timeoutInterval: 10)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["data": ["idToken": idToken]])

            let (data, _) = try await URLSession.shared.data(for: request)
            struct Resp: Codable { struct R: Codable { let customToken: String }; let result: R }
            let resp = try JSONDecoder().decode(Resp.self, from: data)
            await signIn(withCustomToken: resp.result.customToken)
        } catch {
            print("[AuthManager] Apple token exchange failed: \(error)")
        }
    }

    // ── Nonce helpers (mirror src/services/auth.ts) ─────────────────────────────

    private static func randomNonce(_ length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var random: UInt8 = 0
            _ = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
            if random < charset.count {
                result.append(charset[Int(random)])
                remaining -= 1
            }
        }
        return result
    }

    private static func sha256(_ input: String) -> String {
        let hashed = SHA256.hash(data: Data(input.utf8))
        return hashed.map { String(format: "%02x", $0) }.joined()
    }
}

// ── ASAuthorizationControllerDelegate ─────────────────────────────────────────

extension AuthManager: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(controller: ASAuthorizationController,
                                             didCompleteWithAuthorization authorization: ASAuthorization) {
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let idToken = String(data: tokenData, encoding: .utf8)
        else {
            Task { @MainActor in self.isSigningIn = false }
            return
        }
        Task { @MainActor in await self.exchangeAppleToken(idToken) }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController,
                                             didCompleteWithError error: Error) {
        print("[AuthManager] Sign in with Apple failed: \(error)")
        Task { @MainActor in self.isSigningIn = false }
    }
}

extension AuthManager: ASAuthorizationControllerPresentationContextProviding {
    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        ASPresentationAnchor()
    }
}
