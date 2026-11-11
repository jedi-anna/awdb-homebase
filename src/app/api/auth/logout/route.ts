import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(new URL("/", process.env.APP_URL ?? req.nextUrl.origin), 303);
}
