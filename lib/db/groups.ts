import { prisma } from "@/lib/db/prisma";

export type GroupWithMembers = {
  id: string;
  name: string;
  members: Array<{ id: string; name: string }>;
};

export async function listGroupsWithMembers(): Promise<GroupWithMembers[]> {
  const groups = await prisma.household.findMany({
    orderBy: { createdAt: "asc" },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    members: group.members.map((member) => ({ id: member.id, name: member.name })),
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
    members: group.members.map((member) => ({ id: member.id, name: member.name })),
  };
}

export async function createGroupWithMembers(input: {
  name: string;
  members: string[];
}): Promise<GroupWithMembers> {
  const created = await prisma.household.create({
    data: {
      name: input.name.trim(),
      members: {
        create: input.members
          .map((member) => member.trim())
          .filter(Boolean)
          .map((name) => ({ name })),
      },
    },
    include: { members: { orderBy: { createdAt: "asc" } } },
  });

  return {
    id: created.id,
    name: created.name,
    members: created.members.map((member) => ({ id: member.id, name: member.name })),
  };
}
