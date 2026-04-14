import { NextResponse } from "next/server";
import { z } from "zod";
import { createGroupWithMembers, listGroupsWithMembers } from "@/lib/db/groups";

const createGroupSchema = z.object({
  name: z.string().min(1),
  members: z.array(z.string().min(1)).min(1),
});

export async function GET() {
  const groups = await listGroupsWithMembers();
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  try {
    const payload = createGroupSchema.parse(await request.json());
    const group = await createGroupWithMembers(payload);
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid group payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
