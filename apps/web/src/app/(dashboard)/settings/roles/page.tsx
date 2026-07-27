"use client";

import { useMemo, useState } from "react";
import { AddRoleModal } from "@/components/AddRoleModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  RolesSortableTable,
  arrayMove,
} from "@/components/RolesSortableTable";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { SaveActions } from "@/components/SaveActions";
import { useGuildConfig } from "@/lib/useGuildConfig";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

const KEY_HELP =
  "Input the same text as label, but in lowercase. Dash and underscore are allowed. Spaces are strictly not allowed.";
const LABEL_HELP =
  "Input the exact name of the role as in Discord (include emojis if role name has them).";
const ROLE_ID_HELP = "Input role ID. No space.";

export default function RolesPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<
    { key: string; label: string; roleId: string }[] | null
  >(null);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null,
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);

  const savedRoles = useMemo(() => config?.roles ?? [], [config?.roles]);
  const roles = draft ?? savedRoles;

  const isDirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== JSON.stringify(savedRoles),
    [draft, savedRoles],
  );

  const pendingRole =
    pendingRemoveIndex !== null ? roles[pendingRemoveIndex] : null;

  const pendingRoleUsed = pendingRole
    ? Object.values(config?.commandPermissions || {}).some((keys) =>
        keys.includes(pendingRole.key),
      )
    : false;

  function updateRole(
    index: number,
    field: "key" | "label" | "roleId",
    value: string,
  ) {
    const next = roles.map((r, i) =>
      i === index ? { ...r, [field]: value } : r,
    );
    setDraft(next);
  }

  function reorderRoles(fromIndex: number, toIndex: number) {
    setDraft(arrayMove(roles, fromIndex, toIndex));
  }

  function handleDiscard() {
    setDraft(null);
    setReorderMode(false);
  }

  async function handleAddRole(role: {
    key: string;
    label: string;
    roleId: string;
  }) {
    await save({ roles: [...roles, role] });
    setDraft(null);
    setShowAddModal(false);
  }

  function confirmRemove() {
    if (pendingRemoveIndex === null) return;
    setDraft(roles.filter((_, i) => i !== pendingRemoveIndex));
    setPendingRemoveIndex(null);
  }

  async function onSave() {
    await save({ roles });
    setDraft(null);
    setReorderMode(false);
  }

  const { saveBarRef } = useUnsavedChanges({
    isDirty,
    onDiscard: handleDiscard,
  });

  if (loading) return <p className="muted">Loading…</p>;

  const removeMessage = pendingRole
    ? `Remove role "${pendingRole.key}"? This cannot be undone until you save.${
        pendingRoleUsed
          ? " This role is referenced in command permissions — removing it may break access rules."
          : ""
      }`
    : "";

  return (
    <>
      <PageHeader
        title="Roles"
        description="Named role keys map to Discord role snowflake IDs. Command permissions reference these keys. Role order controls hierarchy display in the dashboard."
      />
      <RestartBanner />
      {error ? <p className="status err">{error}</p> : null}
      {status ? <p className="status ok">{status}</p> : null}

      <div className="card stack">
        <div className="row row-between">
          <div className="row" style={{ gap: "0.5rem" }}>
            <button
              type="button"
              className="btn"
              disabled={reorderMode}
              onClick={() => setShowAddModal(true)}
            >
              Add role
            </button>
            <button
              type="button"
              className={`btn${reorderMode ? " btn-primary" : ""}`}
              onClick={() => setReorderMode((prev) => !prev)}
            >
              {reorderMode ? "Done reordering" : "Reorder"}
            </button>
          </div>
          <SaveActions
            saveBarRef={saveBarRef}
            isDirty={isDirty}
            saving={saving}
            onSave={onSave}
            onDiscard={handleDiscard}
            saveLabel="Save roles"
          />
        </div>

        <RolesSortableTable
          roles={roles}
          reorderMode={reorderMode}
          keyHelp={KEY_HELP}
          labelHelp={LABEL_HELP}
          roleIdHelp={ROLE_ID_HELP}
          onReorder={reorderRoles}
          onUpdateRole={updateRole}
          onRemove={setPendingRemoveIndex}
        />
      </div>

      <AddRoleModal
        open={showAddModal}
        saving={saving}
        existingKeys={roles.map((r) => r.key)}
        onCancel={() => setShowAddModal(false)}
        onAdd={handleAddRole}
      />

      <ConfirmModal
        open={pendingRemoveIndex !== null}
        title="Remove role"
        message={removeMessage}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemoveIndex(null)}
      />
    </>
  );
}
