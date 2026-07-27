"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { InfoHelpIcon } from "@/components/InfoHelpIcon";

export type RoleEntry = { key: string; label: string; roleId: string };

type RolesSortableTableProps = {
  roles: RoleEntry[];
  reorderMode: boolean;
  keyHelp: string;
  labelHelp: string;
  roleIdHelp: string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onUpdateRole: (
    index: number,
    field: "key" | "label" | "roleId",
    value: string,
  ) => void;
  onRemove: (index: number) => void;
};

function roleSortId(role: RoleEntry, index: number) {
  return `${role.key}::${index}`;
}

function DragHandle({
  listeners,
  attributes,
}: {
  listeners: ReturnType<typeof useSortable>["listeners"];
  attributes: ReturnType<typeof useSortable>["attributes"];
}) {
  return (
    <button
      type="button"
      className="drag-handle"
      aria-label="Drag to reorder"
      {...listeners}
      {...attributes}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle cx="4.5" cy="3" r="1.25" />
        <circle cx="9.5" cy="3" r="1.25" />
        <circle cx="4.5" cy="7" r="1.25" />
        <circle cx="9.5" cy="7" r="1.25" />
        <circle cx="4.5" cy="11" r="1.25" />
        <circle cx="9.5" cy="11" r="1.25" />
      </svg>
    </button>
  );
}

function SortableRoleRow({
  role,
  index,
  reorderMode,
  onUpdateRole,
  onRemove,
}: {
  role: RoleEntry;
  index: number;
  reorderMode: boolean;
  onUpdateRole: RolesSortableTableProps["onUpdateRole"];
  onRemove: RolesSortableTableProps["onRemove"];
}) {
  const sortId = roleSortId(role, index);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortId, disabled: !reorderMode });

  const style = reorderMode
    ? {
        transform: CSS.Transform.toString(transform),
        transition,
      }
    : undefined;

  return (
    <tr
      ref={reorderMode ? setNodeRef : undefined}
      style={style}
      data-dragging={isDragging ? "true" : undefined}
    >
      {reorderMode ? (
        <td className="drag-handle-cell">
          <DragHandle listeners={listeners} attributes={attributes} />
        </td>
      ) : null}
      <td>
        <input
          className="input mono"
          value={role.key}
          readOnly={reorderMode}
          onChange={(e) =>
            onUpdateRole(index, "key", e.target.value.replace(/\s/g, ""))
          }
        />
      </td>
      <td>
        <input
          className="input"
          value={role.label}
          readOnly={reorderMode}
          onChange={(e) => onUpdateRole(index, "label", e.target.value)}
        />
      </td>
      <td>
        <input
          className="input mono"
          value={role.roleId}
          readOnly={reorderMode}
          onChange={(e) => onUpdateRole(index, "roleId", e.target.value)}
        />
      </td>
      {!reorderMode ? (
        <td>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => onRemove(index)}
          >
            Remove
          </button>
        </td>
      ) : null}
    </tr>
  );
}

function StaticRoleRow({
  role,
  index,
  onUpdateRole,
  onRemove,
}: {
  role: RoleEntry;
  index: number;
  onUpdateRole: RolesSortableTableProps["onUpdateRole"];
  onRemove: RolesSortableTableProps["onRemove"];
}) {
  return (
    <tr>
      <td>
        <input
          className="input mono"
          value={role.key}
          onChange={(e) =>
            onUpdateRole(index, "key", e.target.value.replace(/\s/g, ""))
          }
        />
      </td>
      <td>
        <input
          className="input"
          value={role.label}
          onChange={(e) => onUpdateRole(index, "label", e.target.value)}
        />
      </td>
      <td>
        <input
          className="input mono"
          value={role.roleId}
          onChange={(e) => onUpdateRole(index, "roleId", e.target.value)}
        />
      </td>
      <td>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => onRemove(index)}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

export function RolesSortableTable({
  roles,
  reorderMode,
  keyHelp,
  labelHelp,
  roleIdHelp,
  onReorder,
  onUpdateRole,
  onRemove,
}: RolesSortableTableProps) {
  const sortIds = roles.map((role, index) => roleSortId(role, index));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortIds.indexOf(String(active.id));
    const newIndex = sortIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(oldIndex, newIndex);
  }

  const tableHead = (
    <thead>
      <tr>
        {reorderMode ? <th aria-label="Reorder" /> : null}
        <th>
          <span className="th-with-help">
            Key
            <InfoHelpIcon content={keyHelp} />
          </span>
        </th>
        <th>
          <span className="th-with-help">
            Label
            <InfoHelpIcon content={labelHelp} />
          </span>
        </th>
        <th>
          <span className="th-with-help">
            Discord role ID
            <InfoHelpIcon content={roleIdHelp} />
          </span>
        </th>
        {!reorderMode ? <th /> : null}
      </tr>
    </thead>
  );

  if (!reorderMode) {
    return (
      <div className="table-wrap">
        <table className="data">
          {tableHead}
          <tbody>
            {roles.map((role, i) => (
              <StaticRoleRow
                key={`${role.key}-${i}`}
                role={role}
                index={i}
                onUpdateRole={onUpdateRole}
                onRemove={onRemove}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <p className="reorder-mode-hint muted">
        Drag rows to set hierarchy order. Save when done.
      </p>
      <div className="table-wrap">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="data">
            {tableHead}
            <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {roles.map((role, i) => (
                  <SortableRoleRow
                    key={sortIds[i]}
                    role={role}
                    index={i}
                    reorderMode={reorderMode}
                    onUpdateRole={onUpdateRole}
                    onRemove={onRemove}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      </div>
    </>
  );
}

export { arrayMove };
