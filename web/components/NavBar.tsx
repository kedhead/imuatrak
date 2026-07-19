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

  // Theme state mirrors the data-theme attribute the boot script set; read it
  // after mount so server and client render the same initial markup.
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private browsing — the choice just won't persist.
    }
    setTheme(next);
  };

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
        {theme && (
          <button
            onClick={toggleTheme}
            className="navbar-signout"
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            style={{ display: "flex", alignItems: "center" }}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        )}
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

function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
