import { NextResponse } from "next/server";
import { getBootstrapData } from "@/lib/db/bootstrap";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activeGroupId = searchParams.get("activeGroupId") ?? undefined;
  const bootstrap = await getBootstrapData(activeGroupId);
  return NextResponse.json(bootstrap);
}
