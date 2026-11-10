/**
 * Club surveys on the web.
 *
 * Types and helpers mirror src/models/club.ts; writes mirror
 * src/services/clubService.ts. The anonymous path in particular has to match
 * firestore.rules exactly (an empty respondents/{uid} marker plus an
 * answers-only response in ONE batch), or anonymity breaks or writes fail.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export type SurveyQuestionType = "single" | "multi" | "rating" | "text";

export interface SurveyQuestion {
  id: string;
  type: SurveyQuestionType;
  prompt: string;
  options?: string[];
  required: boolean;
}

export interface Survey {
  id: string;
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  anonymous: boolean;
  status: "open" | "closed";
  closesAt?: number;
  createdBy: string;
  createdAt: string;
}

export type SurveyAnswer = string | string[] | number;

export interface SurveyResponse {
  id: string;
  uid?: string;
  name?: string;
  answers: Record<string, SurveyAnswer>;
}

export const SURVEY_TITLE_MAX = 80;
export const SURVEY_DESCRIPTION_MAX = 500;
export const SURVEY_PROMPT_MAX = 200;
export const SURVEY_OPTION_MAX = 60;
export const SURVEY_TEXT_ANSWER_MAX = 1000;
export const SURVEY_QUESTIONS_MAX = 25;
export const SURVEY_OPTIONS_MAX = 10;
export const SURVEY_RATING_MAX = 5;

export const QUESTION_TYPE_LABEL: Record<SurveyQuestionType, string> = {
  single: "One choice",
  multi: "Several choices",
  rating: "Rating 1–5",
  text: "Written answer",
};

export function isSurveyOpen(s: Pick<Survey, "status" | "closesAt">, now = Date.now()): boolean {
  return s.status === "open" && (s.closesAt == null || now < s.closesAt);
}

export function surveyWhen(s: Pick<Survey, "status" | "closesAt">, now = Date.now()): string {
  if (!isSurveyOpen(s, now)) return "Closed";
  if (s.closesAt == null) return "Open";
  return `Closes ${new Date(s.closesAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
}

export function hasAnswer(q: SurveyQuestion, a: SurveyAnswer | undefined): boolean {
  if (a == null) return false;
  switch (q.type) {
    case "single":
      return typeof a === "string" && a.length > 0;
    case "multi":
      return Array.isArray(a) && a.length > 0;
    case "rating":
      return typeof a === "number" && a >= 1 && a <= SURVEY_RATING_MAX;
    case "text":
      return typeof a === "string" && a.trim().length > 0;
  }
}

export function missingRequired(questions: SurveyQuestion[], answers: Record<string, SurveyAnswer>): string[] {
  return questions.filter((q) => q.required && !hasAnswer(q, answers[q.id])).map((q) => q.prompt);
}

export function cleanAnswers(
  questions: SurveyQuestion[],
  answers: Record<string, SurveyAnswer>,
): Record<string, SurveyAnswer> {
  const out: Record<string, SurveyAnswer> = {};
  for (const q of questions) {
    const a = answers[q.id];
    if (!hasAnswer(q, a)) continue;
    if (q.type === "text") out[q.id] = (a as string).trim().slice(0, SURVEY_TEXT_ANSWER_MAX);
    else if (q.type === "multi") out[q.id] = (a as string[]).filter((o) => q.options?.includes(o));
    else out[q.id] = a!;
  }
  return out;
}

export type QuestionResult =
  | { type: "single" | "multi"; answered: number; counts: { option: string; count: number }[] }
  | { type: "rating"; answered: number; average: number | null; counts: number[] }
  | { type: "text"; answered: number; answers: { text: string; name?: string }[] };

export function tallyQuestion(q: SurveyQuestion, responses: SurveyResponse[]): QuestionResult {
  const given = responses
    .map((r) => ({ a: r.answers?.[q.id], name: r.name }))
    .filter((x) => hasAnswer(q, x.a));
  switch (q.type) {
    case "single":
    case "multi": {
      const counts = (q.options ?? []).map((option) => ({
        option,
        count: given.filter((x) => (Array.isArray(x.a) ? x.a.includes(option) : x.a === option)).length,
      }));
      return { type: q.type, answered: given.length, counts };
    }
    case "rating": {
      const counts = Array.from({ length: SURVEY_RATING_MAX }, () => 0);
      let sum = 0;
      for (const x of given) {
        const n = x.a as number;
        counts[n - 1]! += 1;
        sum += n;
      }
      return {
        type: "rating",
        answered: given.length,
        average: given.length ? Math.round((sum / given.length) * 10) / 10 : null,
        counts,
      };
    }
    case "text":
      return {
        type: "text",
        answered: given.length,
        answers: given.map((x) => ({ text: x.a as string, ...(x.name ? { name: x.name } : {}) })),
      };
  }
}

export function surveyToCsv(survey: Survey, responses: SurveyResponse[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = [...(survey.anonymous ? [] : ["Name"]), ...survey.questions.map((q) => q.prompt)];
  const rows = responses.map((r) => [
    ...(survey.anonymous ? [] : [r.name ?? ""]),
    ...survey.questions.map((q) => {
      const a = r.answers?.[q.id];
      return a == null ? "" : Array.isArray(a) ? a.join("; ") : String(a);
    }),
  ]);
  return [header, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}

export interface SurveyTemplate {
  id: string;
  emoji: string;
  name: string;
  blurb: string;
  title: string;
  description?: string;
  anonymous: boolean;
  questions: Omit<SurveyQuestion, "id">[];
}

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    id: "season",
    emoji: "🏁",
    name: "End of season",
    blurb: "How the season went and what to change",
    title: "End of season survey",
    description: "Help us plan next season. Takes about 3 minutes.",
    anonymous: true,
    questions: [
      { type: "rating", prompt: "How would you rate this season overall?", required: true },
      { type: "rating", prompt: "How well did practices prepare you for races?", required: false },
      {
        type: "multi",
        prompt: "Which practice times work for you?",
        options: ["Weekday mornings", "Weekday evenings", "Saturday", "Sunday"],
        required: false,
      },
      { type: "single", prompt: "Will you paddle with us next season?", options: ["Yes", "Maybe", "No"], required: true },
      { type: "text", prompt: "What did you enjoy most?", required: false },
      { type: "text", prompt: "What should we change?", required: false },
    ],
  },
  {
    id: "race",
    emoji: "🛶",
    name: "Race debrief",
    blurb: "Quick feedback after a regatta",
    title: "Race debrief",
    anonymous: false,
    questions: [
      { type: "rating", prompt: "How did your race feel?", required: true },
      {
        type: "single",
        prompt: "How was the race-day logistics (rigging, tent, timing)?",
        options: ["Smooth", "Mostly fine", "Needs work"],
        required: false,
      },
      { type: "text", prompt: "One thing that went well", required: false },
      { type: "text", prompt: "One thing to work on", required: false },
    ],
  },
  {
    id: "practice",
    emoji: "📅",
    name: "Practice times",
    blurb: "Find the slots most people can make",
    title: "Practice time poll",
    anonymous: false,
    questions: [
      {
        type: "multi",
        prompt: "Which times can you usually make?",
        options: ["Weekdays 5–6:30am", "Weekdays 5:30–7pm", "Saturday morning", "Sunday morning"],
        required: true,
      },
      { type: "single", prompt: "How many practices a week do you want?", options: ["1", "2", "3", "4+"], required: false },
    ],
  },
];

export const newQuestionId = () => Math.random().toString(36).slice(2, 10);

// ── Firestore ───────────────────────────────────────────────────────────────

const surveysCol = (clubId: string) => collection(db, "clubs", clubId, "surveys");

export function subscribeSurveys(
  clubId: string,
  onSurveys: (surveys: Survey[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(surveysCol(clubId), orderBy("createdAt", "desc"), limit(50)),
    (snap) => onSurveys(snap.docs.map((d) => ({ ...(d.data() as Omit<Survey, "id">), id: d.id }))),
    (e) => onError?.(e),
  );
}

export async function getSurvey(clubId: string, surveyId: string): Promise<Survey | null> {
  const snap = await getDoc(doc(surveysCol(clubId), surveyId));
  return snap.exists() ? { ...(snap.data() as Omit<Survey, "id">), id: snap.id } : null;
}

export interface SurveyDraft {
  title: string;
  description?: string;
  questions: SurveyQuestion[];
  anonymous: boolean;
  closesAt?: number;
}

function surveyFields(d: SurveyDraft) {
  const description = d.description?.trim();
  return {
    title: d.title.trim(),
    questions: d.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt.trim(),
      required: q.required,
      ...(q.type === "single" || q.type === "multi"
        ? { options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) }
        : {}),
    })),
    ...(description ? { description } : {}),
  };
}

/** Problems that would stop a draft saving, in plain words; empty when fine. */
export function draftProblems(d: SurveyDraft): string[] {
  const out: string[] = [];
  if (!d.title.trim()) out.push("Give the survey a title.");
  if (d.questions.length === 0) out.push("Add at least one question.");
  d.questions.forEach((q, i) => {
    if (!q.prompt.trim()) out.push(`Question ${i + 1} needs some text.`);
    if ((q.type === "single" || q.type === "multi") && (q.options ?? []).filter((o) => o.trim()).length < 2) {
      out.push(`Question ${i + 1} needs at least two choices.`);
    }
  });
  return out;
}

