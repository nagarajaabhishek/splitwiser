import type { Member } from "@/lib/schemas/bill";
import { getGroupWithMembers, listGroupsWithMembers, type GroupWithMembers } from "@/lib/db/groups";

export async function getBootstrapData(activeGroupId?: string): Promise<{
  groups: GroupWithMembers[];
  activeGroupId: string | null;
  members: Member[];
  needsOnboarding: boolean;
}> {
  const groups = await listGroupsWithMembers();
  if (groups.length === 0) {
    return { groups: [], activeGroupId: null, members: [], needsOnboarding: true };
  }

  const selectedId = activeGroupId && groups.some((group) => group.id === activeGroupId) ? activeGroupId : groups[0].id;
  const activeGroup = (await getGroupWithMembers(selectedId)) ?? groups[0];

  return {
    groups,
    activeGroupId: activeGroup.id,
    members: activeGroup.members.map((member) => ({
      id: member.id,
      name: member.name,
      dietaryStyle: member.dietaryStyle,
      allergies: member.allergies,
      exclusions: member.exclusions,
    })),
    needsOnboarding: false,
  };
}
