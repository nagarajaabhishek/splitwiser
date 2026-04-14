import { NextResponse } from "next/server";
import { z } from "zod";
import { addGroupMember, deleteGroup, removeGroupMember, renameGroup, updateGroupMemberProfile } from "@/lib/db/groups";

const memberInputSchema = z.object({
  name: z.string().min(1),
  dietaryStyle: z.string().optional().nullable(),
  allergies: z.array(z.string()).optional().nullable(),
  exclusions: z.array(z.string()).optional().nullable(),
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  addMemberName: z.union([z.string().min(1), memberInputSchema]).optional(),
  removeMemberId: z.string().min(1).optional(),
  updateMemberProfile: z
    .object({
      memberId: z.string().min(1),
      dietaryStyle: z.string().optional().nullable(),
      allergies: z.array(z.string()).optional().nullable(),
      exclusions: z.array(z.string()).optional().nullable(),
    })
    .optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await context.params;
    const payload = patchSchema.parse(await request.json());

    let updated = null;
    if (payload.name) {
      updated = await renameGroup(groupId, payload.name);
    }
    if (payload.addMemberName) {
      const memberInput =
        typeof payload.addMemberName === "string"
          ? payload.addMemberName
          : {
              name: payload.addMemberName.name,
              dietaryStyle: payload.addMemberName.dietaryStyle,
              allergies: payload.addMemberName.allergies ?? undefined,
              exclusions: payload.addMemberName.exclusions ?? undefined,
            };
      updated = await addGroupMember(groupId, memberInput);
    }
    if (payload.removeMemberId) {
      updated = await removeGroupMember(groupId, payload.removeMemberId);
    }
    if (payload.updateMemberProfile) {
      updated = await updateGroupMemberProfile(groupId, payload.updateMemberProfile.memberId, {
        dietaryStyle: payload.updateMemberProfile.dietaryStyle,
        allergies: payload.updateMemberProfile.allergies ?? [],
        exclusions: payload.updateMemberProfile.exclusions ?? [],
      });
    }
    if (!updated) {
      return NextResponse.json({ error: "No valid patch operation provided" }, { status: 400 });
    }
    return NextResponse.json({ group: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Group update failed";
    const status =
      message === "DUPLICATE_GROUP_NAME" || message === "DUPLICATE_MEMBER_NAME" || message === "GROUP_NEEDS_ONE_MEMBER"
        ? 409
        : 400;
    return NextResponse.json({ error: message, code: message }, { status });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ groupId: string }> }) {
  try {
    const { groupId } = await context.params;
    await deleteGroup(groupId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Group delete failed";
    const status = message === "CANNOT_DELETE_LAST_GROUP" ? 409 : 400;
    return NextResponse.json({ error: message, code: message }, { status });
  }
}
