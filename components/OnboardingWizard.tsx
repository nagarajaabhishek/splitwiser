"use client";

import { useState } from "react";

type GroupType = {
  id: string;
  name: string;
  members: Array<{ id: string; name: string }>;
};

type OnboardingWizardProps = {
  onCreated: (group: GroupType) => void;
  onClose?: () => void;
};

export function OnboardingWizard({ onCreated, onClose }: OnboardingWizardProps) {
  const [groupName, setGroupName] = useState("");
  const [memberInput, setMemberInput] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const addMember = () => {
    const name = memberInput.trim();
    if (!name) return;
    setMembers((prev) => [...prev, name]);
    setMemberInput("");
  };

  const createGroup = async () => {
    setError("");
    if (!groupName.trim() || members.length === 0) {
      setError("Group name and at least one member are required.");
      return;
    }

    setIsSaving(true);
    const response = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: groupName.trim(), members }),
    });
    const json = await response.json();
    setIsSaving(false);

    if (!response.ok) {
      setError(json.error ?? "Could not create group.");
      return;
    }

    onCreated(json.group);
    setGroupName("");
    setMembers([]);
    setMemberInput("");
  };

  return (
    <section className="glass-card onboarding-card">
      <h2>Create Household / Group</h2>
      <p className="muted">Set up a group and add member names to begin splitting expenses.</p>

      <label className="item-edit">
        Group Name
        <input className="text-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
      </label>

      <div className="chip-row" style={{ marginTop: "0.8rem" }}>
        <input
          className="text-input"
          style={{ flex: 1 }}
          placeholder="Add member name"
          value={memberInput}
          onChange={(event) => setMemberInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addMember();
            }
          }}
        />
        <button type="button" className="chip chip-active" onClick={addMember}>
          Add
        </button>
      </div>

      <div className="chip-row" style={{ marginTop: "0.7rem" }}>
        {members.map((member, index) => (
          <button
            key={`${member}-${index}`}
            type="button"
            className="chip"
            onClick={() => setMembers((prev) => prev.filter((_, i) => i !== index))}
          >
            {member} x
          </button>
        ))}
      </div>

      <div className="chip-row" style={{ marginTop: "1rem" }}>
        <button type="button" className="chip chip-active" onClick={createGroup} disabled={isSaving}>
          {isSaving ? "Creating..." : "Create Group"}
        </button>
        {onClose ? (
          <button type="button" className="chip" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
