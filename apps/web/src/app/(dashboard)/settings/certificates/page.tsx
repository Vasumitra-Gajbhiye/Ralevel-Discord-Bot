"use client";

import { useMemo, useState } from "react";
import { ChannelIdPicker } from "@/components/ChannelIdPicker";
import { InfoHelpIcon } from "@/components/InfoHelpIcon";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { RolePicker } from "@/components/RolePicker";
import {
  useGuildConfig,
  type GuildConfigData,
} from "@/lib/useGuildConfig";

type CertificatesConfig = GuildConfigData["certificates"];
type PanelButton = CertificatesConfig["panel"]["buttons"][number];

const CERT_TYPE_ID_PATTERN = /^[a-z0-9_-]+$/;
const KNOWN_CERT_TYPE_IDS = ["helper", "writer", "resource", "graphic"] as const;

const CERT_TYPE_HELP =
  "Lowercase only. No spaces. Dashes and underscores are allowed (e.g. helper, resource).";

function defaultPanel(): CertificatesConfig["panel"] {
  return {
    channelId: "",
    panelMessageId: null,
    title: "📄 Certificate Application",
    description: "",
    color: "#2CDAF2",
    footer: "Only one pending application per certificate is permitted.",
    showTimestamp: true,
    buttons: [],
  };
}

function normalizeCertificates(
  certs: CertificatesConfig | undefined,
): CertificatesConfig | null {
  if (!certs) return null;
  return {
    ...certs,
    panel: {
      ...defaultPanel(),
      ...certs.panel,
      buttons: Array.isArray(certs.panel?.buttons) ? certs.panel.buttons : [],
    },
  };
}

function channelLabelForId(
  channelId: string,
  channels: GuildConfigData["channels"],
) {
  const match = channels.find((channel) => channel.channelId === channelId);
  return match?.label || match?.key || channelId;
}

function validateCertificates(certs: CertificatesConfig): string | null {
  const panel = certs.panel;
  if (!panel.channelId.trim()) {
    return "Select a panel channel before saving.";
  }
  if (!panel.title.trim()) {
    return "Panel title is required.";
  }
  if (panel.buttons.length > 25) {
    return "A maximum of 25 apply buttons is allowed.";
  }

  const usedTypeIds = new Set<string>();
  for (const button of panel.buttons) {
    if (!button.label.trim()) {
      return "Every apply button needs a label.";
    }
    if (!button.certTypeId) {
      return "Every apply button must have a certificate type.";
    }
    if (!CERT_TYPE_ID_PATTERN.test(button.certTypeId)) {
      return `Certificate type "${button.certTypeId}" is invalid. Use lowercase letters, numbers, dashes, and underscores only.`;
    }
    if (usedTypeIds.has(button.certTypeId)) {
      return "Each certificate type can only appear on one apply button.";
    }
    usedTypeIds.add(button.certTypeId);
  }

  return null;
}

