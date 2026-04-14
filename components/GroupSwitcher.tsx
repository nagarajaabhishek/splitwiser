"use client";

type GroupType = {
  id: string;
  name: string;
  members: Array<{ id: string; name: string }>;
};

type GroupSwitcherProps = {
  groups: GroupType[];
  activeGroupId: string | null;
  onSelect: (groupId: string) => void;
  onOpenManager: () => void;
};

export function GroupSwitcher({ groups, activeGroupId, onSelect, onOpenManager }: GroupSwitcherProps) {
  return (
    <section className="glass-card">
      <h2>Active Group</h2>
      <p className="muted">Switch between households/groups.</p>
      <div className="chip-row" style={{ marginTop: "0.8rem" }}>
        <select
          className="text-input"
          value={activeGroupId ?? ""}
          onChange={(event) => onSelect(event.target.value)}
          style={{ marginTop: 0, maxWidth: 320 }}
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <button type="button" className="chip" onClick={onOpenManager}>
          New Group
        </button>
      </div>
    </section>
  );
}
