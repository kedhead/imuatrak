"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getClubMembers, getUserClub } from "@/lib/firebase";
import type { ClubMember, MemberRole } from "@/lib/clubTypes";
import {
  cleanAnswers,
  createSurvey,
  deleteSurvey,
  draftProblems,
  getMySurveyResponse,
  getSurveyRespondentUids,
  getSurveyResponses,
  isSurveyOpen,
  missingRequired,
  newQuestionId,
  QUESTION_TYPE_LABEL,
  setSurveyStatus,
  submitSurveyResponse,
  subscribeSurveys,
  SURVEY_DESCRIPTION_MAX,
  SURVEY_OPTION_MAX,
  SURVEY_OPTIONS_MAX,
  SURVEY_PROMPT_MAX,
  SURVEY_QUESTIONS_MAX,
  SURVEY_RATING_MAX,
  SURVEY_TEMPLATES,
  SURVEY_TEXT_ANSWER_MAX,
  SURVEY_TITLE_MAX,
  surveyToCsv,
  surveyWhen,
  tallyQuestion,
  updateSurvey,
  type Survey,
  type SurveyAnswer,
  type SurveyDraft,
  type SurveyQuestion,
  type SurveyQuestionType,
  type SurveyResponse,
} from "@/lib/surveys";

type View =
  | { kind: "list" }
  | { kind: "take"; id: string }
  | { kind: "results"; id: string }
  | { kind: "edit"; id: string | null; draft: SurveyDraft };

interface Ctx {
  clubId: string;
  role: MemberRole;
}

