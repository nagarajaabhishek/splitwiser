import { NextResponse } from "next/server";
import { z } from "zod";
import { createGroupWithMembers, listGroupsWithMembers } from "@/lib/db/groups";
import { schemaDriftMigrateHint } from "@/lib/db/schema-drift";

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
  try {
    const groups = await listGroupsWithMembers();
    return NextResponse.json({ groups });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list groups";
    const hint = schemaDriftMigrateHint(message);
    console.error("[api/groups GET]", message, error);
    return NextResponse.json(
      { error: message, hint: hint ?? "Check DATABASE_URL and run prisma migrate deploy." },
      { status: 503 },
    );
  }
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
    if (message === "DUPLICATE_GROUP_NAME" || message === "DUPLICATE_MEMBER_NAME") {
      return NextResponse.json({ error: message, code: message }, { status: 409 });
    }
    const hint = schemaDriftMigrateHint(message);
    if (hint) {
      console.error("[api/groups POST]", message, error);
      return NextResponse.json({ error: message, hint, code: "SCHEMA_DRIFT" }, { status: 503 });
    }
    return NextResponse.json({ error: message, code: message }, { status: 400 });
  }
}
