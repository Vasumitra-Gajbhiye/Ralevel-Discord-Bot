"use client";

import { useMemo, useState } from "react";
import { ChannelIdPicker } from "@/components/ChannelIdPicker";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { RolePicker } from "@/components/RolePicker";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";
import { isDraftDirty, useUnsavedChanges } from "@/lib/unsaved-changes";

type DefinitionsConfig = GuildConfigData["definitions"];
type Draft = { enabled: boolean; definitions: DefinitionsConfig };
type Entry = { id: string; label: string; enabled: boolean };

const MAX_LABEL_LEN = 100;

/** Mirrors slugifyEntryId in packages/db/src/definitionsConfig.js */
function slugify(label: string) {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function normalizeDraft(config: GuildConfigData | null): Draft | null {
  if (!config) return null;
  const d = config.definitions;
  return {
    enabled: config.features?.definitions !== false,
    definitions: {
      subjects: (d?.subjects ?? []).map((s) => ({
        id: s.id,
        label: s.label,
        helperRoleKeys: s.helperRoleKeys ?? [],
        enabled: s.enabled !== false,
      })),
      boards: (d?.boards ?? []).map((b) => ({
        id: b.id,
        label: b.label,
        enabled: b.enabled !== false,
      })),
      reviewChannelId: d?.reviewChannelId ?? "",
      logChannelId: d?.logChannelId ?? "",
      approverRoleKeys: d?.approverRoleKeys ?? [],
      pingRoleKeys: d?.pingRoleKeys ?? [],
      maxPendingPerUser: d?.maxPendingPerUser ?? 5,
    },
  };
}

function channelSelection(
  channelId: string,
  channels: GuildConfigData["channels"],
) {
  if (!channelId) return [];
  const match = channels.find((c) => c.channelId === channelId);
  return [{ id: channelId, label: match?.label || match?.key || channelId }];
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function AddEntryRow({
  placeholder,
  existingIds,
  onAdd,
}: {
  placeholder: string;
  existingIds: string[];
  onAdd: (entry: Entry) => void;
}) {
  const [label, setLabel] = useState("");
  const id = slugify(label);
  const duplicate = Boolean(id) && existingIds.includes(id);

  return (
    <div className="row">
      <div className="field" style={{ flex: 1 }}>
        <input
          value={label}
          maxLength={MAX_LABEL_LEN}
          placeholder={placeholder}
          onChange={(e) => setLabel(e.target.value)}
        />
        {duplicate ? (
          <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
            &quot;{id}&quot; already exists.
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="btn"
        disabled={!id || duplicate}
        onClick={() => {
          onAdd({ id, label: label.trim(), enabled: true });
          setLabel("");
        }}
      >
        Add
      </button>
    </div>
  );
}

export default function DefinitionsSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<Draft | null>(null);

  const saved = useMemo(() => normalizeDraft(config), [config]);
  const current = draft ?? saved;
  const channels = config?.channels ?? [];
  const roles = config?.roles ?? [];

  // IDs are stored on definitions, so only unsaved entries can change theirs
  const savedSubjectIds = useMemo(
    () => new Set(saved?.definitions.subjects.map((s) => s.id)),
    [saved],
  );
  const savedBoardIds = useMemo(
    () => new Set(saved?.definitions.boards.map((b) => b.id)),
    [saved],
  );

  const isDirty = useMemo(() => isDraftDirty(draft, saved), [draft, saved]);

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

  if (loading || !current || !config) return <p className="muted">Loading…</p>;

  const defs = current.definitions;

  function update(patch: Partial<DefinitionsConfig>) {
    setDraft({ ...current!, definitions: { ...defs, ...patch } });
  }

  function updateSubject(index: number, patch: Partial<DefinitionsConfig["subjects"][number]>) {
    const subjects = [...defs.subjects];
    subjects[index] = { ...subjects[index], ...patch };
    update({ subjects });
  }

  function updateBoard(index: number, patch: Partial<Entry>) {
    const boards = [...defs.boards];
    boards[index] = { ...boards[index], ...patch };
    update({ boards });
  }

  async function onSave() {
    if (!current) return;
    try {
      await save({
        definitions: current.definitions,
        features: { ...config!.features, definitions: current.enabled },
      });
      setDraft(null);
    } catch {
      // useGuildConfig shows the error
    }
  }

  return (
    <>
      <PageHeader
        title="Definitions"
        description="Subjects, exam boards, reviewers and channels for /define, /add-define, /edit-define and /delete-define."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Review</h3>
          <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={current.enabled}
              onChange={(e) => setDraft({ ...current, enabled: e.target.checked })}
            />
            Definitions enabled
          </label>
          <div className="field">
            <label>Review channel</label>
            <p className="muted" style={{ margin: "0 0 0.35rem", fontSize: "0.85rem" }}>
              New definitions from members, suggested improvements and removal
              requests are posted here with Approve / Reject buttons.
            </p>
            <ChannelIdPicker
              channels={channels}
              selected={channelSelection(defs.reviewChannelId, channels)}
              maxItems={1}
              onChange={(selected) =>
                update({ reviewChannelId: selected[0]?.id ?? "" })
              }
            />
          </div>
          <div className="field">
            <label>Log channel (optional)</label>
            <p className="muted" style={{ margin: "0 0 0.35rem", fontSize: "0.85rem" }}>
              Where changes made without review (by helpers and approvers) are
              logged. Uses the review channel when empty.
            </p>
            <ChannelIdPicker
              channels={channels}
              selected={channelSelection(defs.logChannelId, channels)}
              maxItems={1}
              onChange={(selected) =>
                update({ logChannelId: selected[0]?.id ?? "" })
              }
            />
          </div>
          <div className="field">
            <label>Approver roles</label>
            <p className="muted" style={{ margin: "0 0 0.35rem", fontSize: "0.85rem" }}>
              Can approve or reject requests, and edit or delete any definition
              directly.
            </p>
            <RolePicker
              roles={roles}
              selectedKeys={defs.approverRoleKeys}
              removeNoun="definition approvers"
              onChange={(approverRoleKeys) => update({ approverRoleKeys })}
            />
          </div>
          <div className="field">
            <label>Roles pinged for new requests</label>
            <RolePicker
              roles={roles}
              selectedKeys={defs.pingRoleKeys}
              removeNoun="definition review pings"
              onChange={(pingRoleKeys) => update({ pingRoleKeys })}
            />
          </div>
          <div className="field" style={{ maxWidth: "16rem" }}>
            <label>Max pending requests per member</label>
            <input
              type="number"
              min={1}
              max={50}
              value={defs.maxPendingPerUser}
              onChange={(e) =>
                update({ maxPendingPerUser: Number(e.target.value) || 0 })
              }
            />
          </div>
        </div>

        <div className="card stack">
          <div>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Subjects</h3>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
              The subject list members pick from. Members with a subject&apos;s
              helper roles add definitions there without review, and can edit or
              delete the ones they wrote. Add helper roles on the Roles page
              first. Subjects that already have definitions can&apos;t be
              removed — disable them to hide them from /add-define.
            </p>
          </div>

          {defs.subjects.map((subject, index) => (
            <div
              key={`${subject.id}-${index}`}
              className="card stack"
              style={{ padding: "0.75rem", gap: "0.5rem" }}
            >
              <div className="row">
                <div className="field" style={{ flex: 2 }}>
                  <label>Name</label>
                  <input
                    value={subject.label}
                    maxLength={MAX_LABEL_LEN}
                    onChange={(e) => updateSubject(index, { label: e.target.value })}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>ID</label>
                  <input
                    className="mono"
                    value={subject.id}
                    readOnly={savedSubjectIds.has(subject.id)}
                    title={
                      savedSubjectIds.has(subject.id)
                        ? "IDs can't change after saving — definitions reference them."
                        : undefined
                    }
                    onChange={(e) => updateSubject(index, { id: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label>Helper roles</label>
                <RolePicker
                  roles={roles}
                  selectedKeys={subject.helperRoleKeys}
                  removeNoun={`${subject.label || "this subject"}'s helpers`}
                  onChange={(helperRoleKeys) => updateSubject(index, { helperRoleKeys })}
                />
              </div>
              <div className="row row-between">
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={subject.enabled}
                    onChange={(e) => updateSubject(index, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={index === 0}
                    onClick={() => update({ subjects: moveItem(defs.subjects, index, index - 1) })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={index === defs.subjects.length - 1}
                    onClick={() => update({ subjects: moveItem(defs.subjects, index, index + 1) })}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() =>
                      update({ subjects: defs.subjects.filter((_, i) => i !== index) })
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}

          <AddEntryRow
            placeholder="New subject, e.g. Further Mathematics"
            existingIds={defs.subjects.map((s) => s.id)}
            onAdd={(entry) =>
              update({ subjects: [...defs.subjects, { ...entry, helperRoleKeys: [] }] })
            }
          />
        </div>

        <div className="card stack">
          <div>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Exam boards</h3>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
              Optional on every definition. Definitions without a board apply to
              all boards and still show when someone filters by a board.
            </p>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Enabled</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {defs.boards.map((board, index) => (
                  <tr key={`${board.id}-${index}`}>
                    <td>
                      <input
                        value={board.label}
                        maxLength={MAX_LABEL_LEN}
                        onChange={(e) => updateBoard(index, { label: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="mono"
                        value={board.id}
                        readOnly={savedBoardIds.has(board.id)}
                        onChange={(e) => updateBoard(index, { id: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={board.enabled}
                        onChange={(e) => updateBoard(index, { enabled: e.target.checked })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() =>
                          update({ boards: defs.boards.filter((_, i) => i !== index) })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AddEntryRow
            placeholder="New board, e.g. WJEC"
            existingIds={defs.boards.map((b) => b.id)}
            onAdd={(entry) => update({ boards: [...defs.boards, entry] })}
          />
        </div>

        <SaveActions
          saveBarRef={saveBarRef}
          isDirty={isDirty}
          saving={saving}
          onSave={onSave}
          onDiscard={() => setDraft(null)}
          saveLabel="Save definition settings"
        />
      </div>
    </>
  );
}