export async function createSurvey(clubId: string, uid: string, d: SurveyDraft): Promise<string> {
  const ref = await addDoc(surveysCol(clubId), {
    ...surveyFields(d),
    anonymous: d.anonymous,
    status: "open",
    createdBy: uid,
    createdAt: new Date().toISOString(),
    ...(d.closesAt != null ? { closesAt: d.closesAt } : {}),
  });
  return ref.id;
}

export async function updateSurvey(clubId: string, surveyId: string, d: SurveyDraft): Promise<void> {
  const fields = surveyFields(d);
  await updateDoc(doc(surveysCol(clubId), surveyId), {
    ...fields,
    description: fields.description ?? deleteField(),
    closesAt: d.closesAt ?? deleteField(),
  });
}

export async function setSurveyStatus(clubId: string, surveyId: string, status: "open" | "closed"): Promise<void> {
  await updateDoc(doc(surveysCol(clubId), surveyId), {
    status,
    ...(status === "open" ? { closesAt: deleteField() } : {}),
  });
}

export async function deleteSurvey(clubId: string, surveyId: string): Promise<void> {
  const ref = doc(surveysCol(clubId), surveyId);
  for (const sub of ["responses", "respondents"]) {
    const snap = await getDocs(collection(ref, sub));
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await deleteDoc(ref);
}

export async function getMySurveyResponse(
  clubId: string,
  survey: Survey,
  uid: string,
): Promise<{ submitted: boolean; answers?: Record<string, SurveyAnswer> }> {
  const ref = doc(surveysCol(clubId), survey.id);
  if (survey.anonymous) {
    const marker = await getDoc(doc(ref, "respondents", uid));
    return { submitted: marker.exists() };
  }
  const mine = await getDoc(doc(ref, "responses", uid));
  return mine.exists()
    ? { submitted: true, answers: (mine.data() as SurveyResponse).answers }
    : { submitted: false };
}

export async function submitSurveyResponse(
  clubId: string,
  survey: Survey,
  uid: string,
  name: string,
  answers: Record<string, SurveyAnswer>,
): Promise<void> {
  const ref = doc(surveysCol(clubId), survey.id);
  const now = new Date().toISOString();
  if (survey.anonymous) {
    const batch = writeBatch(db);
    batch.set(doc(ref, "respondents", uid), {});
    batch.set(doc(collection(ref, "responses")), { answers });
    await batch.commit();
    return;
  }
  const mine = doc(ref, "responses", uid);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(mine);
    tx.set(mine, {
      uid,
      name,
      answers,
      submittedAt: existing.exists() ? (existing.data().submittedAt as string) : now,
      updatedAt: now,
    });
  });
}

export async function getSurveyRespondentUids(clubId: string, survey: Survey): Promise<string[]> {
  const ref = doc(surveysCol(clubId), survey.id);
  const snap = await getDocs(collection(ref, survey.anonymous ? "respondents" : "responses"));
  return snap.docs.map((d) => d.id);
}

export async function getSurveyResponses(clubId: string, surveyId: string): Promise<SurveyResponse[]> {
  const snap = await getDocs(collection(doc(surveysCol(clubId), surveyId), "responses"));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<SurveyResponse, "id">), id: d.id }));
}
