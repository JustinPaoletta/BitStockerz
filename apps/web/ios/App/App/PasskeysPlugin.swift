import AuthenticationServices
import Capacitor

// Keep this bridge limited to the relying party compiled into this app.
@objc(BitStockerzPasskeysPlugin)
public class BitStockerzPasskeysPlugin: CAPPlugin, CAPBridgedPlugin,
    ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "BitStockerzPasskeysPlugin"
    public let jsName = "BitStockerzPasskeys"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "register", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareText", returnType: CAPPluginReturnPromise)
    ]
    @objc func shareText(_ call: CAPPluginCall) {
        guard let filename = call.getString("filename"),
              filename.range(of: "^[A-Za-z0-9_-]{1,100}\\.(csv|json)$", options: .regularExpression) != nil,
              let contents = call.getString("contents"), contents.utf8.count <= 10_000_000 else {
            call.reject("Invalid export file.", "INVALID_EXPORT"); return
        }
        DispatchQueue.main.async {
            guard let viewController = self.bridge?.viewController,
                  viewController.presentedViewController == nil else {
                call.reject("Close the current dialog before exporting.", "BUSY"); return
            }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let file = directory.appendingPathComponent(filename)
                try contents.write(to: file, atomically: true, encoding: .utf8)
                let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = viewController.view
                sheet.popoverPresentationController?.sourceRect = CGRect(x: viewController.view.bounds.midX, y: viewController.view.bounds.midY, width: 1, height: 1)
                sheet.completionWithItemsHandler = { _, _, _, error in
                    try? FileManager.default.removeItem(at: directory)
                    if error != nil { call.reject("Unable to export this file.", "EXPORT_FAILED") }
                    else { call.resolve() }
                }
                viewController.present(sheet, animated: true)
            } catch {
                try? FileManager.default.removeItem(at: directory)
                call.reject("Unable to prepare this export.", "EXPORT_FAILED")
            }
        }
    }

    private var pending: CAPPluginCall?
    private var controller: ASAuthorizationController?
    private var anchor: ASPresentationAnchor?

    @objc func register(_ call: CAPPluginCall) { begin(call, registration: true) }
    @objc func authenticate(_ call: CAPPluginCall) { begin(call, registration: false) }

    private func begin(_ call: CAPPluginCall, registration: Bool) {
        DispatchQueue.main.async {
            guard #available(iOS 16.0, *) else {
                call.reject("Passkeys require iOS 16 or later.", "UNAVAILABLE"); return
            }
            guard self.pending == nil else {
                call.reject("Finish the current passkey request first.", "BUSY"); return
            }
            guard let options = call.getObject("options"),
                  let challengeText = options["challenge"] as? String,
                  let challenge = Data(base64URL: challengeText), !challenge.isEmpty else {
                call.reject("Invalid passkey challenge.", "INVALID_OPTIONS"); return
            }
            let rp = registration ? (options["rp"] as? [String: Any])?["id"] as? String : options["rpId"] as? String
            guard let rp, rp != "passkeys.invalid", rp != "localhost",
                  rp == Bundle.main.object(forInfoDictionaryKey: "PasskeyRelyingParty") as? String else {
                call.reject("Configure a passkey domain and its Apple association file before testing Face ID sign-in. See IOS_PROTOTYPE.md.", "DOMAIN_NOT_CONFIGURED"); return
            }
            guard let window = self.bridge?.viewController?.view.window else {
                call.reject("Open the app before signing in.", "NO_WINDOW"); return
            }
            let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rp)
            let request: ASAuthorizationRequest
            if registration {
                guard let user = options["user"] as? [String: Any],
                      let idText = user["id"] as? String, let id = Data(base64URL: idText),
                      let name = user["name"] as? String else {
                    call.reject("Invalid passkey user.", "INVALID_OPTIONS"); return
                }
                let creation = provider.createCredentialRegistrationRequest(challenge: challenge, name: name, userID: id)
                creation.userVerificationPreference = .required
                request = creation
            } else {
                let assertion = provider.createCredentialAssertionRequest(challenge: challenge)
                assertion.userVerificationPreference = .required
                let descriptors = options["allowCredentials"] as? [[String: Any]] ?? []
                assertion.allowedCredentials = descriptors.compactMap { descriptor in
                    guard let text = descriptor["id"] as? String, let id = Data(base64URL: text) else { return nil }
                    return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: id)
                }
                guard descriptors.count == assertion.allowedCredentials.count else {
                    call.reject("Invalid credential list.", "INVALID_OPTIONS"); return
                }
                request = assertion
            }
            self.pending = call
            self.anchor = window
            let controller = ASAuthorizationController(authorizationRequests: [request])
            self.controller = controller
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return anchor!
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pending else { return }
        defer { finish() }
        if let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration {
            guard let attestation = credential.rawAttestationObject else {
                call.reject("The authenticator returned no attestation.", "INVALID_RESPONSE"); return
            }
            call.resolve([
                "id": credential.credentialID.base64URL, "rawId": credential.credentialID.base64URL,
                "type": "public-key", "authenticatorAttachment": "platform",
                "clientExtensionResults": [:],
                "response": ["clientDataJSON": credential.rawClientDataJSON.base64URL,
                             "attestationObject": attestation.base64URL, "transports": ["internal"]]
            ])
        } else if let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion {
            call.resolve([
                "id": credential.credentialID.base64URL, "rawId": credential.credentialID.base64URL,
                "type": "public-key", "authenticatorAttachment": "platform",
                "clientExtensionResults": [:],
                "response": ["clientDataJSON": credential.rawClientDataJSON.base64URL,
                             "authenticatorData": credential.rawAuthenticatorData.base64URL,
                             "signature": credential.signature.base64URL,
                             "userHandle": credential.userID.base64URL]
            ])
        } else {
            call.reject("Unsupported passkey response.", "INVALID_RESPONSE")
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        pending?.reject(cancelled ? "Sign-in was cancelled. You can try again." :
            "Passkey sign-in failed. Check the app's associated domain, iCloud Keychain, and server configuration.",
            cancelled ? "CANCELLED" : "AUTHORIZATION_FAILED")
        finish()
    }
    private func finish() { pending = nil; controller = nil; anchor = nil }
}

private extension Data {
    init?(base64URL text: String) {
        let base64 = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        self.init(base64Encoded: base64 + String(repeating: "=", count: (4 - base64.count % 4) % 4))
    }
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

class ResearchBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(BitStockerzPasskeysPlugin())
    }
}
