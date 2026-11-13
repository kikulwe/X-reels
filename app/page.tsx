import Feed from "@/components/Feed";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();
  const { error } = await searchParams;

  if (session) {
    return <Feed user={{ username: session.user.username, avatar: session.user.profileImageUrl }} />;
  }

  return (
    <main className="landing">
      <div className="landing-card">
        <div className="logo">▶</div>
        <h1>X Reels</h1>
        <p>Swipe through videos from the accounts you follow on X, one full-screen clip at a time.</p>
        {error && <p className="landing-error">{error}</p>}
        <a className="btn-primary" href="/api/auth/login">Log in with X</a>
        <p className="fineprint">
          Uses the official X API. X does not offer its algorithmic &ldquo;For You&rdquo; feed to third-party
          apps, so this shows videos from your Following timeline instead.
        </p>
      </div>
    </main>
  );
}
