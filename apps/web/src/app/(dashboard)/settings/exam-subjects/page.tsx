"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChannelDirectoryEntry, ExamSubject } from "@ralevel/db";
import {
  CAMBRIDGE_TIMETABLE_SERIES,
  getCambridgeSyllabusName,
} from "@ralevel/shared/cambridgeSyllabuses";
import { ChannelIdPicker } from "@/components/ChannelIdPicker";
import type { ChannelOption } from "@/components/ChannelSearchMenu";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import { SyllabusCodePicker } from "@/components/SyllabusCodePicker";
import { useGuildConfig, type GuildConfigData } from "@/lib/useGuildConfig";
import { isDraftDirty, useUnsavedChanges } from "@/lib/unsaved-changes";
import type { IdLabel } from "@/lib/reputationIds";

type Draft = { subjects: ExamSubject[] };
type Directory = { channels: ChannelDirectoryEntry[]; updatedAt: string | null };

const MAX_LABEL_LEN = 100;
const CURRENT_SERIES = CAMBRIDGE_TIMETABLE_SERIES[0];
// Text-like channels list before voice-like ones inside a category, as in Discord
const VOICE_TYPES = new Set(["voice", "stage"]);

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

function uniqueId(base: string, taken: Set<string>, fallbackSuffix: string) {
  const slug = slugify(base) || "subject";
  if (!taken.has(slug)) return slug;
  const withSuffix = `${slug}-${fallbackSuffix}`.slice(0, 50);
  if (!taken.has(withSuffix)) return withSuffix;
  let n = 2;
  while (taken.has(`${withSuffix}-${n}`)) n += 1;
  return `${withSuffix}-${n}`;
}

function normalizeDraft(config: GuildConfigData | null): Draft | null {
  if (!config) return null;
  return {
    subjects: (config.examLocking?.subjects ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      syllabusCodes: s.syllabusCodes ?? [],
      channels: (s.channels ?? []).map((c) => ({ id: c.id, label: c.label ?? "" })),
      enabled: s.enabled !== false,
    })),
  };
}

// Snowflakes of different lengths don't sort as strings, so compare length first
function byPosition(a: ChannelDirectoryEntry, b: ChannelDirectoryEntry) {
  return (
    a.position - b.position ||
    a.id.length - b.id.length ||
    a.id.localeCompare(b.id)
  );
}

/** Directory -> picker options in Discord's sidebar order, labelled "#name · Category". */
function buildChannelOptions(channels: ChannelDirectoryEntry[]): ChannelOption[] {
  const categories = channels.filter((c) => c.type === "category").sort(byPosition);
  const children = new Map<string | null, ChannelDirectoryEntry[]>();
  for (const channel of channels) {
    if (channel.type === "category") continue;
    const parent = categories.some((c) => c.id === channel.parentId)
      ? channel.parentId
      : null;
    children.set(parent, [...(children.get(parent) ?? []), channel]);
  }

  const groups: [ChannelDirectoryEntry | null, ChannelDirectoryEntry[]][] = [
    [null, children.get(null) ?? []],
    ...categories.map(
      (c) => [c, children.get(c.id) ?? []] as [ChannelDirectoryEntry, ChannelDirectoryEntry[]],
    ),
  ];

  return groups.flatMap(([category, list]) =>
    [...list]
      .sort(
        (a, b) =>
          Number(VOICE_TYPES.has(a.type)) - Number(VOICE_TYPES.has(b.type)) ||
          byPosition(a, b),
      )
      .map((c) => ({
        key: c.id,
        channelId: c.id,
        label: category ? `#${c.name} · ${category.name}` : `#${c.name}`,
        hint: c.type,
      })),
  );
}

function formatUpdated(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function WarningList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function AddSubjectRow({
  existingIds,
  onAdd,
}: {
  existingIds: string[];
  onAdd: (label: string, id: string) => void;
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
          placeholder="New subject, e.g. Mathematics"
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
          onAdd(label.trim(), id);
          setLabel("");
        }}
      >
        Add
      </button>
    </div>
  );
}

export default function ExamSubjectsSettingsPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [onlyMissingChannels, setOnlyMissingChannels] = useState(false);

  const loadDirectory = useCallback(async () => {
    setDirectoryError(null);
    try {
      const res = await fetch("/api/discord/channels");
      if (!res.ok) throw new Error(await res.text());
      setDirectory(await res.json());
    } catch (e) {
      setDirectoryError(e instanceof Error ? e.message : "Failed to load channels");
    }
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const saved = useMemo(() => normalizeDraft(config), [config]);
  const current = draft ?? saved;

  const savedIds = useMemo(
    () => new Set(saved?.subjects.map((s) => s.id)),
    [saved],
  );

  const channelOptions = useMemo(
    () => buildChannelOptions(directory?.channels ?? []),
    [directory],
  );
  const channelById = useMemo(
    () => new Map((directory?.channels ?? []).map((c) => [c.id, c])),
    [directory],
  );
  const optionLabelById = useMemo(
    () => new Map(channelOptions.map((o) => [o.channelId, o.label])),
    [channelOptions],
  );
  // Only trust "channel not found" once the bot has published a list
  const directoryReady = Boolean(directory?.updatedAt);

  const isDirty = useMemo(() => isDraftDirty(draft, saved), [draft, saved]);

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: () => setDraft(null),
  });

  if (loading || !current || !config) return <p className="muted">Loading…</p>;

  const subjects = current.subjects;

  function setSubjects(next: ExamSubject[]) {
    setDraft({ subjects: next });
  }

  function updateSubject(index: number, patch: Partial<ExamSubject>) {
    const next = [...subjects];
    next[index] = { ...next[index], ...patch };
    setSubjects(next);
  }

  function codeOwners(exceptIndex: number) {
    const owners: Record<string, string> = {};
    subjects.forEach((s, i) => {
      if (i === exceptIndex) return;
      for (const code of s.syllabusCodes) owners[code] = s.label || s.id;
    });
    return owners;
  }

  function missingChannels(subject: ExamSubject) {
    if (!directoryReady) return [];
    return subject.channels.filter((c) => !channelById.has(c.id));
  }

  function onChannelsChange(index: number, selected: IdLabel[]) {
    const previous = new Map(subjects[index].channels.map((c) => [c.id, c.label]));
    updateSubject(index, {
      channels: selected.map((item) => {
        const live = channelById.get(item.id);
        return {
          id: item.id,
          label: live ? `#${live.name}` : previous.get(item.id) ?? item.label,
        };
      }),
    });
  }

  const mappedCodes = new Set(subjects.flatMap((s) => s.syllabusCodes));
  const unmappedCodes = CURRENT_SERIES.syllabusCodes.filter((c) => !mappedCodes.has(c));

  function addAllUnmapped() {
    const taken = new Set(subjects.map((s) => s.id));
    const added = unmappedCodes.map((code) => {
      const label = getCambridgeSyllabusName(code) ?? code;
      const id = uniqueId(label, taken, code);
      taken.add(id);
      return { id, label, syllabusCodes: [code], channels: [], enabled: true };
    });
    setSubjects([...subjects, ...added]);
  }

  const enabledSubjects = subjects.filter((s) => s.enabled);
  const warnings = {
    noChannels: enabledSubjects
      .filter((s) => s.syllabusCodes.length > 0 && s.channels.length === 0)
      .map((s) => s.label || s.id),
    noCodes: enabledSubjects
      .filter((s) => s.syllabusCodes.length === 0)
      .map((s) => s.label || s.id),
    missing: subjects.flatMap((s) =>
      missingChannels(s).map((c) => `${c.label || c.id} in ${s.label || s.id}`),
    ),
  };
  const hasWarnings =
    unmappedCodes.length > 0 ||
    warnings.noChannels.length > 0 ||
    warnings.noCodes.length > 0 ||
    warnings.missing.length > 0;

  const query = filter.trim().toLowerCase();
  const visible = subjects
    .map((subject, index) => ({ subject, index }))
    .filter(({ subject }) => {
      if (onlyMissingChannels && subject.channels.length > 0) return false;
      if (!query) return true;
      return (
        subject.label.toLowerCase().includes(query) ||
        subject.id.includes(query) ||
        subject.syllabusCodes.some(
          (code) =>
            code.includes(query) ||
            Boolean(getCambridgeSyllabusName(code)?.toLowerCase().includes(query)),
        )
      );
    });

  async function onSave() {
    if (!current) return;
    try {
      await save({
        examLocking: { ...config!.examLocking, subjects: current.subjects },
      });
      setDraft(null);
    } catch {
      // useGuildConfig shows the error
    }
  }

  return (
    <>
      <PageHeader
        title="Exam subjects"
        description="Which channels become read-only while each Cambridge syllabus is being sat. Exam locking uses this mapping to decide which channels to lock."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="stack">
        <div className="card stack" style={{ gap: "0.5rem" }}>
          <div className="row row-between">
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Server channels</h3>
            <button type="button" className="btn btn-sm" onClick={loadDirectory}>
              Reload
            </button>
          </div>
          {directoryError ? (
            <p className="status err" style={{ margin: 0 }}>
              Couldn&apos;t load the channel list: {directoryError}
            </p>
          ) : !directory ? (
            <p className="muted" style={{ margin: 0 }}>Loading channels…</p>
          ) : directoryReady ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {channelOptions.length} channels, published by the bot on{" "}
              {formatUpdated(directory.updatedAt)}. The bot republishes the list a few
              seconds after channels are created, renamed, moved or deleted.
            </p>
          ) : (
            <p className="status err" style={{ margin: 0 }}>
              The bot hasn&apos;t published the channel list yet. It does so when it
              starts, so restart the bot if it has been running since before this
              feature was deployed, then press Reload.
            </p>
          )}
        </div>

        {hasWarnings ? (
          <div
            className="card stack"
            style={{
              gap: "0.6rem",
              background: "var(--warn-soft)",
              borderColor: "var(--warn-border)",
              color: "var(--warn-text)",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Needs attention</h3>
            {unmappedCodes.length > 0 ? (
              <div>
                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  {unmappedCodes.length} syllabus
                  {unmappedCodes.length === 1 ? "" : "es"} in the {CURRENT_SERIES.label}{" "}
                  timetable {unmappedCodes.length === 1 ? "has" : "have"} no subject, so
                  {unmappedCodes.length === 1 ? " it" : " they"} won&apos;t lock anything.
                  Add a subject for each one the server has channels for; disable the rest.
                </p>
                <details style={{ marginTop: "0.25rem", fontSize: "0.85rem" }}>
                  <summary style={{ cursor: "pointer" }}>Show syllabuses</summary>
                  <WarningList
                    items={unmappedCodes.map(
                      (c) => `${c} ${getCambridgeSyllabusName(c) ?? ""}`.trim(),
                    )}
                  />
                </details>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ marginTop: "0.5rem" }}
                  onClick={addAllUnmapped}
                >
                  Add all subjects in the {CURRENT_SERIES.label} timetable
                </button>
              </div>
            ) : null}
            {warnings.noChannels.length > 0 ? (
              <div>
                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  Enabled subjects with no channels (nothing is locked for them):
                </p>
                <WarningList items={warnings.noChannels} />
              </div>
            ) : null}
            {warnings.noCodes.length > 0 ? (
              <div>
                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  Enabled subjects with no syllabus codes (they never lock):
                </p>
                <WarningList items={warnings.noCodes} />
              </div>
            ) : null}
            {warnings.missing.length > 0 ? (
              <div>
                <p style={{ margin: 0, fontSize: "0.85rem" }}>
                  Channels that no longer exist in the server (remove them or pick
                  the new channel):
                </p>
                <WarningList items={warnings.missing} />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="card stack">
          <div>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Subjects</h3>
            <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
              While any paper of a subject&apos;s syllabuses is being sat in any zone,
              its channels become read-only for members. A channel can belong to
              several subjects; each syllabus belongs to one. Disabled subjects never
              lock.
            </p>
          </div>

          {subjects.length > 0 ? (
            <div className="row" style={{ alignItems: "center" }}>
              <div className="field" style={{ flex: 1, margin: 0 }}>
                <input
                  type="search"
                  value={filter}
                  placeholder="Filter by name or syllabus code"
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={onlyMissingChannels}
                  onChange={(e) => setOnlyMissingChannels(e.target.checked)}
                />
                Only subjects without channels
              </label>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No subjects yet. Use &quot;Add all subjects in the {CURRENT_SERIES.label}{" "}
              timetable&quot; above, or add them one at a time below.
            </p>
          )}

          {subjects.length > 0 && visible.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No subjects match the filter.</p>
          ) : null}

          {visible.map(({ subject, index }) => {
            const missing = missingChannels(subject);
            const rowWarning = !subject.enabled
              ? null
              : subject.syllabusCodes.length === 0
                ? "No syllabus codes: this subject never locks."
                : subject.channels.length === 0
                  ? "No channels: nothing is locked for this subject."
                  : missing.length > 0
                    ? `${missing.length} channel${missing.length === 1 ? "" : "s"} no longer exist${missing.length === 1 ? "s" : ""} in the server.`
                    : null;

            return (
              <div
                key={`${subject.id}-${index}`}
                className="card stack"
                style={{
                  padding: "0.75rem",
                  gap: "0.5rem",
                  opacity: subject.enabled ? 1 : 0.7,
                }}
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
                      readOnly={savedIds.has(subject.id)}
                      title={
                        savedIds.has(subject.id)
                          ? "IDs can't change after saving."
                          : undefined
                      }
                      onChange={(e) => updateSubject(index, { id: e.target.value })}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Syllabus codes</label>
                  <SyllabusCodePicker
                    selected={subject.syllabusCodes}
                    takenBy={codeOwners(index)}
                    onChange={(syllabusCodes) => updateSubject(index, { syllabusCodes })}
                  />
                </div>
                <div className="field">
                  <label>Channels</label>
                  {directoryReady ? (
                    <ChannelIdPicker
                      channels={channelOptions}
                      selected={subject.channels.map((c) => ({
                        id: c.id,
                        label:
                          optionLabelById.get(c.id) ??
                          `${c.label || c.id} (not found)`,
                      }))}
                      removeConfirmMessage={(item) =>
                        `Remove "${item.label || item.id}" from ${subject.label || "this subject"}? Changes apply after you save.`
                      }
                      onChange={(selected) => onChannelsChange(index, selected)}
                    />
                  ) : (
                    <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                      {subject.channels.length > 0
                        ? subject.channels.map((c) => c.label || c.id).join(", ")
                        : "None"}
                      {" — "}channels can be picked once the bot has published the
                      channel list.
                    </p>
                  )}
                </div>
                {rowWarning ? (
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--warn-text)" }}>
                    ⚠ {rowWarning}
                  </p>
                ) : null}
                <div className="row row-between">
                  <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={subject.enabled}
                      onChange={(e) => updateSubject(index, { enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => setSubjects(subjects.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}

          <AddSubjectRow
            existingIds={subjects.map((s) => s.id)}
            onAdd={(label, id) =>
              setSubjects([
                ...subjects,
                { id, label, syllabusCodes: [], channels: [], enabled: true },
              ])
            }
          />
        </div>

        <SaveActions
          saveBarRef={saveBarRef}
          isDirty={isDirty}
          saving={saving}
          onSave={onSave}
          onDiscard={() => setDraft(null)}
          saveLabel="Save exam subjects"
        />
      </div>
    </>
  );
}
