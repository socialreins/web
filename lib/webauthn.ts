// brain (webauthn-rs) sends and expects binary WebAuthn fields as unpadded base64url strings.
export const fromBase64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export const toBase64url = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

type Descriptor = { id: string; type: "public-key"; transports?: AuthenticatorTransport[] };
export type CreationOptionsJSON = {
  publicKey: Omit<PublicKeyCredentialCreationOptions, "challenge" | "user" | "excludeCredentials"> & {
    challenge: string;
    user: { id: string; name: string; displayName: string };
    excludeCredentials?: Descriptor[];
  };
};

// Runs the browser's create ceremony with brain's options and returns the credential as brain reads it.
export async function createCredential({ publicKey: pk }: CreationOptionsJSON) {
  const cred = (await navigator.credentials.create({
    publicKey: {
      ...pk,
      challenge: fromBase64url(pk.challenge),
      user: { ...pk.user, id: fromBase64url(pk.user.id) },
      excludeCredentials: pk.excludeCredentials?.map((c) => ({ ...c, id: fromBase64url(c.id) })),
    },
  })) as PublicKeyCredential;
  const res = cred.response as AuthenticatorAttestationResponse;
  return {
    id: cred.id,
    rawId: toBase64url(cred.rawId),
    type: cred.type,
    response: {
      attestationObject: toBase64url(res.attestationObject),
      clientDataJSON: toBase64url(res.clientDataJSON),
      transports: res.getTransports?.(),
    },
    clientExtensionResults: cred.getClientExtensionResults(),
  };
}
