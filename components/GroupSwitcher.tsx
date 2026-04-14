"use client";
import { useMemo, useState } from "react";

type GroupType = {
  id: string;
  name: string;
  members: Array<{
    id: string;
    name: string;
    dietaryStyle?: string | null;
    allergies?: string[];
    exclusions?: string[];
  }>;
};

type GroupSwitcherProps = {
  groups: GroupType[];
  activeGroupId: string | null;
  onSelect: (groupId: string) => void;
  onOpenManager: () => void;
  onRename: (groupId: string, name: string) => void;
  onAddMember: (groupId: string, memberName: string) => void;
  onRemoveMember: (groupId: string, memberId: string) => void;
  onUpdateMemberProfile: (
    groupId: string,
    memberId: string,
    profile: { dietaryStyle?: string | null; allergies?: string[]; exclusions?: string[] },
  ) => void;
  onDeleteGroup: (groupId: string) => void;
  message?: string;
};

export function GroupSwitcher({
  groups,
  activeGroupId,
  onSelect,
  onOpenManager,
  onRename,
  onAddMember,
  onRemoveMember,
  onUpdateMemberProfile,
  onDeleteGroup,
  message,
}: GroupSwitcherProps) {
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  const [renameValue, setRenameValue] = useState(activeGroup?.name ?? "");
  const [newMemberValue, setNewMemberValue] = useState("");
  const renameChanged = useMemo(
    () => Boolean(activeGroup && renameValue.trim() && renameValue.trim() !== activeGroup.name),
    [activeGroup, renameValue],
  );

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
      {activeGroup ? (
        <div style={{ marginTop: "0.8rem" }}>
          <details className="collapsible" open>
            <summary>Manage Group</summary>
            <p className="muted">Edit group name</p>
          <div className="chip-row">
            <input
              className="text-input"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              style={{ marginTop: 0, maxWidth: 320 }}
            />
            <button
              type="button"
              className="chip chip-active"
              disabled={!renameChanged}
              onClick={() => onRename(activeGroup.id, renameValue)}
            >
              Save Name
            </button>
            <button
              type="button"
              className="chip chip-danger"
              onClick={() => {
                if (confirm("Delete this group? This cannot be undone.")) onDeleteGroup(activeGroup.id);
              }}
            >
              Delete Group
            </button>
          </div>
          <div className="chip-row" style={{ marginTop: "0.6rem" }}>
            {activeGroup.members.map((member) => (
              <button
                key={member.id}
                type="button"
                className="chip"
                onClick={() => {
                  if (confirm(`Remove ${member.name} from this group?`)) onRemoveMember(activeGroup.id, member.id);
                }}
              >
                {member.name} x
              </button>
            ))}
          </div>
          <div className="items-table" style={{ marginTop: "0.6rem" }}>
            {activeGroup.members.map((member) => (
              <article key={`${member.id}-profile`} className="item-row">
                <div style={{ minWidth: 140 }}>
                  <p className="item-label">{member.name}</p>
                </div>
                <div className="editor-grid" style={{ marginTop: 0, flex: 1 }}>
                  <input
                    className="text-input"
                    defaultValue={member.dietaryStyle ?? ""}
                    placeholder="Dietary style"
                    onBlur={(event) =>
                      onUpdateMemberProfile(activeGroup.id, member.id, {
                        dietaryStyle: event.target.value,
                        allergies: member.allergies ?? [],
                        exclusions: member.exclusions ?? [],
                      })
                    }
                  />
                  <input
                    className="text-input"
                    defaultValue={(member.allergies ?? []).join(", ")}
                    placeholder="Allergies"
                    onBlur={(event) =>
                      onUpdateMemberProfile(activeGroup.id, member.id, {
                        dietaryStyle: member.dietaryStyle ?? "",
                        allergies: event.target.value.split(",").map((entry) => entry.trim()).filter(Boolean),
                        exclusions: member.exclusions ?? [],
                      })
                    }
                  />
                  <input
                    className="text-input"
                    defaultValue={(member.exclusions ?? []).join(", ")}
                    placeholder="Exclusions"
                    onBlur={(event) =>
                      onUpdateMemberProfile(activeGroup.id, member.id, {
                        dietaryStyle: member.dietaryStyle ?? "",
                        allergies: member.allergies ?? [],
                        exclusions: event.target.value.split(",").map((entry) => entry.trim()).filter(Boolean),
                      })
                    }
                  />
                </div>
              </article>
            ))}
          </div>
          <p className="muted" style={{ marginTop: "0.5rem" }}>Add member</p>
          <div className="chip-row" style={{ marginTop: "0.6rem" }}>
            <input
              className="text-input"
              placeholder="Add member"
              value={newMemberValue}
              onChange={(event) => setNewMemberValue(event.target.value)}
              style={{ marginTop: 0, maxWidth: 220 }}
            />
            <button
              type="button"
              className="chip chip-active"
              disabled={!newMemberValue.trim()}
              onClick={() => {
                onAddMember(activeGroup.id, newMemberValue);
                setNewMemberValue("");
              }}
            >
              Add Member
            </button>
          </div>
          {message ? <p className={message.toLowerCase().includes("failed") || message.toLowerCase().includes("duplicate") ? "error" : "muted"} style={{ marginTop: "0.5rem" }}>{message}</p> : null}
          </details>
        </div>
      ) : null}
    </section>
  );
}
