import {
  cleanAnswers,
  hasAnswer,
  isSurveyOpen,
  missingRequired,
  SURVEY_OPTIONS_MAX,
  SURVEY_PROMPT_MAX,
  SURVEY_QUESTIONS_MAX,
  SURVEY_TEMPLATES,
  SURVEY_TITLE_MAX,
  surveyToCsv,
  surveyWhen,
  tallyQuestion,
  type Survey,
  type SurveyQuestion,
  type SurveyResponse,
} from "../club";

const single: SurveyQuestion = { id: "s", type: "single", prompt: "Back next season?", options: ["Yes", "Maybe", "No"], required: true };
const multi: SurveyQuestion = { id: "m", type: "multi", prompt: "Times?", options: ["AM", "PM", "Sat"], required: false };
const rating: SurveyQuestion = { id: "r", type: "rating", prompt: "Season?", required: true };
const text: SurveyQuestion = { id: "t", type: "text", prompt: "Change what?", required: false };
const qs = [single, multi, rating, text];

const resp = (id: string, answers: SurveyResponse["answers"], name?: string): SurveyResponse => ({
  id,
  answers,
  ...(name ? { name } : {}),
});

describe("isSurveyOpen / surveyWhen", () => {
  it("respects status and close time", () => {
    expect(isSurveyOpen({ status: "open" })).toBe(true);
    expect(isSurveyOpen({ status: "closed" })).toBe(false);
    expect(isSurveyOpen({ status: "open", closesAt: 1000 }, 999)).toBe(true);
    expect(isSurveyOpen({ status: "open", closesAt: 1000 }, 1000)).toBe(false);
    expect(surveyWhen({ status: "open", closesAt: 1000 }, 2000)).toBe("Closed");
    expect(surveyWhen({ status: "open" })).toBe("Open");
  });
});

describe("hasAnswer / missingRequired", () => {
  it("treats empty and out-of-range answers as missing", () => {
    expect(hasAnswer(rating, 0)).toBe(false);
    expect(hasAnswer(rating, 6)).toBe(false);
    expect(hasAnswer(rating, 3)).toBe(true);
    expect(hasAnswer(text, "   ")).toBe(false);
    expect(hasAnswer(multi, [])).toBe(false);
    expect(hasAnswer(single, "")).toBe(false);
  });

  it("lists required prompts still unanswered, in order", () => {
    expect(missingRequired(qs, { r: 4 })).toEqual(["Back next season?"]);
    expect(missingRequired(qs, { s: "Yes", r: 4 })).toEqual([]);
  });
});

describe("cleanAnswers", () => {
  it("drops empties, trims text, and drops unknown choices", () => {
    expect(
      cleanAnswers(qs, { s: "Yes", m: ["AM", "Bogus"], r: 0, t: "  more paddling  ", extra: "x" }),
    ).toEqual({ s: "Yes", m: ["AM"], t: "more paddling" });
  });
});

describe("tallyQuestion", () => {
  const responses = [
    resp("1", { s: "Yes", m: ["AM", "Sat"], r: 5, t: "More races" }, "Kai"),
    resp("2", { s: "Yes", m: ["Sat"], r: 3 }, "Noa"),
    resp("3", { s: "No", r: 4 }),
    resp("4", {}),
  ];

  it("counts single and multi choices", () => {
    const s = tallyQuestion(single, responses);
    expect(s).toMatchObject({ type: "single", answered: 3 });
    expect(s.type !== "text" && s.type !== "rating" && s.counts).toEqual([
      { option: "Yes", count: 2 },
      { option: "Maybe", count: 0 },
      { option: "No", count: 1 },
    ]);
    const m = tallyQuestion(multi, responses);
    expect(m.type === "multi" && m.counts.map((c) => c.count)).toEqual([1, 0, 2]);
  });

  it("averages ratings to one decimal and buckets them", () => {
    const r = tallyQuestion(rating, responses);
    expect(r).toEqual({ type: "rating", answered: 3, average: 4, counts: [0, 0, 1, 1, 1] });
    expect(tallyQuestion(rating, [])).toMatchObject({ average: null, answered: 0 });
  });

  it("collects written answers with names only when present", () => {
    expect(tallyQuestion(text, responses)).toEqual({
      type: "text",
      answered: 1,
      answers: [{ text: "More races", name: "Kai" }],
    });
  });
});

describe("surveyToCsv", () => {
  const survey: Survey = {
    id: "x", title: "T", questions: [single, multi, text], anonymous: false,
    status: "open", createdBy: "c", createdAt: "",
  };

  it("adds a Name column for named surveys and escapes commas/quotes/newlines", () => {
    const csv = surveyToCsv(survey, [resp("1", { s: "Yes", m: ["AM", "Sat"], t: 'He said "go", then\nleft' }, "Kai")]);
    expect(csv.split("\n")[0]).toBe("Name,Back next season?,Times?,Change what?");
    expect(csv).toContain('Kai,Yes,AM; Sat,"He said ""go"", then\nleft"');
  });

  it("has no Name column for anonymous surveys", () => {
    const csv = surveyToCsv({ ...survey, anonymous: true }, [resp("1", { s: "No" })]);
    expect(csv).toBe("Back next season?,Times?,Change what?\nNo,,");
  });
});

describe("SURVEY_TEMPLATES", () => {
  it("fit the limits firestore.rules and the editor enforce", () => {
    for (const t of SURVEY_TEMPLATES) {
      expect(t.title.length).toBeLessThanOrEqual(SURVEY_TITLE_MAX);
      expect(t.questions.length).toBeGreaterThan(0);
      expect(t.questions.length).toBeLessThanOrEqual(SURVEY_QUESTIONS_MAX);
      for (const q of t.questions) {
        expect(q.prompt.length).toBeLessThanOrEqual(SURVEY_PROMPT_MAX);
        if (q.type === "single" || q.type === "multi") {
          expect(q.options!.length).toBeGreaterThanOrEqual(2);
          expect(q.options!.length).toBeLessThanOrEqual(SURVEY_OPTIONS_MAX);
          expect(new Set(q.options).size).toBe(q.options!.length);
        } else {
          expect(q.options).toBeUndefined();
        }
      }
    }
  });

  it("includes an end-of-season template that is anonymous", () => {
    expect(SURVEY_TEMPLATES.find((t) => t.id === "season")?.anonymous).toBe(true);
  });
});
