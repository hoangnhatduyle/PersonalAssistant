/** Thrown when a provider rejects a refresh token as revoked/expired (Google's invalid_grant, Microsoft's invalid_grant/AADSTS700082 family) — distinguishes "user must reconnect" from a generic API failure. */
export class MailReauthRequiredError extends Error {
  constructor(provider: string) {
    super(`${provider} refresh token is no longer valid — reconnection required`);
    this.name = "MailReauthRequiredError";
  }
}
