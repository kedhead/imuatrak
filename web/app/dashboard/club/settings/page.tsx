"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getUserClub, updateClub, uploadClubLogo } from "@/lib/firebase";
import type { Club, MemberRole } from "@/lib/clubTypes";

export default function ClubSettingsPage() {
  const { user, loading } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    getUserClub(user.uid).then((ctx) => {
      if (!ctx) return;
      setClub(ctx.club);
      setMyRole(ctx.role);
      setName(ctx.club.name);
      setDescription(ctx.club.description ?? "");
      setCity(ctx.club.location?.city ?? "");
      setCountry(ctx.club.location?.country ?? "");
      setWebsiteUrl(ctx.club.websiteUrl ?? "");
      setLogoUrl(ctx.club.logoUrl ?? "");
    });
  }, [user]);

  const isAdmin = myRole === "owner" || myRole === "admin";

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!club || !isAdmin) return;
    setSaving(true);
    try {
      let finalLogoUrl = logoUrl;
      if (logoFile) {
        finalLogoUrl = await uploadClubLogo(club.id, logoFile);
        setLogoUrl(finalLogoUrl);
        setLogoFile(null);
      }
      await updateClub(club.id, {
        name: name.trim(),
        description: description.trim(),
        location: { city: city.trim(), country: country.trim() },
        websiteUrl: websiteUrl.trim() || undefined,
        logoUrl: finalLogoUrl || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="container"><p style={{ color: "var(--muted)" }}>Loading…</p></div>;
  if (!club) return <div className="container"><p style={{ color: "var(--muted)" }}>No club found. <Link href="/dashboard/club" style={{ color: "var(--blue-bright)" }}>← Back</Link></p></div>;
  if (!isAdmin) return <div className="container"><p style={{ color: "var(--muted)" }}>Admin access required.</p></div>;

  const subColor = club.subscriptionStatus === "active" ? "var(--teal)" : club.subscriptionStatus === "trial" ? "var(--blue-bright)" : "#ef4444";
  const displayLogo = logoPreview ?? (logoUrl || null);

  return (
    <main className="container">
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard/club" style={{ color: "var(--muted)", fontSize: 13 }}>← Club Dashboard</Link>
        <h1 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 800 }}>Club Settings</h1>
      </div>

      {/* Subscription */}
      <div className="card" style={{ marginBottom: 24, borderLeft: `4px solid ${subColor}` }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>Subscription</h2>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, color: subColor, textTransform: "capitalize", fontSize: 16 }}>{club.subscriptionStatus}</div>
            {club.subscriptionStatus === "trial" && club.trialEndsAt && (
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                Free trial ends {new Date(club.trialEndsAt).toLocaleDateString()}
              </div>
            )}
            {club.subscriptionStatus === "expired" && (
              <div style={{ fontSize: 13, color: "#ef4444", marginTop: 4 }}>
                Club features are locked. Upgrade to restore access.
              </div>
            )}
          </div>
          {club.subscriptionStatus !== "active" && (
            <div style={{ background: "var(--blue-bright)", color: "#fff", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, opacity: 0.7, cursor: "not-allowed" }}>
              Upgrade (coming soon)
            </div>
          )}
        </div>
      </div>

      {/* Club profile */}
      <div className="card">
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>Club Profile</h2>
        <form onSubmit={handleSave} style={{ display: "grid", gap: 18 }}>

          {/* Logo */}
          <div>
            <label style={labelStyle}>Club Logo</label>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 80, height: 80, borderRadius: "50%", overflow: "hidden",
                  border: "2px solid var(--line)", background: "var(--bg-soft)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {displayLogo ? (
                  <img src={displayLogo} alt="Club logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 32 }}>🏝️</span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleLogoChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ ...outlineBtn, fontSize: 13 }}
                >
                  {displayLogo ? "Change logo" : "Upload logo"}
                </button>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={() => { setLogoPreview(null); setLogoFile(null); }}
                    style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 12, cursor: "pointer", textAlign: "left" }}
                  >
                    ✕ Remove new photo
                  </button>
                )}
                <span style={{ fontSize: 12, color: "var(--muted)" }}>Square image, JPG or PNG recommended</span>
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Club Name *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Waikiki Beach Boys" />
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="About your club…" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} placeholder="City" />
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              <input value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle} placeholder="Country" />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Website</label>
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              style={inputStyle}
              placeholder="https://yourclub.com"
              type="url"
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="submit" disabled={saving}
              style={{ background: "var(--blue-bright)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontWeight: 700, cursor: "pointer", fontSize: 15 }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
            {saved && <span style={{ color: "var(--teal)", fontWeight: 600, fontSize: 14 }}>✓ Saved</span>}
          </div>
        </form>
      </div>

      {/* Danger zone */}
      <div style={{ marginTop: 32, padding: 20, border: "1px solid #ef4444", borderRadius: 12 }}>
        <h3 style={{ margin: "0 0 8px", color: "#ef4444", fontWeight: 700 }}>Danger Zone</h3>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 14 }}>
          To delete the club, remove all members first and contact support.
        </p>
      </div>
    </main>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 15, background: "var(--bg)", color: "var(--ink)", boxSizing: "border-box" };
const outlineBtn: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", cursor: "pointer", fontWeight: 600 };