export default function CertificatesSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<CertificatesConfig | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const savedCerts = useMemo(
    () => normalizeCertificates(config?.certificates),
    [config?.certificates],
  );
  const certs = draft ?? savedCerts;
  const panel = certs?.panel;
  const channels = config?.channels ?? [];
  const roles = config?.roles ?? [];

  const panelChannelSelected = useMemo(() => {
    if (!panel?.channelId) return [];
    return [
      {
        id: panel.channelId,
        label: channelLabelForId(panel.channelId, channels),
      },
    ];
  }, [panel?.channelId, channels]);

  const isDirty = useMemo(
    () =>
      draft !== null && JSON.stringify(draft) !== JSON.stringify(savedCerts),
    [draft, savedCerts],
  );

  function updateCerts(patch: Partial<CertificatesConfig>) {
    if (!certs) return;
    setDraft({ ...certs, ...patch });
  }

  function updatePanel(patch: Partial<CertificatesConfig["panel"]>) {
    if (!certs || !panel) return;
    setDraft({
      ...certs,
      panel: { ...panel, ...patch },
    });
  }

  function updateButton(index: number, patch: Partial<PanelButton>) {
    if (!certs || !panel) return;
    const buttons = [...panel.buttons];
    buttons[index] = { ...buttons[index], ...patch };
    updatePanel({ buttons });
  }

  function moveButton(index: number, direction: -1 | 1) {
    if (!panel) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= panel.buttons.length) return;
    const buttons = [...panel.buttons];
    [buttons[index], buttons[nextIndex]] = [
      buttons[nextIndex],
      buttons[index],
    ];
    updatePanel({ buttons });
  }

  async function onSave() {
    if (!certs) return;
    const validationError = validateCertificates(certs);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    await save({ certificates: certs });
    setDraft(null);
  }

  if (loading || !certs || !panel) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Certificate settings"
        description="Application panel message, apply buttons, and staff mod roles."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {localError ? <p className="status err">{localError}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Application panel</h3>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            The bot posts this embed in the selected channel on restart (or when
            you run <code>/send-cert-msg</code>). Only one panel message is kept
            in the channel.
          </p>

          <div className="field">
            <label>Panel channel</label>
            <ChannelIdPicker
              channels={channels}
              selected={panelChannelSelected}
              maxItems={1}
              emptyLinkLabel="Add channels"
              removeConfirmMessage={(item) =>
                `Remove "${item.label || item.id}" as the panel channel? Changes apply after you save.`
              }
              onChange={(selected) =>
                updatePanel({ channelId: selected[0]?.id ?? "" })
              }
            />
          </div>

          <div className="field">
            <label>Title</label>
            <input
              value={panel.title}
              onChange={(e) => updatePanel({ title: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              className="mono"
              rows={14}
              value={panel.description}
              onChange={(e) => updatePanel({ description: e.target.value })}
            />
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
              Mentions render without pinging. Use{" "}
              <code>&lt;@&amp;ROLE_ID&gt;</code> for roles,{" "}
              <code>&lt;#CHANNEL_ID&gt;</code> for channels, and{" "}
              <code>&lt;@USER_ID&gt;</code> for users.
            </p>
          </div>

          <div className="row">
            <div className="field">
              <label>Color</label>
              <input
                value={panel.color}
                onChange={(e) => updatePanel({ color: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Footer</label>
              <input
                value={panel.footer}
                onChange={(e) => updatePanel({ footer: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Apply buttons</h3>
              <p
                className="muted"
                style={{ fontSize: "0.85rem", margin: "0.35rem 0 0" }}
              >
                Known certificate types (use these exact IDs):{" "}
                {KNOWN_CERT_TYPE_IDS.map((id) => (
                  <code key={id} style={{ marginRight: "0.25rem" }}>
                    {id}
                  </code>
                ))}
              </p>
            </div>
            <button
              type="button"
              className="btn"
              disabled={panel.buttons.length >= 25}
              onClick={() =>
                updatePanel({
                  buttons: [
                    ...panel.buttons,
                    {
                      certTypeId: "",
                      label: "Apply",
                      style: "Primary",
                    },
                  ],
                })
              }
            >
              Add button
            </button>
          </div>

          {panel.buttons.length === 0 ? (
            <p className="muted">No apply buttons configured.</p>
          ) : null}

          {panel.buttons.map((button, i) => (
            <div className="card stack" key={`button-${i}`}>
              <div className="row">
                <div className="field">
                  <label>Label</label>
                  <input
                    value={button.label}
                    onChange={(e) =>
                      updateButton(i, { label: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                    }}
                  >
                    Certificate type
                    <InfoHelpIcon content={CERT_TYPE_HELP} />
                  </label>
                  <input
                    className="mono"
                    value={button.certTypeId}
                    onChange={(e) =>
                      updateButton(i, { certTypeId: e.target.value })
                    }
                    placeholder="helper"
                  />
                </div>
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn"
                  disabled={i === 0}
                  onClick={() => moveButton(i, -1)}
                >
                  Move up
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={i === panel.buttons.length - 1}
                  onClick={() => moveButton(i, 1)}
                >
                  Move down
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    updatePanel({
                      buttons: panel.buttons.filter((_, index) => index !== i),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Staff permissions</h3>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Members with these roles can approve or reject applications from the
            review channel and use mod certificate commands such as{" "}
            <code>/approve-certificate</code>, <code>/reject-certificate</code>,{" "}
            <code>/submit-cert-details</code>, <code>/mark-cert-delivered</code>,
            and <code>/certificate-status-mod</code>.
          </p>
          <div className="field">
            <label>Mod roles</label>
            <RolePicker
              roles={roles}
              selectedKeys={certs.modRoleKeys}
              onChange={(modRoleKeys) => updateCerts({ modRoleKeys })}
            />
          </div>
        </div>

        <div className="row">
          {isDirty ? (
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              Unsaved changes
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isDirty || saving}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save certificate settings"}
          </button>
        </div>
      </div>
    </>
  );
}
