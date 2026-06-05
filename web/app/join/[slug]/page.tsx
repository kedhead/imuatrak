import type { Metadata } from "next";
import Link from "next/link";
import { getClubByIdOrSlug } from "@/lib/firebase";
import OpenInApp from "./OpenInApp";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClubByIdOrSlug(slug).catch(() => null);
  if (!club) return { title: "Join a club — ImuaTrak" };
  return {
    title: `Join ${club.name} — ImuaTrak`,
    description: `You've been invited to join ${club.name} on ImuaTrak.`,
    openGraph: {
      title: `Join ${club.name} on ImuaTrak`,
      description: club.description || `${club.location.city}, ${club.location.country}`,
    },
  };
}

export default async function JoinClubPage({ params }: Props) {
  const { slug } = await params;
  const club = await getClubByIdOrSlug(slug).catch(() => null);

  // Even if we can't resolve the club server-side, still let the visitor
  // bounce into the app — the app does the real lookup + join while signed in.
  if (!club) {
    return (
      <main className="container" style={{ maxWidth: 520, paddingTop: 64 }}>
        <div className="card" style={{ textAlign: "center", padding: "40px 28px" }}>
          <h1 style={{ fontSize: 26, margin: "0 0 8px", fontWeight: 800 }}>
            You&apos;ve been invited
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
            Open this invite in the ImuaTrak app to join the club.
          </p>
          <OpenInApp identifier={slug} />
          <p style={{ marginTop: 24, fontSize: 13 }}>
            <Link href="/">Back to ImuaTrak</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="container" style={{ maxWidth: 520, paddingTop: 64 }}>
      <div className="card" style={{ textAlign: "center", padding: "40px 28px" }}>
        <p
          style={{
            color: "var(--blue-bright)",
            fontWeight: 600,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            fontSize: 11,
            margin: "0 0 10px",
          }}
        >
          You&apos;re invited to join
        </p>

        {/* Club logo or initial */}
        {club.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={club.logoUrl}
            alt={club.name}
            width={84}
            height={84}
            style={{
              borderRadius: 20,
              objectFit: "cover",
              margin: "0 auto 16px",
              display: "block",
              border: "1px solid var(--line)",
            }}
          />
        ) : (
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 20,
              margin: "0 auto 16px",
              display: "grid",
              placeItems: "center",
              fontSize: 34,
              fontWeight: 800,
              color: "#fff",
              background: "linear-gradient(135deg, #2563eb, #0ea5b7)",
            }}
          >
            {club.name.charAt(0).toUpperCase()}
          </div>
        )}

        <h1 style={{ fontSize: 28, margin: "0 0 6px", fontWeight: 800 }}>{club.name}</h1>
        <p className="muted" style={{ margin: "0 0 4px", fontSize: 14 }}>
          {club.location.city}
          {club.location.city && club.location.country ? ", " : ""}
          {club.location.country}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {club.memberCount} {club.memberCount === 1 ? "member" : "members"}
        </p>

        {club.description ? (
          <p style={{ marginTop: 16, fontSize: 15, lineHeight: 1.6, color: "var(--muted)" }}>
            {club.description}
          </p>
        ) : null}

        <OpenInApp identifier={club.id} />

        <p style={{ marginTop: 24, fontSize: 13 }}>
          <Link href="/">What is ImuaTrak?</Link>
        </p>
      </div>
    </main>
  );
}
