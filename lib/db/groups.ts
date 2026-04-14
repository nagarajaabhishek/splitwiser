import { prisma } from "@/lib/db/prisma";

export type GroupWithMembers = {
  id: string;
  name: string;
  members: Array<{
    id: string;
    name: string;
    dietaryStyle: string | null;
    allergies: string[];
    exclusions: string[];
  }>;
};

function norm(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

type MemberInput = {
  name: string;
  dietaryStyle?: string | null;
  allergies?: string[];
  exclusions?: string[];
};

function normalizeMemberProfile(input: MemberInput) {
  return {
    name: input.name.trim(),
    dietaryStyle: input.dietaryStyle?.trim() || null,
    allergies: (input.allergies ?? []).map((entry) => entry.trim()).filter(Boolean),
    exclusions: (input.exclusions ?? []).map((entry) => entry.trim()).filter(Boolean),
  };
}

function mapMember(member: {
  id: string;
  name: string;
  dietaryStyle: string | null;
  allergies: unknown;
  exclusions: unknown;
}) {
  return {
    id: member.id,
    name: member.name,
    dietaryStyle: member.dietaryStyle,
    allergies: Array.isArray(member.allergies) ? member.allergies.filter((entry): entry is string => typeof entry === "string") : [],
    exclusions: Array.isArray(member.exclusions) ? member.exclusions.filter((entry): entry is string => typeof entry === "string") : [],
  };
}

export async function listGroupsWithMembers(): Promise<GroupWithMembers[]> {
  const groups = await prisma.household.findMany({
    orderBy: { createdAt: "asc" },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    members: group.members.map((member) => mapMember(member)),
  }));
}

export async function getGroupWithMembers(groupId: string): Promise<GroupWithMembers | null> {
  const group = await prisma.household.findUnique({
    where: { id: groupId },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });

  if (!group) {
    return null;
  }

  return {
    id: group.id,
    name: group.name,
    members: group.members.map((member) => mapMember(member)),
  };
}

export async function createGroupWithMembers(input: {
  name: string;
  members: Array<string | MemberInput>;
}): Promise<GroupWithMembers> {
  const name = input.name.trim();
  if (!name) throw new Error("GROUP_NAME_REQUIRED");

  const existingGroups = await prisma.household.findMany({ select: { name: true } });
  if (existingGroups.some((g) => norm(g.name) === norm(name))) {
    throw new Error("DUPLICATE_GROUP_NAME");
  }

  const rawMembers = input.members
    .map((entry) => (typeof entry === "string" ? { name: entry } : entry))
    .map((entry) => normalizeMemberProfile(entry))
    .filter((entry) => entry.name.length > 0);
  if (rawMembers.length === 0) throw new Error("GROUP_MEMBERS_REQUIRED");
  const normalizedMembers = rawMembers.map((entry) => norm(entry.name));
  if (new Set(normalizedMembers).size !== normalizedMembers.length) {
    throw new Error("DUPLICATE_MEMBER_NAME");
  }

  const created = await prisma.household.create({
    data: {
      name,
      members: {
        create: rawMembers.map((member) => ({
          name: member.name,
          dietaryStyle: member.dietaryStyle,
          allergies: member.allergies,
          exclusions: member.exclusions,
        })),
      },
    },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });

  return {
    id: created.id,
    name: created.name,
    members: created.members.map((member) => mapMember(member)),
  };
}

export async function renameGroup(groupId: string, name: string): Promise<GroupWithMembers | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existingGroups = await prisma.household.findMany({ select: { id: true, name: true } });
  if (existingGroups.some((g) => g.id !== groupId && norm(g.name) === norm(trimmed))) {
    throw new Error("DUPLICATE_GROUP_NAME");
  }
  const updated = await prisma.household.update({
    where: { id: groupId },
    data: { name: trimmed },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });
  return {
    id: updated.id,
    name: updated.name,
    members: updated.members.map((member) => mapMember(member)),
  };
}

export async function addGroupMember(groupId: string, input: string | MemberInput): Promise<GroupWithMembers | null> {
  const profile = normalizeMemberProfile(typeof input === "string" ? { name: input } : input);
  const name = profile.name;
  if (!name) return null;
  const group = await prisma.household.findUnique({
    where: { id: groupId },
    include: { members: { select: { name: true } } },
  });
  if (!group) return null;
  if (group.members.some((m) => norm(m.name) === norm(name))) {
    throw new Error("DUPLICATE_MEMBER_NAME");
  }
  const updated = await prisma.household.update({
    where: { id: groupId },
    data: {
      members: {
        create: {
          name,
          dietaryStyle: profile.dietaryStyle,
          allergies: profile.allergies,
          exclusions: profile.exclusions,
        },
      },
    },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });
  return {
    id: updated.id,
    name: updated.name,
    members: updated.members.map((member) => mapMember(member)),
  };
}

export async function updateGroupMemberProfile(
  groupId: string,
  memberId: string,
  profile: { dietaryStyle?: string | null; allergies?: string[]; exclusions?: string[] },
): Promise<GroupWithMembers | null> {
  const group = await prisma.household.findUnique({
    where: { id: groupId },
    include: { members: { select: { id: true } } },
  });
  if (!group) return null;
  if (!group.members.some((member) => member.id === memberId)) return null;

  await prisma.member.update({
    where: { id: memberId },
    data: {
      dietaryStyle: profile.dietaryStyle?.trim() || null,
      allergies: (profile.allergies ?? []).map((entry) => entry.trim()).filter(Boolean),
      exclusions: (profile.exclusions ?? []).map((entry) => entry.trim()).filter(Boolean),
    },
  });
  return getGroupWithMembers(groupId);
}

export async function removeGroupMember(groupId: string, memberId: string): Promise<GroupWithMembers | null> {
  const group = await prisma.household.findUnique({
    where: { id: groupId },
    include: { members: true },
  });
  if (!group) return null;
  if (group.members.length <= 1) {
    throw new Error("GROUP_NEEDS_ONE_MEMBER");
  }
  const member = group.members.find((entry) => entry.id === memberId);
  if (!member) return null;
  await prisma.member.delete({ where: { id: memberId } });
  const refreshed = await getGroupWithMembers(groupId);
  return refreshed;
}

export async function deleteGroup(groupId: string): Promise<boolean> {
  const count = await prisma.household.count();
  if (count <= 1) {
    throw new Error("CANNOT_DELETE_LAST_GROUP");
  }
  await prisma.household.delete({ where: { id: groupId } });
  return true;
}