/** ?survey=<id> opens it (results for staff, the form for members). */
export default function SurveysPage() {
  const { user, loading } = useAuth();
  const [ctx, setCtx] = useState<Ctx | null | "none">(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<View>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);

  const isStaff = ctx !== null && ctx !== "none" && ["owner", "admin", "coach"].includes(ctx.role);

  useEffect(() => {
    if (!user) return;
    getUserClub(user.uid).then((r) => {
      if (!r) return setCtx("none");
      setCtx({ clubId: r.club.id, role: r.role });
      getClubMembers(r.club.id).then(setMembers).catch(() => undefined);
    });
  }, [user]);

  const clubId = ctx && ctx !== "none" ? ctx.clubId : null;

  useEffect(() => {
    if (!clubId) return;
    return subscribeSurveys(clubId, setSurveys, (e) => {
      setSurveys([]);
      setError(e.message);
    });
  }, [clubId]);

  // Which surveys this member has answered, for "Answered ✓" vs "Take it".
  useEffect(() => {
    if (!clubId || !user || !surveys) return;
    let cancelled = false;
    void Promise.all(
      surveys.map(async (s) => [s.id, (await getMySurveyResponse(clubId, s, user.uid)).submitted] as const),
    )
      .then((pairs) => !cancelled && setAnswered(Object.fromEntries(pairs)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [clubId, user, surveys]);

  // Deep link, once the list has loaded.
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked || !surveys || ctx === null) return;
    setDeepLinked(true);
    const id = new URLSearchParams(window.location.search).get("survey");
    if (id && surveys.some((s) => s.id === id)) setView({ kind: isStaff ? "results" : "take", id });
  }, [surveys, ctx, isStaff, deepLinked]);

  if (loading || ctx === null) return <Shell><p className="muted">Loading…</p></Shell>;
  if (!user) return <Shell><p>Please <Link href="/login" style={{ color: "var(--blue-bright)" }}>sign in</Link>.</p></Shell>;
  if (ctx === "none") return <Shell><p className="muted">Join a club in the app to see its surveys.</p></Shell>;

  const survey = view.kind === "take" || view.kind === "results" ? surveys?.find((s) => s.id === view.id) : undefined;
  const back = () => setView({ kind: "list" });
  const myName = members.find((m) => m.uid === user.uid)?.displayName ?? user.displayName ?? "A member";

  return (
    <Shell>
      {error && (
        <div className="card" style={{ marginBottom: 12, borderLeft: "4px solid var(--danger)", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{error}</span>
          <button style={link} onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {view.kind === "list" && (
        <SurveyList
          surveys={surveys}
          answered={answered}
          isStaff={isStaff}
          onOpen={(s) => setView({ kind: "take", id: s.id })}
          onResults={(s) => setView({ kind: "results", id: s.id })}
          onEdit={(s) =>
            setView({
              kind: "edit",
              id: s.id,
              draft: { title: s.title, description: s.description, questions: s.questions, anonymous: s.anonymous, closesAt: s.closesAt },
            })
          }
          onNew={(draft) => setView({ kind: "edit", id: null, draft })}
          onToggleStatus={(s) =>
            void setSurveyStatus(clubId!, s.id, isSurveyOpen(s) ? "closed" : "open").catch((e: Error) => setError(e.message))
          }
          onDelete={(s) => {
            if (!confirm(`Delete "${s.title}" and all its responses? This can't be undone.`)) return;
            void deleteSurvey(clubId!, s.id).catch((e: Error) => setError(e.message));
          }}
        />
      )}

      {view.kind === "take" && survey && (
        <TakeSurvey clubId={clubId!} survey={survey} uid={user.uid} myName={myName} onDone={back} />
      )}
      {view.kind === "results" && survey && (
        <Results clubId={clubId!} survey={survey} members={members} onBack={back} />
      )}
      {(view.kind === "take" || view.kind === "results") && surveys && !survey && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>That survey was deleted.</p>
          <button style={ghostBtn} onClick={back}>← All surveys</button>
        </div>
      )}
      {view.kind === "edit" && (
        <Editor
          initial={view.draft}
          editingId={view.id}
          onCancel={back}
          onSave={async (draft) => {
            if (view.id) await updateSurvey(clubId!, view.id, draft);
            else await createSurvey(clubId!, user.uid, draft);
            back();
          }}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="container" style={{ paddingBottom: 80 }}>
      <Link href="/dashboard/club" style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none" }}>← Club Dashboard</Link>
      <h1 style={{ margin: "8px 0 20px", fontSize: 28, fontWeight: 800 }}>Surveys</h1>
      {children}
    </main>
  );
}

// ─── List ───────────────────────────────────────────────────────────────────

function SurveyList({
  surveys,
  answered,
  isStaff,
  onOpen,
  onResults,
  onEdit,
  onNew,
  onToggleStatus,
  onDelete,
}: {
  surveys: Survey[] | null;
  answered: Record<string, boolean>;
  isStaff: boolean;
  onOpen: (s: Survey) => void;
  onResults: (s: Survey) => void;
  onEdit: (s: Survey) => void;
  onNew: (d: SurveyDraft) => void;
  onToggleStatus: (s: Survey) => void;
  onDelete: (s: Survey) => void;
}) {
  const [picking, setPicking] = useState(false);
  if (!surveys) return <p className="muted">Loading…</p>;

  const open = surveys.filter((s) => isSurveyOpen(s));
  const closed = surveys.filter((s) => !isSurveyOpen(s));

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {isStaff && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>Ask your club something</div>
              <div className="muted" style={{ fontSize: 13 }}>Members see open surveys on the club home screen in the app.</div>
            </div>
            <button style={primaryBtn} onClick={() => setPicking((v) => !v)}>
              {picking ? "Close" : "+ New survey"}
            </button>
          </div>
          {picking && (
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginTop: 16 }}>
              <TemplateCard
                emoji="✏️"
                name="Blank survey"
                blurb="Start from scratch"
                onClick={() =>
                  onNew({ title: "", questions: [{ id: newQuestionId(), type: "single", prompt: "", options: ["", ""], required: false }], anonymous: false })
                }
              />
              {SURVEY_TEMPLATES.map((t) => (
                <TemplateCard
                  key={t.id}
                  emoji={t.emoji}
                  name={t.name}
                  blurb={`${t.blurb}${t.anonymous ? " · anonymous" : ""}`}
                  onClick={() =>
                    onNew({
                      title: t.title,
                      description: t.description,
                      anonymous: t.anonymous,
                      questions: t.questions.map((q) => ({ ...q, id: newQuestionId(), options: q.options ? [...q.options] : undefined })),
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {surveys.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
          <div style={{ fontWeight: 700 }}>No surveys yet</div>
          {!isStaff && <p className="muted" style={{ marginBottom: 0 }}>Coaches and admins can send one out.</p>}
        </div>
      )}

      {[["Open", open], ["Closed", closed]].map(([label, list]) =>
        (list as Survey[]).length === 0 ? null : (
          <section key={label as string}>
            <h2 style={sectionLabel}>{label as string}</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {(list as Survey[]).map((s) => {
                const isOpen = isSurveyOpen(s);
                const done = answered[s.id];
                return (
                  <div key={s.id} className="card" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "14px 16px" }}>
                    <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                      <div style={{ fontWeight: 700 }}>{s.title}</div>
                      <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                        {s.questions.length} question{s.questions.length === 1 ? "" : "s"} · {surveyWhen(s)}
                        {s.anonymous ? " · 🔒 Anonymous" : ""}
                        {done ? " · Answered ✓" : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {isOpen && (
                        <button style={done ? ghostBtn : primaryBtn} onClick={() => onOpen(s)}>
                          {done ? (s.anonymous ? "View" : "Edit answers") : "Take it"}
                        </button>
                      )}
                      {isStaff && (
                        <>
                          <button style={ghostBtn} onClick={() => onResults(s)}>Results</button>
                          <button style={ghostBtn} onClick={() => onEdit(s)}>Edit</button>
                          <button style={ghostBtn} onClick={() => onToggleStatus(s)}>{isOpen ? "Close" : "Reopen"}</button>
                          <button style={{ ...ghostBtn, color: "var(--danger)" }} onClick={() => onDelete(s)}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ),
      )}
    </div>
  );
}

function TemplateCard({ emoji, name, blurb, onClick }: { emoji: string; name: string; blurb: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ textAlign: "left", border: "1px solid var(--line)", borderRadius: 12, padding: 14, background: "var(--bg)", color: "inherit", cursor: "pointer" }}
    >
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ fontWeight: 700, marginTop: 6 }}>{name}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{blurb}</div>
    </button>
  );
}

// ─── Take ───────────────────────────────────────────────────────────────────

function TakeSurvey({
  clubId,
  survey,
  uid,
  myName,
  onDone,
}: {
  clubId: string;
  survey: Survey;
  uid: string;
  myName: string;
  onDone: () => void;
}) {
  const [state, setState] = useState<"loading" | "form" | "locked" | "sent">("loading");
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasSubmitted, setWasSubmitted] = useState(false);

  useEffect(() => {
    void getMySurveyResponse(clubId, survey, uid).then((r) => {
      setWasSubmitted(r.submitted);
      if (r.submitted && survey.anonymous) return setState("locked");
      setAnswers(r.answers ?? {});
      setState("form");
    });
  }, [clubId, survey, uid]);

  const open = isSurveyOpen(survey);
  const set = (id: string, a: SurveyAnswer | undefined) =>
    setAnswers((prev) => {
      const next = { ...prev };
      if (a === undefined) delete next[id];
      else next[id] = a;
      return next;
    });

  const submit = async () => {
    const missing = missingRequired(survey.questions, answers);
    if (missing.length) return setError(`Please answer: ${missing.join(" · ")}`);
    setBusy(true);
    setError(null);
    try {
      await submitSurveyResponse(clubId, survey, uid, myName, cleanAnswers(survey.questions, answers));
      setState("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      <button style={{ ...link, justifySelf: "start" }} onClick={onDone}>← All surveys</button>
      <div className="card">
        <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>{survey.title}</h2>
        {survey.description && <p className="muted" style={{ margin: "0 0 8px", lineHeight: 1.5 }}>{survey.description}</p>}
        <div style={{ fontSize: 13, color: survey.anonymous ? "var(--success)" : "var(--muted)" }}>
          {survey.anonymous
            ? "🔒 Anonymous: nobody, including admins, can see which answers are yours."
            : "Your name is shown with your answers to the club's coaches and admins."}{" "}
          <span className="muted">· {surveyWhen(survey)}</span>
        </div>
      </div>

      {state === "loading" && <p className="muted">Loading…</p>}
      {state === "locked" && <Notice emoji="✅" text="You've answered this one. Anonymous answers can't be changed, because nobody can tell which response is yours." />}
      {state === "sent" && <Notice emoji="🤙" text="Thanks! Your answers are in." action={<button style={ghostBtn} onClick={onDone}>Back to surveys</button>} />}
      {state === "form" && !open && <Notice emoji="⏰" text="This survey is closed." />}

      {state === "form" && open && (
        <>
          {survey.questions.map((q, i) => (
            <div key={q.id} className="card">
              <div style={{ fontWeight: 700, marginBottom: 10 }}>
                {i + 1}. {q.prompt}
                {q.required && <span style={{ color: "var(--coral)" }}> *</span>}
              </div>
              <QuestionInput q={q} value={answers[q.id]} onChange={(a) => set(q.id, a)} />
            </div>
          ))}
          {error && <div style={{ color: "var(--danger)", fontSize: 14 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={primaryBtn} disabled={busy} onClick={() => void submit()}>
              {busy ? "Sending…" : wasSubmitted ? "Update answers" : "Submit"}
            </button>
            <button style={ghostBtn} onClick={onDone}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

function QuestionInput({ q, value, onChange }: { q: SurveyQuestion; value: SurveyAnswer | undefined; onChange: (a: SurveyAnswer | undefined) => void }) {
  if (q.type === "single" || q.type === "multi") {
    const picked = q.type === "multi" ? ((value as string[] | undefined) ?? []) : [];
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(q.options ?? []).map((o) => {
          const on = q.type === "single" ? value === o : picked.includes(o);
          return (
            <button
              key={o}
              type="button"
              style={pill(on)}
              onClick={() => {
                if (q.type === "single") onChange(on ? undefined : o);
                else {
                  const next = on ? picked.filter((x) => x !== o) : [...picked, o];
                  onChange(next.length ? next : undefined);
                }
              }}
            >
              {q.type === "multi" ? (on ? "☑ " : "☐ ") : ""}
              {o}
            </button>
          );
        })}
      </div>
    );
  }
  if (q.type === "rating") {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {Array.from({ length: SURVEY_RATING_MAX }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" style={{ ...pill(value === n), width: 44 }} onClick={() => onChange(value === n ? undefined : n)}>
            {n}
          </button>
        ))}
        <span className="muted" style={{ fontSize: 12 }}>1 = poor · 5 = great</span>
      </div>
    );
  }
  return (
    <textarea
      value={(value as string | undefined) ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      maxLength={SURVEY_TEXT_ANSWER_MAX}
      rows={3}
      style={{ ...inp, resize: "vertical" }}
      placeholder="Your answer"
    />
  );
}

// ─── Results ────────────────────────────────────────────────────────────────

function Results({ clubId, survey, members, onBack }: { clubId: string; survey: Survey; members: ClubMember[]; onBack: () => void }) {
  const [responses, setResponses] = useState<SurveyResponse[] | null>(null);
  const [respondents, setRespondents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSurveyResponses(clubId, survey.id), getSurveyRespondentUids(clubId, survey)])
      .then(([r, u]) => {
        setResponses(r);
        setRespondents(u);
      })
      .catch((e: Error) => setError(e.message));
  }, [clubId, survey]);

  const notAnswered = useMemo(
    () => members.filter((m) => !respondents.includes(m.uid)).map((m) => m.displayName).sort((a, b) => a.localeCompare(b)),
    [members, respondents],
  );

  const downloadCsv = () => {
    if (!responses) return;
    const blob = new Blob([surveyToCsv(survey, responses)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${survey.title.replace(/[^\w\- ]+/g, "").trim() || "survey"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 820 }}>
      <button style={{ ...link, justifySelf: "start" }} onClick={onBack}>← All surveys</button>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>{survey.title}</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            {responses ? `${responses.length} of ${members.length || "?"} members answered` : "Loading…"} · {surveyWhen(survey)}
            {survey.anonymous ? " · 🔒 Anonymous" : ""}
          </div>
        </div>
        <button style={ghostBtn} disabled={!responses?.length} onClick={downloadCsv}>⬇ Download CSV</button>
      </div>

      {error && <div style={{ color: "var(--danger)" }}>{error}</div>}

      {responses && members.length > 0 && notAnswered.length > 0 && (
        <details className="card">
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Haven&apos;t answered yet ({notAnswered.length})</summary>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 0 }}>
            {notAnswered.join(" · ")}
          </p>
          {survey.anonymous && (
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              You can see who has answered, but not which answers are whose.
            </p>
          )}
        </details>
      )}

      {responses?.length === 0 && <Notice emoji="📭" text="No responses yet." />}

      {responses &&
        responses.length > 0 &&
        survey.questions.map((q, i) => {
          const r = tallyQuestion(q, responses);
          return (
            <div key={q.id} className="card">
              <div style={{ fontWeight: 700 }}>{i + 1}. {q.prompt}</div>
              <div className="muted" style={{ fontSize: 12, margin: "2px 0 12px" }}>
                {QUESTION_TYPE_LABEL[q.type]} · {r.answered} answered
              </div>
              {(r.type === "single" || r.type === "multi") &&
                r.counts.map((c) => <Bar key={c.option} label={c.option} count={c.count} total={r.answered} />)}
              {r.type === "rating" && (
                <>
                  <div style={{ fontSize: 28, fontWeight: 850, marginBottom: 8 }}>
                    {r.average ?? "–"}
                    <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}> / {SURVEY_RATING_MAX} average</span>
                  </div>
                  {r.counts.map((n, idx) => <Bar key={idx} label={`${idx + 1}`} count={n} total={r.answered} />).reverse()}
                </>
              )}
              {r.type === "text" && (
                <div style={{ display: "grid", gap: 8 }}>
                  {r.answers.map((a, idx) => (
                    <div key={idx} style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px", fontSize: 14, lineHeight: 1.5 }}>
                      {a.text}
                      {a.name && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{a.name}</div>}
                    </div>
                  ))}
                  {r.answers.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No written answers.</span>}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
        <span>{label}</span>
        <span className="muted">{count} · {pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--line)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--aqua)", borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ─── Editor ─────────────────────────────────────────────────────────────────

function toDateInput(ms?: number): string {
  if (ms == null) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Editor({
  initial,
  editingId,
  onCancel,
  onSave,
}: {
  initial: SurveyDraft;
  editingId: string | null;
  onCancel: () => void;
  onSave: (d: SurveyDraft) => Promise<void>;
}) {
  const [d, setD] = useState<SurveyDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const setQ = (id: string, patch: Partial<SurveyQuestion>) =>
    setD((prev) => ({ ...prev, questions: prev.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));
  const move = (idx: number, by: number) =>
    setD((prev) => {
      const qs = [...prev.questions];
      const [q] = qs.splice(idx, 1);
      qs.splice(idx + by, 0, q!);
      return { ...prev, questions: qs };
    });

  const save = async () => {
    const p = draftProblems(d);
    setProblems(p);
    if (p.length) return;
    setBusy(true);
    try {
      await onSave(d);
    } catch (e) {
      setProblems([e instanceof Error ? e.message : "Couldn't save. Please try again."]);
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 760 }}>
      <button style={{ ...link, justifySelf: "start" }} onClick={onCancel}>← All surveys</button>
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{editingId ? "Edit survey" : "New survey"}</h2>
        <input style={inp} placeholder="Title" maxLength={SURVEY_TITLE_MAX} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        <textarea
          style={{ ...inp, resize: "vertical" }}
          rows={2}
          placeholder="Intro (optional)"
          maxLength={SURVEY_DESCRIPTION_MAX}
          value={d.description ?? ""}
          onChange={(e) => setD({ ...d, description: e.target.value })}
        />
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, opacity: editingId ? 0.6 : 1 }}>
            <input type="checkbox" checked={d.anonymous} disabled={!!editingId} onChange={(e) => setD({ ...d, anonymous: e.target.checked })} />
            🔒 Anonymous
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            Closes
            <input
              type="date"
              style={{ ...inp, width: "auto" }}
              value={toDateInput(d.closesAt)}
              min={toDateInput(Date.now())}
              onChange={(e) => {
                // End of the chosen day, local time.
                const v = e.target.value;
                setD({ ...d, closesAt: v ? new Date(`${v}T23:59:59`).getTime() : undefined });
              }}
            />
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          {editingId
            ? "Anonymity can't be changed after a survey goes out."
            : d.anonymous
              ? "Nobody, admins included, will see who gave which answer. Answers can't be edited after sending."
              : "Coaches and admins see each member's name with their answers."}
        </p>
      </div>

      {d.questions.map((q, i) => (
        <div key={q.id} className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 14 }}>Q{i + 1}</strong>
            <select
              value={q.type}
              style={{ ...inp, width: "auto" }}
              onChange={(e) => {
                const type = e.target.value as SurveyQuestionType;
                setQ(q.id, { type, options: type === "single" || type === "multi" ? (q.options?.length ? q.options : ["", ""]) : undefined });
              }}
            >
              {(Object.keys(QUESTION_TYPE_LABEL) as SurveyQuestionType[]).map((t) => (
                <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={q.required} onChange={(e) => setQ(q.id, { required: e.target.checked })} />
              Required
            </label>
            <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              <button style={iconBtn} disabled={i === 0} onClick={() => move(i, -1)} title="Move up">↑</button>
              <button style={iconBtn} disabled={i === d.questions.length - 1} onClick={() => move(i, 1)} title="Move down">↓</button>
              <button
                style={{ ...iconBtn, color: "var(--danger)" }}
                disabled={d.questions.length === 1}
                onClick={() => setD({ ...d, questions: d.questions.filter((x) => x.id !== q.id) })}
                title="Remove"
              >
                ✕
              </button>
            </span>
          </div>
          <input style={inp} placeholder="Question" maxLength={SURVEY_PROMPT_MAX} value={q.prompt} onChange={(e) => setQ(q.id, { prompt: e.target.value })} />
          {(q.type === "single" || q.type === "multi") && (
            <div style={{ display: "grid", gap: 6, paddingLeft: 12 }}>
              {(q.options ?? []).map((o, oi) => (
                <div key={oi} style={{ display: "flex", gap: 6 }}>
                  <input
                    style={inp}
                    placeholder={`Choice ${oi + 1}`}
                    maxLength={SURVEY_OPTION_MAX}
                    value={o}
                    onChange={(e) => setQ(q.id, { options: (q.options ?? []).map((x, xi) => (xi === oi ? e.target.value : x)) })}
                  />
                  <button
                    style={iconBtn}
                    disabled={(q.options ?? []).length <= 2}
                    onClick={() => setQ(q.id, { options: (q.options ?? []).filter((_, xi) => xi !== oi) })}
                    title="Remove choice"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {(q.options ?? []).length < SURVEY_OPTIONS_MAX && (
                <button style={{ ...link, justifySelf: "start" }} onClick={() => setQ(q.id, { options: [...(q.options ?? []), ""] })}>
                  + Add choice
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {d.questions.length < SURVEY_QUESTIONS_MAX && (
        <button
          style={{ ...ghostBtn, justifySelf: "start" }}
          onClick={() =>
            setD({ ...d, questions: [...d.questions, { id: newQuestionId(), type: "single", prompt: "", options: ["", ""], required: false }] })
          }
        >
          + Add question
        </button>
      )}

      {problems.length > 0 && (
        <div style={{ color: "var(--danger)", fontSize: 14 }}>
          {problems.map((p) => <div key={p}>{p}</div>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={primaryBtn} disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : editingId ? "Save changes" : "Send to club"}
        </button>
        <button style={ghostBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Notice({ emoji, text, action }: { emoji: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: 32 }}>
      <div style={{ fontSize: 36 }}>{emoji}</div>
      <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>{text}</p>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", margin: "0 0 10px" };
const inp: React.CSSProperties = { padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14, background: "var(--bg)", color: "var(--ink)", width: "100%", boxSizing: "border-box", font: "inherit" };
const primaryBtn: React.CSSProperties = { background: "var(--blue)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const ghostBtn: React.CSSProperties = { background: "transparent", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const iconBtn: React.CSSProperties = { ...ghostBtn, padding: "4px 9px" };
const link: React.CSSProperties = { background: "none", border: "none", color: "var(--blue-bright)", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 };
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
