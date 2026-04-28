import AuthenticationServices
import CryptoKit
import FirebaseAuth
import Foundation

@MainActor
final class AuthService: NSObject, ObservableObject {
    @Published private(set) var user: User?
    private var currentNonce: String?

    override init() {
        super.init()
        user = Auth.auth().currentUser
        Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in self?.user = user }
        }
    }

    var isSignedIn: Bool { user != nil }

    func signOut() {
        try? Auth.auth().signOut()
    }

    /// Configure an "Sign in with Apple" request with a nonce we'll verify.
    func configure(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = Self.randomNonceString()
        currentNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(nonce)
    }

    /// Complete sign-in by exchanging the Apple credential for a Firebase one.
    func handle(_ result: Result<ASAuthorization, Error>) async throws {
        switch result {
        case .failure(let err): throw err
        case .success(let auth):
            guard
                let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                let token = cred.identityToken,
                let tokenStr = String(data: token, encoding: .utf8),
                let nonce = currentNonce
            else { throw AuthError.invalidCredential }

            let firebaseCred = OAuthProvider.appleCredential(
                withIDToken: tokenStr,
                rawNonce: nonce,
                fullName: cred.fullName
            )
            _ = try await Auth.auth().signIn(with: firebaseCred)
            currentNonce = nil
        }
    }

    enum AuthError: Error { case invalidCredential }

    // MARK: - Nonce helpers

    private static func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
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
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
