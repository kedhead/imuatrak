"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getClubMembers, getUserClub } from "@/lib/firebase";
import type { Club, ClubMember, MemberRole } from "@/lib/clubTypes";
import {
  addPayItem,
  addPayMethod,
  canManagePayments,
  cancelMyPayOrder,
  clubIsPro,
  createPayOrder,
  deletePayItem,
  deletePayMethod,
  deletePayOrder,
  duesStatusByMember,
  formatMoney,
  isSoldOut,
  NO_OPTION,
  ORDER_METHOD_CASH,
  orderMethodLabel,
  ordersToCsv,
  orderTotals,
  parseMoney,
  PAY_DESC_MAX,
  PAY_HANDLE_MAX,
  PAY_INSTRUCTIONS_MAX,
  PAY_ITEM_KIND_INFO,
  PAY_METHOD_INFO,
  PAY_NOTE_MAX,
  PAY_OPTION_MAX,
  PAY_OPTIONS_MAX,
  PAY_QTY_MAX,
  PAY_STOCK_MAX,
  PAY_TITLE_MAX,
  payLink,
  payMethodName,
  paymentMemo,
  remainingStock,
  setPayOrderStatus,
  sortOrders,
  subscribePayItems,
  subscribePayMethods,
  subscribePayOrders,
  updatePayItem,
  updatePayMethod,
  uploadPayQr,
  type DuesStatus,
  type PayItem,
  type PayItemDraft,
  type PayItemKind,
  type PayMethod,
  type PayMethodDraft,
  type PayMethodKind,
  type PayOrder,
  type PayOrderStatus,
} from "@/lib/payments";

type Tab = "pay" | "orders" | "dues" | "items" | "methods";

interface Ctx {
  club: Club;
  role: MemberRole;
}

/** Dues & Store: members pay; treasurers confirm, track dues, manage items. */
export default function PaymentsPage() {
  const { user, loading } = useAuth();
  const [ctx, setCtx] = useState<Ctx | null | "none">(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [items, setItems] = useState<PayItem[] | null>(null);
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [mine, setMine] = useState<PayOrder[]>([]);
  const [all, setAll] = useState<PayOrder[] | null>(null);
  const [tab, setTab] = useState<Tab>("pay");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getUserClub(user.uid).then((r) => {
      if (!r) return setCtx("none");
      setCtx({ club: r.club, role: r.role });
      getClubMembers(r.club.id).then(setMembers).catch(() => undefined);
    });
  }, [user]);

  const club = ctx && ctx !== "none" ? ctx.club : null;
  const clubId = club?.id ?? null;
  const pro = clubIsPro(club);
  const me = members.find((m) => m.uid === user?.uid);
  const isManager = ctx && ctx !== "none" ? canManagePayments(ctx.role, me) : false;
  const onErr = (e: Error) => setError(e.message);

  useEffect(() => {
    if (!clubId || !pro) return;
    return subscribePayItems(clubId, setItems, onErr);
  }, [clubId, pro]);
  useEffect(() => {
    if (!clubId || !pro) return;
    return subscribePayMethods(clubId, setMethods, onErr);
  }, [clubId, pro]);
  useEffect(() => {
    if (!clubId || !pro || !user) return;
    return subscribePayOrders(clubId, { uid: user.uid }, setMine, onErr);
  }, [clubId, pro, user]);
  useEffect(() => {
    if (!clubId || !pro || !isManager) return;
    return subscribePayOrders(clubId, { all: true }, setAll, onErr);
  }, [clubId, pro, isManager]);

  // Treasurers land on what needs doing.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (landed || !isManager || !all) return;
    setLanded(true);
    if (all.some((o) => o.status === "pending")) setTab("orders");
  }, [landed, isManager, all]);

  if (loading || ctx === null) return <Shell><p className="muted">Loading…</p></Shell>;
  if (!user) return <Shell><p>Please <Link href="/login" style={{ color: "var(--blue-bright)" }}>sign in</Link>.</p></Shell>;
  if (ctx === "none" || !club) return <Shell><p className="muted">Join a club in the app first.</p></Shell>;
  if (!pro) return <Shell><ProLock canUpgrade={ctx.role === "owner" || ctx.role === "admin"} /></Shell>;

  const totals = orderTotals(all ?? []);
  const myName = me?.displayName ?? user.displayName ?? "Member";

  const tabs: [Tab, string][] = [
    ["pay", "Pay"],
    ...(isManager
      ? ([
          ["orders", `Payments${totals.pendingCount ? ` · ${totals.pendingCount} to confirm` : ""}`],
          ["dues", "Dues tracker"],
          ["items", "Items"],
          ["methods", "Ways to pay"],
        ] as [Tab, string][])
      : []),
  ];

  return (
    <Shell>
      {error && (
        <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid var(--danger)", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{error}</span>
          <button style={linkBtn} onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {tabs.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {tabs.map(([t, label]) => (
            <button key={t} style={pill(tab === t)} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>
      )}

      {tab === "pay" && (
        <PayTab
          clubId={club.id}
          items={items}
          methods={methods}
          mine={mine}
          uid={user.uid}
          myName={myName}
          isManager={isManager}
          onSetup={() => setTab("items")}
          onError={setError}
        />
      )}
      {tab === "orders" && isManager && (
        <OrdersTab clubId={club.id} clubName={club.name} orders={all} items={items ?? []} members={members} uid={user.uid} onError={setError} />
      )}
      {tab === "dues" && isManager && (
        <DuesTab clubId={club.id} items={items ?? []} orders={all ?? []} members={members} uid={user.uid} onError={setError} />
      )}
      {tab === "items" && isManager && <ItemsTab clubId={club.id} items={items ?? []} uid={user.uid} onError={setError} />}
      {tab === "methods" && isManager && <MethodsTab clubId={club.id} methods={methods} onError={setError} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="container" style={{ paddingBottom: 80 }}>
      <Link href="/dashboard/club" style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none" }}>← Club Dashboard</Link>
      <h1 style={{ margin: "8px 0 20px", fontSize: 28, fontWeight: 800 }}>Dues & Store</h1>
      {children}
    </main>
  );
}

function ProLock({ canUpgrade }: { canUpgrade: boolean }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: 32 }}>
      <div style={{ fontSize: 44 }}>💳</div>
      <h2 style={{ margin: "8px 0" }}>Dues & Store is an ImuaTrak+ feature</h2>
      <p className="muted" style={{ maxWidth: 520, margin: "0 auto" }}>
        Collect dues and sell club merch with the payment apps you already use (Zelle, Venmo, PayPal, Cash App).
        Members tap “I paid”, your treasurer confirms, and stock counts itself. No fees: ImuaTrak never touches the money.
      </p>
      <p style={{ marginTop: 16, fontWeight: 700, color: "var(--blue-bright)" }}>
        {canUpgrade ? (
          <Link href="/dashboard/club/settings" style={{ color: "var(--blue-bright)" }}>Upgrade your club →</Link>
        ) : (
          "Ask a club owner or admin to upgrade."
        )}
      </p>
    </div>
  );
}

function Chip({ status }: { status: PayOrderStatus | "unpaid" }) {
  const look = {
    confirmed: ["Paid", "var(--success)"],
    pending: ["Pending", "var(--sunset)"],
    cancelled: ["Withdrawn", "var(--muted)"],
    unpaid: ["Unpaid", "var(--coral)"],
  }[status];
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: look[1], border: `1px solid ${look[1]}`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>
      {look[0]}
    </span>
  );
}

