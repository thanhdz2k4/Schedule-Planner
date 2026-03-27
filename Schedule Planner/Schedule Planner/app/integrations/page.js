"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import AppShell from "@/components/AppShell";
import { loadAuthSession } from "@/lib/authClient";
import { usePlannerData } from "@/hooks/usePlannerData";
import gmailIcon from "@/images/gmail.png";
import telegramIcon from "@/images/telegram.png";

const INTEGRATIONS = [
  {
    id: "gmail",
    name: "Gmail",
    group: "Communication",
    description: "Send reminder emails before task start.",
    iconType: "image",
    iconImage: gmailIcon,
    connectable: true,
    supportsTestSend: true,
  },
  {
    id: "telegram",
    name: "Telegram",
    group: "Communication",
    description: "Send instant reminder messages to Telegram chat.",
    iconType: "image",
    iconImage: telegramIcon,
    connectable: true,
    supportsTestSend: true,
  },
  {
    id: "slack",
    name: "Slack",
    group: "Communication",
    description: "Send reminders to Slack channels and DMs.",
    iconType: "text",
    iconText: "S",
    connectable: false,
    supportsTestSend: false,
  },
  {
    id: "notion",
    name: "Notion",
    group: "Productivity",
    description: "Create pages for weekly plan and summaries.",
    iconType: "text",
    iconText: "N",
    connectable: false,
    supportsTestSend: false,
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    group: "Calendar",
    description: "Sync tasks to Google Calendar events.",
    iconType: "text",
    iconText: "GC",
    connectable: false,
    supportsTestSend: false,
  },
];

