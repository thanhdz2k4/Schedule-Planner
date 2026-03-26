const GMAIL_PUBLIC_ID = "gmail";

function readGmailProviderConfigKey() {
  const raw = process.env.NANGO_INTEGRATION_GMAIL;
  if (typeof raw !== "string") {
    return "";
  }

  const trimmed = raw.trim();
  return trimmed;
}

export const SUPPORTED_INTEGRATIONS = [
  {
    id: GMAIL_PUBLIC_ID,
    label: "Gmail",
    provider: "google-mail",
  },
];

const SUPPORTED_INTEGRATION_IDS = new Set(SUPPORTED_INTEGRATIONS.map((integration) => integration.id));

export function isSupportedIntegrationId(value) {
  return typeof value === "string" && SUPPORTED_INTEGRATION_IDS.has(value.trim());
}

export function resolveProviderConfigKey(publicIntegrationId) {
  if (!isSupportedIntegrationId(publicIntegrationId)) {
    return "";
  }

  if (publicIntegrationId.trim() === GMAIL_PUBLIC_ID) {
    return readGmailProviderConfigKey();
  }

  return "";
}

export function resolvePublicIntegrationIdByProviderConfigKey(providerConfigKey) {
  if (typeof providerConfigKey !== "string") {
    return "";
  }

  const trimmed = providerConfigKey.trim();
  if (!trimmed) {
    return "";
  }

  const gmailProviderConfigKey = readGmailProviderConfigKey();
  if (trimmed === gmailProviderConfigKey || trimmed === GMAIL_PUBLIC_ID) {
    return GMAIL_PUBLIC_ID;
  }

  return "";
}