// ─── Pay (members) ──────────────────────────────────────────────────────────

function PayTab({
  clubId,
  items,
  methods,
  mine,
  uid,
  myName,
  isManager,
  onSetup,
  onError,
}: {
  clubId: string;
  items: PayItem[] | null;
  methods: PayMethod[];
  mine: PayOrder[];
  uid: string;
  myName: string;
  isManager: boolean;
  onSetup: () => void;
  onError: (m: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!items) return <p className="muted">Loading…</p>;
  const visible = items.filter((i) => i.active);
  const open = visible.find((i) => i.id === openId);
  const statusFor = (item: PayItem) => {
    const o = mine.filter((x) => x.itemId === item.id && x.status !== "cancelled");
    return o.some((x) => x.status === "confirmed") ? "confirmed" : o.length ? "pending" : null;
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {visible.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: 40 }}>💳</div>
          <h3 style={{ margin: "8px 0" }}>Nothing to pay for yet</h3>
          <p className="muted" style={{ margin: 0 }}>
            {isManager
              ? "Add your dues and merch, and how members pay you (Zelle, Venmo, PayPal…)."
              : "When your club adds dues or merch, it'll show up here."}
          </p>
          {isManager && <button style={{ ...primaryBtn, marginTop: 16 }} onClick={onSetup}>Set up payments</button>}
        </div>
      ) : open ? (
        <Checkout
          clubId={clubId}
          item={open}
          methods={methods}
          myOrders={mine.filter((o) => o.itemId === open.id && o.status !== "cancelled")}
          uid={uid}
          myName={myName}
          onBack={() => setOpenId(null)}
          onError={onError}
        />
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {visible.map((item) => {
            const st = statusFor(item);
            const soldOut = isSoldOut(item);
            return (
              <button key={item.id} className="card" onClick={() => setOpenId(item.id)} style={{ textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 26 }}>{PAY_ITEM_KIND_INFO[item.kind].emoji}</span>
                  {st && item.kind === "dues" ? <Chip status={st} /> : soldOut ? <span className="muted" style={{ fontSize: 12 }}>Sold out</span> : null}
                </div>
                <div style={{ fontWeight: 800, marginTop: 8 }}>{item.title}</div>
                <div style={{ color: "var(--aqua)", fontWeight: 700 }}>{formatMoney(item.priceCents)}</div>
                {item.options?.length ? <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{item.options.join(" / ")}</div> : null}
              </button>
            );
          })}
        </div>
      )}

      {mine.length > 0 && (
        <div>
          <h3 style={sectionTitle}>My payments</h3>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={table}>
              <tbody>
                {sortOrders(mine).map((o) => (
                  <tr key={o.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{o.itemTitle}{o.option ? ` (${o.option})` : ""}{o.qty > 1 ? ` ×${o.qty}` : ""}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{new Date(o.createdAt).toLocaleDateString()} · {orderMethodLabel(o.method)}</div>
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>{formatMoney(o.totalCents)}</td>
                    <td style={td}><Chip status={o.status} /></td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {o.status === "pending" && (
                        <button
                          style={linkBtn}
                          onClick={() => {
                            if (!confirm("Withdraw this payment? Only do this if you didn't actually send it.")) return;
                            void cancelMyPayOrder(clubId, o.id).catch((e: Error) => onError(e.message));
                          }}
                        >
                          Withdraw
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Pending until your treasurer sees the money arrive.</p>
        </div>
      )}
    </div>
  );
}

function Checkout({
  clubId,
  item,
  methods,
  myOrders,
  uid,
  myName,
  onBack,
  onError,
}: {
  clubId: string;
  item: PayItem;
  methods: PayMethod[];
  myOrders: PayOrder[];
  uid: string;
  myName: string;
  onBack: () => void;
  onError: (m: string) => void;
}) {
  const [picked, setPicked] = useState<string | undefined>();
  const [pickedQty, setQty] = useState(1);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const option = item.options?.length
    ? picked && item.options.includes(picked)
      ? picked
      : (item.options.find((o) => remainingStock(item, o) !== 0) ?? item.options[0])
    : undefined;
  const left = remainingStock(item, option);
  const maxQty = item.kind === "dues" ? 1 : Math.max(1, Math.min(PAY_QTY_MAX, left ?? PAY_QTY_MAX));
  const qty = Math.min(pickedQty, maxQty);
  const total = item.priceCents * qty;
  const memo = paymentMemo(item.title, myName, option, qty);
  const method = methods.find((m) => m.id === methodId) ?? methods[0];
  const soldOut = left === 0;

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      onError("Couldn't copy. Select the text and copy it yourself.");
    }
  };

  const submit = async () => {
    if (!confirm(`Only continue once you've sent ${formatMoney(total)}${method ? ` via ${payMethodName(method)}` : ""}. Your treasurer will confirm when it arrives.`)) return;
    setSaving(true);
    try {
      await createPayOrder(clubId, { uid, name: myName, item, option, qty, method: method?.kind ?? "other", note });
      alert("Mahalo! Your treasurer has been told.");
      onBack();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", alignItems: "start" }}>
      <div className="card">
        <button style={linkBtn} onClick={onBack}>← All items</button>
        <div className="muted" style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, marginTop: 12 }}>
          {PAY_ITEM_KIND_INFO[item.kind].emoji} {PAY_ITEM_KIND_INFO[item.kind].name.toUpperCase()}
        </div>
        <h2 style={{ margin: "4px 0" }}>{item.title}</h2>
        <div style={{ color: "var(--aqua)", fontWeight: 800, fontSize: 18 }}>{formatMoney(item.priceCents)}{item.kind !== "dues" ? " each" : ""}</div>
        {item.description && <p style={{ marginBottom: 0 }}>{item.description}</p>}
        {myOrders.length > 0 && (
          <p className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Chip status={myOrders.some((o) => o.status === "confirmed") ? "confirmed" : "pending"} />
            {item.kind === "dues" ? "You've already paid this." : `You've ordered this ${myOrders.length}×.`}
          </p>
        )}
        {!!item.options?.length && (
          <>
            <div style={label}>Size / option</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {item.options.map((o) => {
                const l = remainingStock(item, o);
                return (
                  <button key={o} disabled={l === 0} style={{ ...pill(o === option), opacity: l === 0 ? 0.4 : 1 }} onClick={() => setPicked(o)}>
                    {o}{l !== null && l > 0 && l <= 5 ? ` · ${l} left` : ""}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {item.kind !== "dues" && !soldOut && (
          <>
            <div style={label}>Quantity</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button style={iconBtn} onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <strong style={{ minWidth: 20, textAlign: "center" }}>{qty}</strong>
              <button style={iconBtn} onClick={() => setQty(Math.min(maxQty, qty + 1))}>+</button>
              {left !== null && left <= 5 && <span style={{ color: "var(--coral)", fontSize: 12, fontWeight: 700 }}>Only {left} left</span>}
            </div>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 12, fontSize: 18 }}>
          <strong>Total</strong>
          <strong>{soldOut ? "Sold out" : formatMoney(total)}</strong>
        </div>
      </div>

      {!soldOut && (
        <div style={{ display: "grid", gap: 12 }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>1 · Pay the club</h3>
          {methods.length === 0 && (
            <div className="card muted">Your club hasn&apos;t added payment options yet. Ask your treasurer how to pay, then come back and tap “I paid”.</div>
          )}
          {methods.map((m) => {
            const on = method?.id === m.id;
            const link = payLink(m, total, memo);
            return (
              <div
                key={m.id}
                className="card"
                onClick={() => setMethodId(m.id)}
                style={{ cursor: "pointer", border: `2px solid ${on ? "var(--aqua)" : "transparent"}` }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
                  <span style={{ fontSize: 20 }}>{PAY_METHOD_INFO[m.kind].emoji}</span> {payMethodName(m)}
                  <input type="radio" readOnly checked={on} style={{ marginLeft: "auto" }} />
                </div>
                {m.handle && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, background: "var(--panel)", borderRadius: 8, padding: "8px 12px" }}>
                    <strong style={{ flex: 1, userSelect: "all", wordBreak: "break-all" }}>{m.handle}</strong>
                    <button style={linkBtn} onClick={(e) => { e.stopPropagation(); void copy(m.handle!, m.id); }}>
                      {copied === m.id ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                )}
                {m.instructions && <p style={{ margin: "8px 0 0", fontSize: 14 }}>{m.instructions}</p>}
                {m.qrUrl && (
                  <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.qrUrl} alt={`${payMethodName(m)} QR code`} style={{ width: 160, height: 160, objectFit: "contain", background: "#fff", borderRadius: 8 }} />
                    <span className="muted" style={{ fontSize: 12 }}>Scan with your phone&apos;s bank or payment app.</span>
                  </div>
                )}
                {on && link && (
                  <a href={link} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, display: "inline-block", marginTop: 12, textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                    {m.kind === "link" ? "Open store" : `Open ${payMethodName(m)} · ${formatMoney(total)}`}
                  </a>
                )}
              </div>
            );
          })}
          <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>Put this in the memo / note</div>
              <strong style={{ userSelect: "all" }}>{memo}</strong>
            </div>
            <button style={ghostBtn} onClick={() => void copy(memo, "memo")}>{copied === "memo" ? "Copied ✓" : "Copy"}</button>
          </div>

          <h3 style={{ ...sectionTitle, margin: "8px 0 0" }}>2 · Tell your treasurer</h3>
          <textarea
            style={{ ...inp, minHeight: 60 }}
            placeholder="Note (optional), e.g. sent from Mom's account"
            maxLength={PAY_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button style={{ ...primaryBtn, background: "var(--success)", padding: "12px 18px", fontSize: 15 }} disabled={saving} onClick={() => void submit()}>
            {saving ? "Saving…" : `✅ I paid ${formatMoney(total)}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Payments (treasurer) ───────────────────────────────────────────────────

function OrdersTab({
  clubId,
  clubName,
  orders,
  items,
  members,
  uid,
  onError,
}: {
  clubId: string;
  clubName: string;
  orders: PayOrder[] | null;
  items: PayItem[];
  members: ClubMember[];
  uid: string;
  onError: (m: string) => void;
}) {
  const [filter, setFilter] = useState<"pending" | "confirmed" | "all">("pending");
  const [recording, setRecording] = useState(false);
  const sorted = useMemo(() => sortOrders(orders ?? []), [orders]);
  if (!orders) return <p className="muted">Loading…</p>;
  const totals = orderTotals(orders);
  const shown = sorted.filter((o) => filter === "all" || o.status === filter);
  const fail = (e: Error) => onError(e.message);

  const download = () => {
    const blob = new Blob([ordersToCsv(orders)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${clubName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="card"><div style={bigNum}>{formatMoney(totals.confirmedCents)}</div><div className="muted">received</div></div>
        <div className="card"><div style={{ ...bigNum, color: totals.pendingCount ? "var(--sunset)" : undefined }}>{formatMoney(totals.pendingCents)}</div><div className="muted">{totals.pendingCount} to confirm</div></div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {(["pending", "confirmed", "all"] as const).map((f) => (
          <button key={f} style={pill(filter === f)} onClick={() => setFilter(f)}>
            {f === "pending" ? `To confirm${totals.pendingCount ? ` (${totals.pendingCount})` : ""}` : f === "confirmed" ? "Confirmed" : "All"}
          </button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button style={ghostBtn} onClick={() => setRecording((v) => !v)}>{recording ? "Close" : "+ Record a payment"}</button>
          {orders.length > 0 && <button style={ghostBtn} onClick={download}>⬇ Export CSV</button>}
        </span>
      </div>

      {recording && (
        <RecordForm
          clubId={clubId}
          items={items}
          members={members}
          uid={uid}
          onDone={() => setRecording(false)}
          onError={onError}
        />
      )}

      {shown.length === 0 ? (
        <p className="muted">{filter === "pending" ? "Nothing waiting. Shoots! 🤙" : "No payments yet."}</p>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                <th style={th}>Member</th><th style={th}>For</th><th style={th}>Amount</th><th style={th}>Via</th><th style={th}>Date</th><th style={th}>Status</th><th style={th} />
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ ...td, fontWeight: 700 }}>{o.name}</td>
                  <td style={td}>
                    {o.itemTitle}{o.option ? ` (${o.option})` : ""}{o.qty > 1 ? ` ×${o.qty}` : ""}
                    {o.note && <div className="muted" style={{ fontSize: 12, fontStyle: "italic" }}>“{o.note}”</div>}
                    {o.recordedBy && <div className="muted" style={{ fontSize: 12 }}>Recorded by treasurer</div>}
                  </td>
                  <td style={{ ...td, fontWeight: 700 }}>{formatMoney(o.totalCents)}</td>
                  <td style={td}>{orderMethodLabel(o.method)}</td>
                  <td style={{ ...td, color: "var(--muted)", whiteSpace: "nowrap" }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td style={td}><Chip status={o.status} /></td>
                  <td style={{ ...td, whiteSpace: "nowrap", textAlign: "right" }}>
                    {o.status === "pending" && (
                      <button style={{ ...primaryBtn, background: "var(--success)", marginRight: 8 }} onClick={() => void setPayOrderStatus(clubId, o.id, "confirmed", uid).catch(fail)}>
                        ✓ Confirm
                      </button>
                    )}
                    <select
                      value=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "delete") {
                          if (confirm(`Delete ${o.name}'s ${o.itemTitle} record? It disappears for them too.`)) void deletePayOrder(clubId, o.id).catch(fail);
                        } else if (v) {
                          void setPayOrderStatus(clubId, o.id, v as PayOrderStatus, uid).catch(fail);
                        }
                      }}
                      style={selectStyle}
                    >
                      <option value="">More…</option>
                      {o.status !== "confirmed" && <option value="confirmed">Confirm received</option>}
                      {o.status !== "pending" && <option value="pending">Mark as pending</option>}
                      {o.status !== "cancelled" && <option value="cancelled">Cancel (not received)</option>}
                      <option value="delete">Delete</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const RECORD_METHODS: [string, string][] = [
  [ORDER_METHOD_CASH, "💵 Cash"],
  ...(["zelle", "venmo", "paypal", "cashapp", "other"] as PayMethodKind[]).map(
    (k) => [k, `${PAY_METHOD_INFO[k].emoji} ${k === "other" ? "Check / other" : PAY_METHOD_INFO[k].name}`] as [string, string],
  ),
];

function RecordForm({
  clubId,
  items,
  members,
  uid,
  preset,
  onDone,
  onError,
}: {
  clubId: string;
  items: PayItem[];
  members: ClubMember[];
  uid: string;
  preset?: { uid?: string; itemId?: string };
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [memberUid, setMemberUid] = useState(preset?.uid ?? "");
  const [itemId, setItemId] = useState(preset?.itemId ?? "");
  const [option, setOption] = useState("");
  const [qty, setQty] = useState(1);
  const [method, setMethod] = useState(ORDER_METHOD_CASH);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const item = items.find((i) => i.id === itemId);
  const member = members.find((m) => m.uid === memberUid);
  const sortedMembers = [...members].sort((a, b) => a.displayName.localeCompare(b.displayName));

  const save = async () => {
    if (!member || !item) return onError("Pick the member and the item.");
    if (item.options?.length && !option) return onError("Pick a size/option.");
    setSaving(true);
    try {
      await createPayOrder(clubId, {
        uid: member.uid,
        name: member.displayName,
        item,
        option: option || undefined,
        qty: item.kind === "dues" ? 1 : qty,
        method,
        note,
        recordedBy: uid,
        status: "confirmed",
      });
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <strong>Record a payment</strong>
      <span className="muted" style={{ fontSize: 13 }}>For cash at practice, a check, or money that arrived before they tapped “I paid”. Saved as confirmed.</span>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <select style={selectStyle} value={memberUid} onChange={(e) => setMemberUid(e.target.value)}>
          <option value="">Member…</option>
          {sortedMembers.map((m) => <option key={m.uid} value={m.uid}>{m.displayName}</option>)}
        </select>
        <select style={selectStyle} value={itemId} onChange={(e) => { setItemId(e.target.value); setOption(""); }}>
          <option value="">Item…</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.title} · {formatMoney(i.priceCents)}</option>)}
        </select>
        {!!item?.options?.length && (
          <select style={selectStyle} value={option} onChange={(e) => setOption(e.target.value)}>
            <option value="">Size…</option>
            {item.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {item && item.kind !== "dues" && (
          <input style={inp} type="number" min={1} max={PAY_QTY_MAX} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(PAY_QTY_MAX, Number(e.target.value) || 1)))} aria-label="Quantity" />
        )}
        <select style={selectStyle} value={method} onChange={(e) => setMethod(e.target.value)}>
          {RECORD_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input style={inp} placeholder="Note (optional)" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button style={primaryBtn} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save as paid"}</button>
        <button style={ghostBtn} onClick={onDone}>Cancel</button>
        {item && <strong style={{ marginLeft: "auto" }}>Total {formatMoney(item.priceCents * (item.kind === "dues" ? 1 : qty))}</strong>}
      </div>
    </div>
  );
}

// ─── Dues tracker ───────────────────────────────────────────────────────────

function DuesTab({
  clubId,
  items,
  orders,
  members,
  uid,
  onError,
}: {
  clubId: string;
  items: PayItem[];
  orders: PayOrder[];
  members: ClubMember[];
  uid: string;
  onError: (m: string) => void;
}) {
  const dues = items.filter((i) => i.kind === "dues");
  const [itemId, setItemId] = useState<string>("");
  const [recordFor, setRecordFor] = useState<string | null>(null);
  const item = dues.find((i) => i.id === itemId) ?? dues.find((i) => i.active) ?? dues[0];
  if (!item) return <p className="muted">Add a dues item (Items → type “Dues”) to track who has paid.</p>;

  const status = duesStatusByMember(item.id, members, orders);
  const rank: Record<DuesStatus, number> = { unpaid: 0, pending: 1, paid: 2 };
  const rows = [...members].sort(
    (a, b) => rank[status.get(a.uid)!] - rank[status.get(b.uid)!] || a.displayName.localeCompare(b.displayName),
  );
  const count = (s: DuesStatus) => rows.filter((m) => status.get(m.uid) === s).length;
  const unpaidNames = rows.filter((m) => status.get(m.uid) === "unpaid").map((m) => m.displayName);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {dues.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {dues.map((d) => <button key={d.id} style={pill(d.id === item.id)} onClick={() => setItemId(d.id)}>{d.title}</button>)}
        </div>
      )}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <strong style={{ fontSize: 18 }}>🪪 {item.title}</strong>
            <div className="muted">{count("paid")} paid · {count("pending")} pending · {count("unpaid")} unpaid · {formatMoney(item.priceCents)} each</div>
          </div>
          {unpaidNames.length > 0 && (
            <button style={ghostBtn} onClick={() => void navigator.clipboard.writeText(unpaidNames.join(", ")).catch(() => undefined)}>
              Copy unpaid names
            </button>
          )}
        </div>
        <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "var(--line)", marginTop: 12 }}>
          <div style={{ flex: count("paid"), background: "var(--success)" }} />
          <div style={{ flex: count("pending"), background: "var(--sunset)" }} />
          <div style={{ flex: count("unpaid") }} />
        </div>
      </div>

      {recordFor && (
        <RecordForm
          key={recordFor}
          clubId={clubId}
          items={items}
          members={members}
          uid={uid}
          preset={{ uid: recordFor, itemId: item.id }}
          onDone={() => setRecordFor(null)}
          onError={onError}
        />
      )}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={table}>
          <tbody>
            {rows.map((m) => {
              const s = status.get(m.uid)!;
              return (
                <tr key={m.uid} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ ...td, fontWeight: 600 }}>{m.displayName}</td>
                  <td style={td}><Chip status={s === "paid" ? "confirmed" : s} /></td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {s === "unpaid" && <button style={ghostBtn} onClick={() => setRecordFor(m.uid)}>Mark paid</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Items ──────────────────────────────────────────────────────────────────

const ITEM_KINDS: PayItemKind[] = ["dues", "merch", "other"];

function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const o = raw.trim().slice(0, PAY_OPTION_MAX);
    if (!o || o === NO_OPTION || seen.has(o.toLowerCase())) continue;
    seen.add(o.toLowerCase());
    out.push(o);
  }
  return out.slice(0, PAY_OPTIONS_MAX);
}

function ItemsTab({ clubId, items, uid, onError }: { clubId: string; items: PayItem[]; uid: string; onError: (m: string) => void }) {
  const [editing, setEditing] = useState<PayItem | "new" | null>(null);
  const stockLine = (item: PayItem) => {
    if (!item.stock) return "Unlimited";
    const keys = item.options?.length ? item.options : [NO_OPTION];
    return keys.map((k) => {
      const l = remainingStock(item, k === NO_OPTION ? undefined : k) ?? 0;
      return k === NO_OPTION ? `${l} left` : `${k}: ${l}`;
    }).join(" · ");
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {editing ? (
        <ItemForm
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (d) => {
            if (editing === "new") await addPayItem(clubId, uid, d, items.length);
            else await updatePayItem(clubId, editing.id, d);
            setEditing(null);
          }}
          onDelete={
            editing !== "new"
              ? () => {
                  if (!confirm(`Delete "${editing.title}"? Recorded payments are kept. To just hide it, untick “Show to members”.`)) return;
                  setEditing(null);
                  void deletePayItem(clubId, editing.id).catch((e: Error) => onError(e.message));
                }
              : undefined
          }
          onError={onError}
        />
      ) : (
        <div><button style={primaryBtn} onClick={() => setEditing("new")}>+ Add item</button></div>
      )}
      {items.length === 0 ? (
        <p className="muted">Add your dues, shirts, hats, race entries…</p>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                <th style={th}>Item</th><th style={th}>Price</th><th style={th}>Sizes</th><th style={th}>Stock left</th><th style={th}>Ordered</th><th style={th} />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} style={{ borderTop: "1px solid var(--line)", opacity: i.active ? 1 : 0.55 }}>
                  <td style={{ ...td, fontWeight: 700 }}>{PAY_ITEM_KIND_INFO[i.kind].emoji} {i.title}{!i.active && " (hidden)"}</td>
                  <td style={td}>{formatMoney(i.priceCents)}</td>
                  <td style={td}>{i.options?.join(", ") || "—"}</td>
                  <td style={td}>{stockLine(i)}</td>
                  <td style={td}>{Object.values(i.sold ?? {}).reduce((a, b) => a + b, 0)}</td>
                  <td style={{ ...td, textAlign: "right" }}><button style={linkBtn} onClick={() => setEditing(i)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ItemForm({
  item,
  onSave,
  onCancel,
  onDelete,
  onError,
}: {
  item: PayItem | null;
  onSave: (d: PayItemDraft) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  onError: (m: string) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [kind, setKind] = useState<PayItemKind>(item?.kind ?? "merch");
  const [price, setPrice] = useState(item ? String(item.priceCents / 100) : "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [optionsText, setOptionsText] = useState(item?.options?.join(", ") ?? "");
  const [track, setTrack] = useState(!!item?.stock);
  const [stock, setStock] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(item?.stock ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [active, setActive] = useState(item?.active ?? true);
  const [saving, setSaving] = useState(false);
  const options = kind === "dues" ? [] : parseOptions(optionsText);
  const keys = options.length ? options : [NO_OPTION];

  const save = async () => {
    if (!title.trim()) return onError("Give the item a name.");
    const cents = parseMoney(price);
    if (cents === null) return onError("Enter a price like 25 or 25.50.");
    let st: Record<string, number> | undefined;
    if (track && kind !== "dues") {
      st = {};
      for (const k of keys) {
        const n = parseInt(stock[k] ?? "", 10);
        st[k] = Number.isFinite(n) ? Math.min(PAY_STOCK_MAX, Math.max(0, n)) : 0;
      }
    }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), kind, priceCents: cents, description, options, stock: st, active });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <strong>{item ? "Edit item" : "New item"}</strong>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ITEM_KINDS.map((k) => (
          <button key={k} style={pill(kind === k)} onClick={() => setKind(k)}>{PAY_ITEM_KIND_INFO[k].emoji} {PAY_ITEM_KIND_INFO[k].name}</button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1fr" }}>
        <input style={inp} placeholder={kind === "dues" ? "2027 Season Dues" : "Club T-shirt"} maxLength={PAY_TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input style={inp} placeholder="Price, e.g. 25" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <textarea style={{ ...inp, minHeight: 60 }} placeholder="Details (optional)" maxLength={PAY_DESC_MAX} value={description} onChange={(e) => setDescription(e.target.value)} />
      {kind !== "dues" && (
        <>
          <input style={inp} placeholder="Sizes / options, comma-separated (optional): S, M, L, XL" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} /> Track inventory
            <span className="muted" style={{ fontSize: 12 }}>(total you had, including any already sold)</span>
          </label>
          {track && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {keys.map((k) => (
                <label key={k} style={{ display: "grid", gap: 4, width: 90 }}>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{k === NO_OPTION ? "In stock" : k}</span>
                  <input style={inp} inputMode="numeric" value={stock[k] ?? ""} onChange={(e) => setStock((s) => ({ ...s, [k]: e.target.value.replace(/\D/g, "") }))} />
                  {(item?.sold?.[k] ?? 0) > 0 && <span className="muted" style={{ fontSize: 11 }}>{item!.sold![k]} sold</span>}
                </label>
              ))}
            </div>
          )}
        </>
      )}
      {kind === "dues" && <span className="muted" style={{ fontSize: 13 }}>Dues are one per member, and the Dues tracker shows who hasn&apos;t paid.</span>}
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Show to members
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={primaryBtn} disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
        <button style={ghostBtn} onClick={onCancel}>Cancel</button>
        {onDelete && <button style={{ ...ghostBtn, color: "var(--danger)", marginLeft: "auto" }} onClick={onDelete}>Delete</button>}
      </div>
    </div>
  );
}

// ─── Ways to pay ────────────────────────────────────────────────────────────

const METHOD_KINDS: PayMethodKind[] = ["zelle", "venmo", "paypal", "cashapp", "link", "other"];

function MethodsTab({ clubId, methods, onError }: { clubId: string; methods: PayMethod[]; onError: (m: string) => void }) {
  const [editing, setEditing] = useState<PayMethod | "new" | null>(null);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {editing ? (
        <MethodForm
          key={editing === "new" ? "new" : editing.id}
          clubId={clubId}
          method={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (d) => {
            if (editing === "new") await addPayMethod(clubId, d, methods.length);
            else await updatePayMethod(clubId, editing.id, d);
            setEditing(null);
          }}
          onDelete={
            editing !== "new"
              ? () => {
                  if (!confirm(`Remove ${payMethodName(editing)}?`)) return;
                  setEditing(null);
                  void deletePayMethod(clubId, editing.id).catch((e: Error) => onError(e.message));
                }
              : undefined
          }
          onError={onError}
        />
      ) : (
        <div><button style={primaryBtn} onClick={() => setEditing("new")}>+ Add payment option</button></div>
      )}
      {methods.length === 0 ? (
        <p className="muted">Add how members pay you, e.g. your Zelle email and QR code.</p>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {methods.map((m) => (
            <div key={m.id} className="card">
              <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}>
                <span style={{ fontSize: 20 }}>{PAY_METHOD_INFO[m.kind].emoji}</span>{payMethodName(m)}
                <button style={{ ...linkBtn, marginLeft: "auto" }} onClick={() => setEditing(m)}>Edit</button>
              </div>
              {(m.handle || m.url) && <div style={{ marginTop: 6, wordBreak: "break-all" }}>{m.handle || m.url}</div>}
              {m.instructions && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{m.instructions}</div>}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.qrUrl && <img src={m.qrUrl} alt="QR code" style={{ width: 96, height: 96, objectFit: "contain", background: "#fff", borderRadius: 8, marginTop: 8 }} />}
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12 }}>Members see these in this order when they pay.</p>
    </div>
  );
}

function MethodForm({
  clubId,
  method,
  onSave,
  onCancel,
  onDelete,
  onError,
}: {
  clubId: string;
  method: PayMethod | null;
  onSave: (d: PayMethodDraft) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  onError: (m: string) => void;
}) {
  const [kind, setKind] = useState<PayMethodKind>(method?.kind ?? "zelle");
  const [handle, setHandle] = useState(method?.handle ?? "");
  const [url, setUrl] = useState(method?.url ?? "");
  const [label, setLabel] = useState(method?.label ?? "");
  const [instructions, setInstructions] = useState(method?.instructions ?? "");
  const [qrUrl, setQrUrl] = useState<string | undefined>(method?.qrUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const info = PAY_METHOD_INFO[kind];

  const save = async () => {
    if (info.handleLabel && !handle.trim() && !qrUrl) return onError(`Add the ${info.handleLabel.toLowerCase()}.`);
    if (kind === "link" && !url.trim()) return onError("Paste the store or checkout link.");
    if (kind === "other" && !instructions.trim()) return onError("Tell members how to pay.");
    setSaving(true);
    try {
      await onSave({ kind, handle: info.handleLabel ? handle : undefined, url: kind === "link" ? url : undefined, label, instructions, qrUrl });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <strong>{method ? "Edit payment option" : "Add payment option"}</strong>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {METHOD_KINDS.map((k) => (
          <button key={k} style={pill(kind === k)} onClick={() => setKind(k)}>{PAY_METHOD_INFO[k].emoji} {PAY_METHOD_INFO[k].name}</button>
        ))}
      </div>
      {info.handleLabel && (
        <input style={inp} placeholder={`${info.handleLabel}, e.g. ${info.handlePlaceholder}`} maxLength={PAY_HANDLE_MAX} value={handle} onChange={(e) => setHandle(e.target.value)} />
      )}
      {kind === "link" && <input style={inp} placeholder="https://square.link/…" value={url} onChange={(e) => setUrl(e.target.value)} />}
      <textarea
        style={{ ...inp, minHeight: 60 }}
        placeholder={kind === "other" ? "e.g. Cash or checks to Auntie Lei at Saturday practice." : "Instructions (optional), e.g. put your name in the memo."}
        maxLength={PAY_INSTRUCTIONS_MAX}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
      />
      {kind !== "link" && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qrUrl && <img src={qrUrl} alt="QR code" style={{ width: 96, height: 96, objectFit: "contain", background: "#fff", borderRadius: 8 }} />}
          <label style={{ ...ghostBtn, display: "inline-block" }}>
            {uploading ? "Uploading…" : qrUrl ? "Replace QR image" : "Upload QR image"}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              disabled={uploading}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setUploading(true);
                try {
                  setQrUrl(await uploadPayQr(clubId, f));
                } catch (err) {
                  onError(err instanceof Error ? err.message : "Upload failed.");
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
          {qrUrl && <button style={{ ...linkBtn, color: "var(--danger)" }} onClick={() => setQrUrl(undefined)}>Remove</button>}
          {kind === "zelle" && <span className="muted" style={{ fontSize: 12, flexBasis: "100%" }}>In your bank app: Zelle → your QR code → screenshot it.</span>}
        </div>
      )}
      <input style={inp} placeholder={`Display name (optional), default “${info.name}”`} maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <button style={primaryBtn} disabled={saving || uploading} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
        <button style={ghostBtn} onClick={onCancel}>Cancel</button>
        {onDelete && <button style={{ ...ghostBtn, color: "var(--danger)", marginLeft: "auto" }} onClick={onDelete}>Remove</button>}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = { background: "var(--blue)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const ghostBtn: React.CSSProperties = { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const iconBtn: React.CSSProperties = { ...ghostBtn, padding: "4px 12px", fontSize: 16 };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "var(--blue-bright)", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 };
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 14, fontFamily: "inherit" };
const selectStyle: React.CSSProperties = { ...inp, width: "auto", minWidth: 120, padding: "8px 10px", cursor: "pointer" };
const pill = (on: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 999,
  border: `1.5px solid ${on ? "var(--aqua)" : "var(--line)"}`,
  background: on ? "color-mix(in srgb, var(--aqua) 18%, transparent)" : "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: on ? 700 : 500,
});
const label: React.CSSProperties = { fontWeight: 700, fontSize: 14, margin: "14px 0 8px" };
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "var(--muted)", margin: "0 0 8px" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th: React.CSSProperties = { padding: "10px 14px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 };
const td: React.CSSProperties = { padding: "10px 14px", verticalAlign: "middle" };
const bigNum: React.CSSProperties = { fontSize: 26, fontWeight: 800 };
