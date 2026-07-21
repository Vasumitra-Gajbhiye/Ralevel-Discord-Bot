"use client";

import { useMemo, useState } from "react";
import { AddRoleModal } from "@/components/AddRoleModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageHeader, RestartBanner } from "@/components/PageHeader";
import { useGuildConfig } from "@/lib/useGuildConfig";

export default function RolesPage() {
  const { config, loading, error, saving, status, save } = useGuildConfig();
  const [draft, setDraft] = useState<
    { key: string; label: string; roleId: string }[] | null
  >(null);
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null,
  );
  const [showAddModal, setShowAddModal] = useState(false);

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
  }

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
        description="Named role keys map to Discord role snowflake IDs. Command permissions reference these keys."
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
            Add role
          </button>
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
              {saving ? "Saving…" : "Save roles"}
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Key</th>
                <th>Label</th>
                <th>Discord role ID</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((role, i) => (
                <tr key={`${role.key}-${i}`}>
                  <td>
                    <input
                      className="input mono"
                      value={role.key}
                      onChange={(e) => updateRole(i, "key", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={role.label}
                      onChange={(e) => updateRole(i, "label", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="input mono"
                      value={role.roleId}
                      onChange={(e) => updateRole(i, "roleId", e.target.value)}
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
