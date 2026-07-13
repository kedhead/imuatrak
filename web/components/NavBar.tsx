"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, signOut } from "@/lib/auth";
import { isAppAdmin } from "@/lib/firebase";

export default function NavBar() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setAdmin(false);
      return;
    }
    let cancelled = false;
    void isAppAdmin(user.uid).then((ok) => {
      if (!cancelled) setAdmin(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

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
                  className={pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/club") && !pathname.startsWith("/dashboard/admin") ? "navbar-link navbar-link-active" : "navbar-link"}
                >
                  My Sessions
                </Link>
                <Link
                  href="/dashboard/club"
                  className={pathname.startsWith("/dashboard/club") ? "navbar-link navbar-link-active" : "navbar-link"}
                >
                  Club
                </Link>
                {admin && (
                  <Link
                    href="/dashboard/admin"
                    className={pathname.startsWith("/dashboard/admin") ? "navbar-link navbar-link-active" : "navbar-link"}
                  >
                    Admin
                  </Link>
                )}
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