function buildAuthHeaders(authToken, contentType = "") {
  const headers = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function toNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function pickFirstNonEmpty(values) {
  for (const item of values) {
    const text = toNonEmptyString(item);
    if (text) {
      return text;
    }
  }

  return "";
}

function extractConnectionIdFromNangoEvent(event) {
  return pickFirstNonEmpty([
    event?.connectionId,
    event?.connection_id,
    event?.payload?.connectionId,
    event?.payload?.connection_id,
    event?.data?.connectionId,
    event?.data?.connection_id,
    event?.response?.connectionId,
    event?.response?.connection_id,
  ]);
}

function extractProviderFromNangoEvent(event) {
  return pickFirstNonEmpty([
    event?.provider,
    event?.providerConfigKey,
    event?.provider_config_key,
    event?.payload?.provider,
    event?.payload?.providerConfigKey,
    event?.payload?.provider_config_key,
    event?.data?.provider,
    event?.data?.providerConfigKey,
    event?.data?.provider_config_key,
  ]);
}

function connectionStatusToLabel(status) {
  if (status === "active") return "Connected";
  if (status === "error") return "Need reconnect";
  if (status === "disconnected") return "Disconnected";
  return "Not connected";
}

function cardStatus(viewModel) {
  if (!viewModel.connectable && !viewModel.connection) {
    return "coming_soon";
  }

  if (!viewModel.connection) {
    return "not_connected";
  }

  if (viewModel.connection.status === "active") {
    return "connected";
  }

  if (viewModel.connection.status === "error") {
    return "error";
  }

  return "disconnected";
}

export default function IntegrationsPage() {
  const { loaded, darkMode, state, actions } = usePlannerData();
  const [authSession, setAuthSession] = useState(null);
  const [connections, setConnections] = useState([]);
  const [channelSettings, setChannelSettings] = useState([]);
  const [destinationDrafts, setDestinationDrafts] = useState({});
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [loadingChannelSettings, setLoadingChannelSettings] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyActionId, setBusyActionId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const nangoRef = useRef(null);

  useEffect(() => {
    setAuthSession(loadAuthSession());
  }, []);

  useEffect(() => {
    let active = true;

    async function loadNangoFrontend() {
      try {
        const module = await import("@nangohq/frontend");
        if (active) {
          nangoRef.current = new module.default();
        }
      } catch (loadError) {
        console.error("Failed to load Nango frontend SDK:", loadError);
      }
    }

    loadNangoFrontend();
    return () => {
      active = false;
    };
  }, []);

  const refreshConnections = useCallback(async () => {
    if (!authSession?.token) {
      setConnections([]);
      return;
    }

    setLoadingConnections(true);
    setError("");

    try {
      const response = await fetch("/api/integrations/connections", {
        cache: "no-store",
        headers: buildAuthHeaders(authSession.token),
      });

      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot load integration connections.");
        return;
      }

      setConnections(Array.isArray(payload?.connections) ? payload.connections : []);
    } catch (requestError) {
      console.error(requestError);
      setError("Cannot connect to server while loading integrations.");
    } finally {
      setLoadingConnections(false);
    }
  }, [authSession?.token]);

  const refreshChannelSettings = useCallback(async () => {
    if (!authSession?.token) {
      setChannelSettings([]);
      return;
    }

    setLoadingChannelSettings(true);

    try {
      const response = await fetch("/api/notification/channels", {
        cache: "no-store",
        headers: buildAuthHeaders(authSession.token),
      });

      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot load channel settings.");
        return;
      }

      setChannelSettings(Array.isArray(payload?.channels) ? payload.channels : []);
    } catch (requestError) {
      console.error(requestError);
      setError("Cannot connect to server while loading channel settings.");
    } finally {
      setLoadingChannelSettings(false);
    }
  }, [authSession?.token]);

  useEffect(() => {
    refreshConnections();
    refreshChannelSettings();
  }, [refreshConnections, refreshChannelSettings]);

  useEffect(() => {
    if (!channelSettings.length) {
      return;
    }

    setDestinationDrafts((previous) => {
      const next = { ...previous };
      for (const setting of channelSettings) {
        next[setting.channel] = setting.destination || "";
      }
      return next;
    });
  }, [channelSettings]);

  const connectionsByIntegrationId = useMemo(() => {
    const map = new Map();
    for (const connection of connections) {
      map.set(connection.integrationId, connection);
    }
    return map;
  }, [connections]);

  const channelSettingsById = useMemo(() => {
    const map = new Map();
    for (const setting of channelSettings) {
      map.set(setting.channel, setting);
    }
    return map;
  }, [channelSettings]);

  const integrationViewModels = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const withConnection = INTEGRATIONS.map((integration) => ({
      ...integration,
      connection: connectionsByIntegrationId.get(integration.id) || null,
      channelSetting: channelSettingsById.get(integration.id) || null,
    }));

    return withConnection.filter((item) => {
      if (keyword) {
        const haystack = `${item.name} ${item.group} ${item.description}`.toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }

      if (statusFilter === "all") {
        return true;
      }

      return cardStatus(item) === statusFilter;
    });
  }, [connectionsByIntegrationId, channelSettingsById, searchText, statusFilter]);

  const statusStats = useMemo(() => {
    const base = { connected: 0, not_connected: 0, error: 0, disconnected: 0, coming_soon: 0 };
    for (const integration of INTEGRATIONS) {
      const row = {
        ...integration,
        connection: connectionsByIntegrationId.get(integration.id) || null,
      };
      const status = cardStatus(row);
      base[status] = (base[status] || 0) + 1;
    }

    return base;
  }, [connectionsByIntegrationId]);

  async function confirmConnectionFromUiEvent({ integrationId, connectionId, provider }) {
    if (!authSession?.token || !connectionId) {
      return;
    }

    const response = await fetch("/api/integrations/connect/confirm", {
      method: "POST",
      headers: buildAuthHeaders(authSession.token, "application/json"),
      body: JSON.stringify({ integrationId, connectionId, provider }),
    });

    if (!response.ok) {
      const payload = await readJsonSafe(response);
      throw new Error(payload?.message || "Cannot confirm integration connection.");
    }
  }

  async function handleConnect(integrationId) {
    if (!authSession?.token) {
      setError("Please login first before connecting integrations.");
      return;
    }

    setBusyActionId(`connect:${integrationId}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/integrations/connect/session", {
        method: "POST",
        headers: buildAuthHeaders(authSession.token, "application/json"),
        body: JSON.stringify({ integrationId }),
      });

      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot create integration connect session.");
        return;
      }

      const sessionToken = toNonEmptyString(payload?.sessionToken);
      if (!sessionToken) {
        setError("Missing connect session token from backend.");
        return;
      }

      if (!nangoRef.current) {
        setError("Nango SDK is not ready yet. Please click again.");
        return;
      }

      const connect = nangoRef.current.openConnectUI({
        onEvent: async (event) => {
          const eventType = pickFirstNonEmpty([event?.type, event?.event, event?.name]).toLowerCase();
          const isConnectEvent =
            eventType === "connect" || eventType === "connected" || eventType === "auth" || eventType.includes("connect");

          if (isConnectEvent) {
            const connectionId = extractConnectionIdFromNangoEvent(event);
            const provider = extractProviderFromNangoEvent(event);

            try {
              if (connectionId) {
                await confirmConnectionFromUiEvent({ integrationId, connectionId, provider });
                setMessage("Connection saved successfully.");
              } else {
                setMessage("Connected in popup. Waiting sync from webhook...");
                window.setTimeout(() => {
                  refreshConnections();
                  refreshChannelSettings();
                }, 2500);
                window.setTimeout(() => {
                  refreshConnections();
                  refreshChannelSettings();
                }, 6000);
              }
            } catch (confirmError) {
              console.error(confirmError);
              setError(confirmError instanceof Error ? confirmError.message : "Cannot confirm connection.");
            } finally {
              refreshConnections();
              refreshChannelSettings();
            }
          }

          if (eventType === "close" || eventType.includes("close")) {
            refreshConnections();
            refreshChannelSettings();
          }
        },
      });

      connect.setSessionToken(sessionToken);
    } catch (connectError) {
      console.error(connectError);
      setError("Unexpected error while opening connect flow.");
    } finally {
      setBusyActionId("");
    }
  }

  async function handleSaveDestination(channelId) {
    if (!authSession?.token) {
      setError("Please login first.");
      return;
    }

    const currentSetting = channelSettingsById.get(channelId);
    const destination = typeof destinationDrafts[channelId] === "string" ? destinationDrafts[channelId].trim() : "";

    setBusyActionId(`save-destination:${channelId}`);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/notification/channels", {
        method: "PUT",
        headers: buildAuthHeaders(authSession.token, "application/json"),
        body: JSON.stringify({
          channels: [
            {
              channel: channelId,
              isEnabled: currentSetting?.isEnabled ?? true,
              priorityOrder: currentSetting?.priorityOrder ?? (channelId === "telegram" ? 1 : 2),
              destination,
            },
          ],
        }),
      });

      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot save destination.");
        return;
      }

      setChannelSettings(Array.isArray(payload?.channels) ? payload.channels : []);
      setMessage(`${channelId} destination saved.`);
    } catch (saveError) {
      console.error(saveError);
      setError("Unexpected error while saving destination.");
    } finally {
      setBusyActionId("");
    }
  }

  async function handleSendTest(integrationId) {
    if (!authSession?.token) {
      setError("Please login first.");
      return;
    }

    setBusyActionId(`test:${integrationId}`);
    setError("");
    setMessage("");

    try {
      const endpoint = integrationId === "telegram" ? "/api/integrations/telegram/test-send" : "/api/integrations/gmail/test-send";
      const body =
        integrationId === "telegram"
          ? JSON.stringify({ chatId: toNonEmptyString(destinationDrafts.telegram) || undefined })
          : JSON.stringify({});

      const response = await fetch(endpoint, {
        method: "POST",
        headers: buildAuthHeaders(authSession.token, "application/json"),
        body,
      });

      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setError(payload?.message || "Cannot send test message.");
        return;
      }

      setMessage(payload?.message || "Test message sent.");
    } catch (sendError) {
      console.error(sendError);
      setError("Unexpected error while sending test message.");
    } finally {
      setBusyActionId("");
    }
  }

  if (!loaded) {
    return null;
  }

  return (
    <AppShell
      title={{ vi: "Tích Hợp", en: "Integrations" }}
      subtitle={{
        vi: "Tìm kiếm, kết nối và quản lý toàn bộ ứng dụng bên ngoài tại một nơi",
        en: "Search, connect, and manage all external apps in one place",
      }}
      quote={{ vi: "Xây một lần, kết nối mọi nơi.", en: "Build once, connect everywhere." }}
      goalProgress={state.goalOverall}
      themeLabel={darkMode ? { vi: "Chế độ sáng", en: "Light mode" } : { vi: "Chế độ tối", en: "Dark mode" }}
      onToggleTheme={actions.toggleTheme}
    >
      <section className="panel">
        <div className="integration-toolbar">
          <input
            type="search"
            placeholder="Search integrations..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <div className="integration-filters" role="tablist" aria-label="Integration status filters">
            <button
              type="button"
              className={statusFilter === "all" ? "active" : ""}
              onClick={() => setStatusFilter("all")}
            >
              All ({INTEGRATIONS.length})
            </button>
            <button
              type="button"
              className={statusFilter === "connected" ? "active" : ""}
              onClick={() => setStatusFilter("connected")}
            >
              Connected ({statusStats.connected})
            </button>
            <button
              type="button"
              className={statusFilter === "not_connected" ? "active" : ""}
              onClick={() => setStatusFilter("not_connected")}
            >
              Not connected ({statusStats.not_connected})
            </button>
            <button
              type="button"
              className={statusFilter === "coming_soon" ? "active" : ""}
              onClick={() => setStatusFilter("coming_soon")}
            >
              Coming soon ({statusStats.coming_soon})
            </button>
          </div>
        </div>

        <div className="integration-cards-grid">
          {integrationViewModels.map((item) => {
            const status = cardStatus(item);
            const isConnected = status === "connected";
            const isConnecting = busyActionId === `connect:${item.id}`;
            const isTesting = busyActionId === `test:${item.id}`;
            const isSavingDestination = busyActionId === `save-destination:${item.id}`;
            const connectDisabled = !authSession?.token || !item.connectable || isConnecting;
            const testDisabled = !authSession?.token || !item.supportsTestSend || isTesting;
            const destinationValue = destinationDrafts[item.id] || "";
            const showDestinationEditor = item.id === "telegram";

            return (
              <article key={item.id} className={`integration-list-card ${status}`}>
                <div className="integration-list-head">
                  <div className="integration-avatar">
                    {item.iconType === "image" ? (
                      <Image src={item.iconImage} alt={`${item.name} icon`} width={34} height={34} />
                    ) : (
                      <span>{item.iconText || item.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <div>
                    <h4>{item.name}</h4>
                    <p className="muted">{item.group}</p>
                  </div>
                </div>

                <p className="integration-desc">{item.description}</p>

                <div className="integration-list-meta">
                  <span className={`badge integration-status-badge status-${status}`}>
                    {isConnecting ? "Opening connect..." : connectionStatusToLabel(item.connection?.status)}
                  </span>
                  {item.channelSetting ? <span className="badge">Priority: {item.channelSetting.priorityOrder}</span> : null}
                  {item.channelSetting ? (
                    <span className="badge">{item.channelSetting.isEnabled ? "Enabled" : "Disabled"}</span>
                  ) : null}
                  {item.connection?.connectionId ? (
                    <span className="badge">ID: {item.connection.connectionId.slice(0, 10)}...</span>
                  ) : null}
                </div>

                {showDestinationEditor ? (
                  <div className="integration-destination-editor">
                    <input
                      type="text"
                      placeholder="Telegram chat id (vd: -1001234567890)"
                      value={destinationValue}
                      onChange={(event) =>
                        setDestinationDrafts((prev) => ({
                          ...prev,
                          [item.id]: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={!authSession?.token || isSavingDestination}
                      onClick={() => handleSaveDestination(item.id)}
                    >
                      {isSavingDestination ? "Saving..." : "Save chat id"}
                    </button>
                  </div>
                ) : null}

                <div className="integration-actions-row">
                  <button
                    type="button"
                    className="btn"
                    disabled={connectDisabled}
                    onClick={() => handleConnect(item.id)}
                  >
                    {item.connectable ? (isConnected ? "Reconnect" : "Connect") : "Coming soon"}
                  </button>

                  {item.supportsTestSend ? (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={testDisabled}
                      onClick={() => handleSendTest(item.id)}
                      title={isConnected ? "Send test now" : "Will show why test send cannot run yet"}
                    >
                      {isTesting
                        ? "Sending..."
                        : item.id === "telegram"
                        ? "Send test message"
                        : "Send test email"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        {loadingConnections || loadingChannelSettings ? <p className="muted">Refreshing integration states...</p> : null}
        {!authSession?.token ? <p className="alert">Please login account first to connect integrations.</p> : null}
        {error ? <p className="alert">{error}</p> : null}
        {!error && message ? <p className="integration-success">{message}</p> : null}
      </section>
    </AppShell>
  );
}
