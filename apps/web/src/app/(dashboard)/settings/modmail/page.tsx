"use client";

import { useMemo, useState } from "react";
import {
  AddModmailCategoryModal,
  validateModmailCategoryValue,
} from "@/components/AddModmailCategoryModal";
import { ChannelIdPicker } from "@/components/ChannelIdPicker";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import {
  useGuildConfig,
  type GuildConfigData,
} from "@/lib/useGuildConfig";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

type ModmailConfig = GuildConfigData["modmail"];
type ModmailCategory = ModmailConfig["categories"][number];

const MAX_CATEGORIES = 25;
const MAX_LABEL_LEN = 100;
const MAX_DESCRIPTION_LEN = 100;

const DEFAULT_CATEGORIES: ModmailCategory[] = [
  {
    value: "general",
    label: "General Query",
    description: "Questions that don't fit the other options",
  },
  {
    value: "advertise",
    label: "Permission to Advertise",
    description: "Request permission to advertise",
  },
  {
    value: "report",
    label: "Report a Member",
    description: "Report a member for misconduct",
  },
];

function normalizeModmail(modmail: ModmailConfig | undefined): ModmailConfig | null {
  if (!modmail) return null;
  return {
    forumChannelId:
      typeof modmail.forumChannelId === "string" ? modmail.forumChannelId : "",
    categories: Array.isArray(modmail.categories)
      ? modmail.categories.map((c) => ({
          value: String(c?.value ?? ""),
          label: String(c?.label ?? ""),
          description: String(c?.description ?? ""),
        }))
      : DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  };
}

function channelLabelForId(
  channelId: string,
  channels: GuildConfigData["channels"],
) {
  const match = channels.find((channel) => channel.channelId === channelId);
  return match?.label || match?.key || channelId;
}

function validateModmail(modmail: ModmailConfig): string | null {
  if (!modmail.forumChannelId.trim()) {
    return "Select a modmail forum channel before saving.";
  }
  if (!modmail.categories.length) {
    return "Add at least one support category.";
  }
  if (modmail.categories.length > MAX_CATEGORIES) {
    return `A maximum of ${MAX_CATEGORIES} categories is allowed (Discord select limit).`;
  }

  const seen = new Set<string>();
  for (const category of modmail.categories) {
    const value = category.value.trim();
    const label = category.label.trim();
    if (!label) return "Every category needs a label.";

    const valueError = validateModmailCategoryValue(value);
    if (valueError) {
      return `Category "${label || value}": ${valueError}`;
    }

    if (label.length > MAX_LABEL_LEN) {
      return `Category label "${label}" exceeds ${MAX_LABEL_LEN} characters.`;
    }
    if ((category.description || "").length > MAX_DESCRIPTION_LEN) {
      return `Category description for "${label}" exceeds ${MAX_DESCRIPTION_LEN} characters.`;
    }
    if (seen.has(value)) {
      return `Duplicate category value "${value}". Values must be unique.`;
    }
    seen.add(value);
  }

  return null;
}

export default function ModmailSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<ModmailConfig | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const savedModmail = useMemo(
    () => normalizeModmail(config?.modmail),
    [config?.modmail],
  );
  const modmail = draft ?? savedModmail;
  const channels = config?.channels ?? [];

  const forumChannelSelected = useMemo(() => {
    if (!modmail?.forumChannelId) return [];
    return [
      {
        id: modmail.forumChannelId,
        label: channelLabelForId(modmail.forumChannelId, channels),
      },
    ];
  }, [modmail?.forumChannelId, channels]);

  const isDirty = useMemo(
    () =>
      draft !== null && JSON.stringify(draft) !== JSON.stringify(savedModmail),
    [draft, savedModmail],
  );

  function updateModmail(patch: Partial<ModmailConfig>) {
    if (!modmail) return;
    setDraft({ ...modmail, ...patch });
  }

  function updateCategory(index: number, patch: Partial<ModmailCategory>) {
    if (!modmail) return;
    const categories = [...modmail.categories];
    categories[index] = { ...categories[index], ...patch };
    updateModmail({ categories });
  }

  function removeCategory(index: number) {
    if (!modmail) return;
    updateModmail({
      categories: modmail.categories.filter((_, i) => i !== index),
    });
  }

  async function onSave() {
    if (!modmail) return;
    const validationError = validateModmail(modmail);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    const cleaned: ModmailConfig = {
      forumChannelId: modmail.forumChannelId.trim(),
      categories: modmail.categories.map((c) => ({
        value: c.value.trim(),
        label: c.label.trim(),
        description: (c.description || "").trim(),
      })),
    };

    setLocalError(null);
    await save({ modmail: cleaned });
    setDraft(null);
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

  if (loading || !modmail) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Modmail settings"
        description="Forum channel and support dropdown categories for DM tickets."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {localError ? <p className="status err">{localError}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Forum channel</h3>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Add the Discord forum channel on the Channels page first, then select
            it here. New tickets are posted as threads in this forum.
          </p>
          <div className="field">
            <label>Modmail forum</label>
            <ChannelIdPicker
              channels={channels}
              selected={forumChannelSelected}
              maxItems={1}
              emptyLinkLabel="Add channels"
              removeConfirmMessage={(item) =>
                `Remove "${item.label || item.id}" as the modmail forum? Changes apply after you save.`
              }
              onChange={(selected) =>
                updateModmail({ forumChannelId: selected[0]?.id ?? "" })
              }
            />
          </div>
        </div>

        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1rem" }}>Support categories</h3>
              <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                Shown in the DM dropdown. Values are stored on tickets — keep them
                stable if you care about historical records. Values must be
                lowercase with no spaces (use dashes).
              </p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setLocalError(null);
                setAddOpen(true);
              }}
              disabled={modmail.categories.length >= MAX_CATEGORIES}
            >
              Add category
            </button>
          </div>

          <div className="stack" style={{ gap: "0.75rem" }}>
            {modmail.categories.map((category, index) => (
              <div
                key={`${category.value}-${index}`}
                className="card stack"
                style={{ padding: "0.75rem", gap: "0.5rem" }}
              >
                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label>Value</label>
                    <input
                      className="mono"
                      value={category.value}
                      maxLength={100}
                      placeholder="general-query"
                      onChange={(e) =>
                        updateCategory(index, { value: e.target.value })
                      }
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Label</label>
                    <input
                      value={category.label}
                      maxLength={MAX_LABEL_LEN}
                      placeholder="General Query"
                      onChange={(e) =>
                        updateCategory(index, { label: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Description</label>
                  <input
                    value={category.description}
                    maxLength={MAX_DESCRIPTION_LEN}
                    placeholder="Shown under the option in Discord"
                    onChange={(e) =>
                      updateCategory(index, { description: e.target.value })
                    }
                  />
                </div>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => removeCategory(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AddModmailCategoryModal
        open={addOpen}
        existingValues={modmail.categories.map((c) => c.value.trim())}
        onCancel={() => setAddOpen(false)}
        onAdd={(category) => {
          updateModmail({
            categories: [...modmail.categories, category],
          });
          setAddOpen(false);
          setLocalError(null);
        }}
      />

      <SaveActions
        saveBarRef={saveBarRef}
        isDirty={isDirty}
        saving={saving}
        onSave={onSave}
        onDiscard={() => {
          setDraft(null);
          setLocalError(null);
        }}
        saveLabel="Save modmail settings"
      />
    </>
  );
}
