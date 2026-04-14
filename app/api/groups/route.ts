import { NextResponse } from "next/server";
import { z } from "zod";
import { createGroupWithMembers, listGroupsWithMembers } from "@/lib/db/groups";

const memberInputSchema = z.object({
  name: z.string().min(1),
  dietaryStyle: z.string().optional().nullable(),
  allergies: z.array(z.string()).optional().nullable(),
  exclusions: z.array(z.string()).optional().nullable(),
});

const createGroupSchema = z.object({
  name: z.string().min(1),
  members: z.array(z.union([z.string().min(1), memberInputSchema])).min(1),
});

export async function GET() {
  const groups = await listGroupsWithMembers();
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  try {
    const payload = createGroupSchema.parse(await request.json());
    const normalizedPayload = {
      ...payload,
      members: payload.members.map((member) =>
        typeof member === "string"
          ? member
          : {
              name: member.name,
              dietaryStyle: member.dietaryStyle,
              allergies: member.allergies ?? undefined,
              exclusions: member.exclusions ?? undefined,
            },
      ),
    };
    const group = await createGroupWithMembers(normalizedPayload);
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid group payload";
    const status =
      message === "DUPLICATE_GROUP_NAME" || message === "DUPLICATE_MEMBER_NAME" ? 409 : 400;
    return NextResponse.json({ error: message, code: message }, { status });
  }
}
