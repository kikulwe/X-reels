import { NextResponse, type NextRequest } from "next/server";
import { env, X_REVOKE_URL } from "@/lib/env";
import { clearSession, getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (s) {
    // Best-effort token revocation at X
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (env.clientSecret) headers.Authorization = "Basic " + Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
    await fetch(X_REVOKE_URL, {
      method: "POST",
      headers,
      body: new URLSearchParams({ token: s.accessToken, token_type_hint: "access_token", client_id: env.clientId }),
    }).catch(() => {});
  }
  await clearSession();
  return NextResponse.redirect(new URL("/", req.url), 303);
}
