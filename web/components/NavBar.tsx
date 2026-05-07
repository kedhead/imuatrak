"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, signOut } from "@/lib/auth";

export default function NavBar() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  return (
    <nav className="navbar">
      <Link href="/" className="navbar-logo">
        ImuaTrak
      </Link>

      <div className="navbar-links">
        {!loading && (
          <>
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className={pathname.startsWith("/dashboard") ? "navbar-link navbar-link-active" : "navbar-link"}
                >
                  My Sessions
                </Link>
                <button onClick={handleSignOut} className="navbar-signout">
                  Sign out
                </button>
                {user.photoURL && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.photoURL}
                    alt={user.displayName ?? ""}
                    width={28}
                    height={28}
                    style={{ borderRadius: "50%", objectFit: "cover" }}
                  />
                )}
              </>
            ) : (
              <Link href="/login" className="btn" style={{ fontSize: 14, padding: "8px 18px" }}>
                Sign in
              </Link>
            )}
          </>
        )}
      </div>
    </nav>
  );
}
