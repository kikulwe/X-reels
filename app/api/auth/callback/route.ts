import { NextResponse, type NextRequest } from "next/server";
import { saveSession, takeOAuthTemp } from "@/lib/session";
import { exchangeCode, xGet } from "@/lib/x";

function fail(req: NextRequest, reason: string) {
  return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(reason)}`, req.url));
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return fail(req, p.get("error") === "access_denied" ? "Login cancelled" : "X returned an error");

  const code = p.get("code");
  const state = p.get("state");
  const temp = await takeOAuthTemp();
  if (!code || !state || !temp) return fail(req, "Login session expired, try again");
  if (state !== temp.state) return fail(req, "State mismatch (possible CSRF), try again");

  try {
    const t = await exchangeCode(code, temp.verifier);
    const me = await xGet<{ data: { id: string; username: string; name: string; profile_image_url?: string } }>(
      t.access_token,
      "/users/me",
      { "user.fields": "profile_image_url" },
    );
    await saveSession({
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: Date.now() + t.expires_in * 1000,
      user: {
        id: me.data.id,
        username: me.data.username,
        name: me.data.name,
        profileImageUrl: me.data.profile_image_url,
      },
    });
    return NextResponse.redirect(new URL("/", req.url));
  } catch (e) {
    console.error("OAuth callback failed", e);
    return fail(req, "Could not complete login with X");
  }
}
