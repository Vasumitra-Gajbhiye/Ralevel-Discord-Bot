"use client";

import { useMemo, useState } from "react";
import { BAN_MESSAGE_PLACEHOLDERS } from "@ralevel/shared";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { RolePicker } from "@/components/RolePicker";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

type BanMessages = GuildConfigData["moderation"]["banMessages"];

type ModerationDraft = {
  banMessages: BanMessages;
  banAppealApproverRoleKeys: string[];
};

const EMPTY_BAN_MESSAGES: BanMessages = {
  appealUrl: "",
  banAppealable: "",
  banNotAppealable: "",
  appealApproved: "",
  appealRejected: "",
};

const DEFAULT_BAN_APPEAL_APPROVER_ROLE_KEYS = ["admin", "dcHead"];

const TEMPLATE_FIELDS: {
  key: keyof Omit<BanMessages, "appealUrl">;
  label: string;
  description: string;
}[] = [
  {
    key: "banAppealable",
    label: "Ban DM (appealable)",
    description: "Sent when a moderator bans a user with appealable set to yes.",
  },
  {
    key: "banNotAppealable",
    label: "Ban DM (not appealable)",
    description: "Sent when a moderator bans a user with appealable set to no.",
  },
  {
    key: "appealApproved",
    label: "Appeal approved DM",
    description: "Sent when a moderator runs /ban-appeal-approved.",
  },
  {
    key: "appealRejected",
    label: "Appeal rejected DM",
    description: "Sent when a moderator runs /ban-appeal-rejected.",
  },
];

function resolveBanAppealApproverRoleKeys(
  config: GuildConfigData | null,
): string[] {
  const keys = config?.moderation?.banAppealApproverRoleKeys;
  if (Array.isArray(keys) && keys.length > 0) return keys;

  const legacy = config?.commandPermissions?.["ban-appeal-approved"];
  if (Array.isArray(legacy) && legacy.length > 0) return legacy;

  return [...DEFAULT_BAN_APPEAL_APPROVER_ROLE_KEYS];
}

export default function BanMessagesPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<ModerationDraft | null>(null);

  const savedModeration = useMemo(
    (): ModerationDraft => ({
      banMessages: config?.moderation?.banMessages ?? EMPTY_BAN_MESSAGES,
      banAppealApproverRoleKeys: resolveBanAppealApproverRoleKeys(config),
    }),
    [config],
  );

  const moderation = draft ?? savedModeration;
  const { banMessages, banAppealApproverRoleKeys } = moderation;
  const roles = config?.roles ?? [];

  const isDirty = useMemo(
    () =>
      draft !== null &&
      JSON.stringify(draft) !== JSON.stringify(savedModeration),
    [draft, savedModeration],
  );

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

  function updateDraft(patch: Partial<ModerationDraft>) {
    setDraft({ ...moderation, ...patch });
  }

  function updateBanMessages(patch: Partial<BanMessages>) {
    updateDraft({ banMessages: { ...banMessages, ...patch } });
  }

  async function onSave() {
    if (!config) return;
    await save({
      moderation: {
        ...config.moderation,
        banMessages,
        banAppealApproverRoleKeys,
      },
    });
    setDraft(null);
  }

  if (loading || !config) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Ban messages"
        description="Configure who can handle ban appeals and edit DM templates sent when users are banned or when their appeal is approved or rejected. Discord markdown is supported. Changes apply within about 15 seconds."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="card stack" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Appeal permissions</h3>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Members with these roles can approve or reject ban appeals using{" "}
          <code>/ban-appeal-approved</code>, <code>/ban-appeal-rejected</code>,
          and appeal action buttons in DMs.
        </p>
        <div className="field">
          <label>Appeal approver roles</label>
          <RolePicker
            roles={roles}
            selectedKeys={banAppealApproverRoleKeys}
            onChange={(keys) =>
              updateDraft({ banAppealApproverRoleKeys: keys })
            }
          />
        </div>
      </div>

      <div className="card stack">
        <div className="field">
          <label>Appeal form URL</label>
          <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
            Used by the {"{appealUrl}"} placeholder in the appealable ban
            message.
          </p>
          <input
            value={banMessages.appealUrl}
            onChange={(e) => updateBanMessages({ appealUrl: e.target.value })}
          />
        </div>

        {TEMPLATE_FIELDS.map((field) => (
          <div className="field" key={field.key}>
            <label>{field.label}</label>
            <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
              {field.description}
            </p>
            <textarea
              rows={6}
              value={banMessages[field.key]}
              onChange={(e) =>
                updateBanMessages({ [field.key]: e.target.value })
              }
            />
          </div>
        ))}

      </div>

      <SaveActions
        saveBarRef={saveBarRef}
        isDirty={isDirty}
        saving={saving}
        onSave={onSave}
        onDiscard={() => setDraft(null)}
        saveLabel="Save ban appeal settings"
      />

      <div className="card stack" style={{ marginTop: "1.5rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Placeholders</h2>
        <p className="muted">
          Use these tokens in any template above. They are replaced when the bot
          sends the DM.
        </p>
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {BAN_MESSAGE_PLACEHOLDERS.map((placeholder) => (
            <li key={placeholder.key} className="field">
              <strong>
                <code>{placeholder.label}</code>
              </strong>
              <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
                {placeholder.description}
              </p>
              <p className="muted" style={{ fontSize: "0.82rem", margin: 0 }}>
                Used in: {placeholder.templates.join(", ")}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
