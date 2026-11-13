import { NextResponse } from "next/server";
import { pkcePair, randomState } from "@/lib/crypto";
import { env, SCOPES, X_AUTHORIZE_URL } from "@/lib/env";
import { saveOAuthTemp } from "@/lib/session";

export async function GET() {
  const { verifier, challenge } = pkcePair();
  const state = randomState();
  await saveOAuthTemp({ verifier, state, createdAt: Date.now() });

  const url = new URL(X_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", env.redirectUri);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(url);
}
