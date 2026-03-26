const INTEGRATION_CONFIG = {
  gmail: {
    id: "gmail",
    label: "Gmail",
    provider: "google-mail",
    envVarName: "NANGO_INTEGRATION_GMAIL",
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    provider: "telegram",
    envVarName: "NANGO_INTEGRATION_TELEGRAM",
  },
};

export const SUPPORTED_INTEGRATIONS = Object.values(INTEGRATION_CONFIG).map((item) => ({
  id: item.id,
  label: item.label,
  provider: item.provider,
}));

const SUPPORTED_INTEGRATION_IDS = new Set(Object.keys(INTEGRATION_CONFIG));

function readTrimmedEnv(name) {
  const raw = process.env[name];
  if (typeof raw !== "string") {
    return "";
  }

  return raw.trim();
}

export function isSupportedIntegrationId(value) {
  return typeof value === "string" && SUPPORTED_INTEGRATION_IDS.has(value.trim());
}

export function getIntegrationEnvVarName(publicIntegrationId) {
  if (!isSupportedIntegrationId(publicIntegrationId)) {
    return "";
  }

  return INTEGRATION_CONFIG[publicIntegrationId.trim()].envVarName;
}

export function resolveProviderConfigKey(publicIntegrationId) {
  if (!isSupportedIntegrationId(publicIntegrationId)) {
    return "";
  }

  const integration = INTEGRATION_CONFIG[publicIntegrationId.trim()];
  return readTrimmedEnv(integration.envVarName);
}

export function resolvePublicIntegrationIdByProviderConfigKey(providerConfigKey) {
  if (typeof providerConfigKey !== "string") {
    return "";
  }

  const trimmed = providerConfigKey.trim();
  if (!trimmed) {
    return "";
  }

  for (const integration of Object.values(INTEGRATION_CONFIG)) {
    const providerConfig = readTrimmedEnv(integration.envVarName);
    if (trimmed === providerConfig || trimmed === integration.id) {
      return integration.id;
    }
  }

  return "";
}
