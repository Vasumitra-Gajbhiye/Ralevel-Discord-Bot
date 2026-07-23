"use client";

import { useMemo, useState } from "react";
import { AddChannelModal } from "@/components/AddChannelModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { InfoHelpIcon } from "@/components/InfoHelpIcon";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig } from "@/lib/useGuildConfig";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

type ChannelEntry = { key: string; label: string; channelId: string };

const KEY_HELP =
  "Input the same text as label, but in lowercase. Dash and underscore are allowed. Spaces are strictly not allowed.";
const LABEL_HELP =
  "Input the exact name of the channel as in Discord (include emojis if channel name has them).";
const CHANNEL_ID_HELP = "Input channel ID. No space.";

export default function ChannelsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<ChannelEntry[] | null>(null);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null,
  );
  const [showAddModal, setShowAddModal] = useState(false);

  const savedChannels = useMemo(() => config?.channels ?? [], [config?.channels]);
  const channels = draft ?? savedChannels;

  const isDirty = useMemo(
    () =>
      draft !== null && JSON.stringify(draft) !== JSON.stringify(savedChannels),
    [draft, savedChannels],
  );

  const pendingChannel =
    pendingRemoveIndex !== null ? channels[pendingRemoveIndex] : null;

  function updateChannel(
    index: number,
    field: "key" | "label" | "channelId",
    value: string,
  ) {
    const next = channels.map((c, i) =>
      i === index ? { ...c, [field]: value } : c,
    );
    setDraft(next);
  }

  function handleAddChannel(channel: ChannelEntry) {
    setDraft([...channels, channel]);
    setShowAddModal(false);
  }

  function confirmRemove() {
    if (pendingRemoveIndex === null) return;
    setDraft(channels.filter((_, i) => i !== pendingRemoveIndex));
    setPendingRemoveIndex(null);
  }

  async function onSave() {
    await save({ channels });
    setDraft(null);
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

  if (loading) return <p className="muted">Loading…</p>;

  const removeMessage = pendingChannel
    ? `Remove channel "${pendingChannel.label || pendingChannel.key}"? Changes apply after you save.`
    : "";

  return (
    <>
      <PageHeader
        title="Channels"
        description="Discord channel snowflake IDs used by bot features. Add display names to remember what each channel is."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="card stack">
        <div className="row row-between">
          <button
            type="button"
            className="btn"
            onClick={() => setShowAddModal(true)}
          >
            Add channel
          </button>
          <SaveActions
            saveBarRef={saveBarRef}
            isDirty={isDirty}
            saving={saving}
            onSave={onSave}
            onDiscard={() => setDraft(null)}
            saveLabel="Save channels"
          />
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>
                  <span className="th-with-help">
                    Key
                    <InfoHelpIcon content={KEY_HELP} />
                  </span>
                </th>
                <th>
                  <span className="th-with-help">
                    Label
                    <InfoHelpIcon content={LABEL_HELP} />
                  </span>
                </th>
                <th>
                  <span className="th-with-help">
                    Channel ID
                    <InfoHelpIcon content={CHANNEL_ID_HELP} />
                  </span>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {channels.map((channel, i) => (
                <tr key={`${channel.key}-${i}`}>
                  <td>
                    <input
                      className="input mono"
                      value={channel.key}
                      onChange={(e) =>
                        updateChannel(
                          i,
                          "key",
                          e.target.value.replace(/\s/g, ""),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={channel.label}
                      onChange={(e) =>
                        updateChannel(i, "label", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input mono"
                      value={channel.channelId}
                      onChange={(e) =>
                        updateChannel(i, "channelId", e.target.value.trim())
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setPendingRemoveIndex(i)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddChannelModal
        open={showAddModal}
        saving={saving}
        existingKeys={channels.map((c) => c.key)}
        onCancel={() => setShowAddModal(false)}
        onAdd={handleAddChannel}
      />

      <ConfirmModal
        open={pendingRemoveIndex !== null}
        title="Remove channel"
        message={removeMessage}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemoveIndex(null)}
      />
    </>
  );
}
