"use client";

import { useMemo, useRef, useState } from "react";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { RoleSelect } from "@/components/RoleSelect";
import {
  useGuildConfig,
  type GuildConfigData,
} from "@/lib/useGuildConfig";

type CertificatesConfig = GuildConfigData["certificates"];
type PanelButton = CertificatesConfig["panel"]["buttons"][number];
type ButtonStyle = PanelButton["style"];

const BUTTON_STYLES: ButtonStyle[] = [
  "Primary",
  "Secondary",
  "Success",
  "Danger",
];

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

function insertAtCursor(
  value: string,
  insertion: string,
  selectionStart: number,
  selectionEnd: number,
) {
  return {
    nextValue:
      value.slice(0, selectionStart) + insertion + value.slice(selectionEnd),
    nextCursor: selectionStart + insertion.length,
  };
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
      return "Every apply button must be linked to a certificate type.";
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
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const savedCerts = useMemo(
    () => normalizeCertificates(config?.certificates),
    [config?.certificates],
  );
  const certs = draft ?? savedCerts;
  const panel = certs?.panel;
  const channels =
    config?.channels.filter((channel) => channel.channelId.trim()) ?? [];

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

  function insertMention(insertion: string) {
    if (!panel) return;
    const textarea = descriptionRef.current;
    if (!textarea) {
      updatePanel({ description: `${panel.description}${insertion}` });
      return;
    }

    const { nextValue, nextCursor } = insertAtCursor(
      panel.description,
      insertion,
      textarea.selectionStart,
      textarea.selectionEnd,
    );
    updatePanel({ description: nextValue });
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
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
        description="Application panel message, apply buttons, certificate types, and staff mod roles."
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
            <select
              value={panel.channelId}
              onChange={(e) => updatePanel({ channelId: e.target.value })}
            >
              <option value="">Select channel…</option>
              {channels.map((channel) => (
                <option key={channel.key} value={channel.channelId}>
                  {channel.label || channel.key} ({channel.channelId})
                </option>
              ))}
            </select>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.8rem" }}>
              Configure channel IDs under Settings → Channels if the list is empty.
            </p>
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
              ref={descriptionRef}
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
            <div className="row" style={{ marginTop: "0.5rem", flexWrap: "wrap" }}>
              <div className="field" style={{ minWidth: "12rem" }}>
                <label>Insert role mention</label>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const roleId = e.target.value;
                    if (!roleId) return;
                    insertMention(`<@&${roleId}>`);
                    e.target.value = "";
                  }}
                >
                  <option value="">Select role…</option>
                  {config?.roles
                    .filter((role) => role.roleId)
                    .map((role) => (
                      <option key={role.key} value={role.roleId}>
                        {role.label || role.key}
                      </option>
                    ))}
                </select>
              </div>
              <div className="field" style={{ minWidth: "12rem" }}>
                <label>Insert channel mention</label>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const channelId = e.target.value;
                    if (!channelId) return;
                    insertMention(`<#${channelId}>`);
                    e.target.value = "";
                  }}
                >
                  <option value="">Select channel…</option>
                  {channels.map((channel) => (
                    <option key={channel.key} value={channel.channelId}>
                      {channel.label || channel.key}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
            <label
              style={{
                display: "flex",
                gap: "0.4rem",
                alignItems: "center",
                alignSelf: "end",
              }}
            >
              <input
                type="checkbox"
                checked={panel.showTimestamp}
                onChange={(e) =>
                  updatePanel({ showTimestamp: e.target.checked })
                }
              />
              Show timestamp
            </label>
          </div>
        </div>

        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Apply buttons</h3>
            <button
              type="button"
              className="btn"
              disabled={panel.buttons.length >= 25}
              onClick={() =>
                updatePanel({
                  buttons: [
                    ...panel.buttons,
                    {
                      certTypeId: certs.types[0]?.id || "",
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
            <div className="card stack" key={`${button.certTypeId}-${i}`}>
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
                  <label>Certificate type</label>
                  <select
                    value={button.certTypeId}
                    onChange={(e) =>
                      updateButton(i, { certTypeId: e.target.value })
                    }
                  >
                    <option value="">Select type…</option>
                    {certs.types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.label} ({type.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Style</label>
                  <select
                    value={button.style}
                    onChange={(e) =>
                      updateButton(i, {
                        style: e.target.value as ButtonStyle,
                      })
                    }
                  >
                    {BUTTON_STYLES.map((style) => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
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
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Certificate types</h3>
          {certs.types.map((type, i) => (
            <div className="card stack" key={type.id}>
              <div className="row">
                <div className="field">
                  <label>ID</label>
                  <input
                    value={type.id}
                    onChange={(e) => {
                      const types = [...certs.types];
                      types[i] = { ...type, id: e.target.value };
                      updateCerts({ types });
                    }}
                  />
                </div>
                <div className="field">
                  <label>Label</label>
                  <input
                    value={type.label}
                    onChange={(e) => {
                      const types = [...certs.types];
                      types[i] = { ...type, label: e.target.value };
                      updateCerts({ types });
                    }}
                  />
                </div>
                <label
                  style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={type.enabled}
                    onChange={(e) => {
                      const types = [...certs.types];
                      types[i] = { ...type, enabled: e.target.checked };
                      updateCerts({ types });
                    }}
                  />
                  Enabled
                </label>
              </div>
              <div className="field">
                <label>Required role keys (comma-separated)</label>
                <input
                  value={type.requiredRoleKeys.join(", ")}
                  onChange={(e) => {
                    const types = [...certs.types];
                    types[i] = {
                      ...type,
                      requiredRoleKeys: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    };
                    updateCerts({ types });
                  }}
                />
              </div>
              <div className="field">
                <label>Reward role key</label>
                <RoleSelect
                  roles={config?.roles ?? []}
                  value={type.rewardRoleKey || ""}
                  onChange={(rewardRoleKey) => {
                    const types = [...certs.types];
                    types[i] = {
                      ...type,
                      rewardRoleKey: rewardRoleKey || null,
                    };
                    updateCerts({ types });
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Staff permissions</h3>
          <div className="field">
            <label>Mod role keys (comma-separated)</label>
            <input
              value={certs.modRoleKeys.join(", ")}
              onChange={(e) =>
                updateCerts({
                  modRoleKeys: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="field">
            <label>Extra mod role IDs (legacy MOD_ROLES)</label>
            <input
              className="mono"
              value={(certs.extraModRoleIds || []).join(", ")}
              onChange={(e) =>
                updateCerts({
                  extraModRoleIds: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
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
