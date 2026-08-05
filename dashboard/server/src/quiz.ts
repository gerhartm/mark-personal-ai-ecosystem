import { randomUUID } from 'node:crypto';
import { audit, db, one } from './db.js';
import { generateWithHermes } from './hermes-client.js';
import * as tools from './tools.js';

const QUESTION_TYPES = ['factual', 'connection', 'principle', 'cite_source'] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

export class QuizInputError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

type QuizInput = {
  focus?: string;
  question_count?: number;
};

type GeneratedQuestion = {
  question_text: string;
  question_type: QuestionType;
  category: string | null;
  answer_guidance: string;
  event_ids: string[];
};

type SubmittedAnswer = {
  question_id?: string;
  answer_text?: string;
};

const compact = (value: unknown, limit: number) => String(value ?? '').trim().slice(0, limit);

function parseJson<T>(value: string): T {
  const clean = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(clean) as T;
  } catch {
    throw new QuizInputError('invalid_generation', 'Hermes returned an invalid quiz, so nothing was saved.', 503);
  }
}

function eventEvidence(id: string) {
  const event = tools.getEvent(id) as any;
  if (!event) return null;
  return {
    id: event.id,
    subject_date: event.subject_date,
    category: event.primary_category,
    significance: event.significance,
    summary: compact(event.summary, 700),
    business_signal: compact(event.business_signal, 520),
    underlying_principle: compact(event.underlying_principle, 520),
    insights: (event.insights ?? []).slice(0, 5).map((item: any) => compact(item.text, 360)),
    source: compact(event.source?.title ?? event.source?.source_label, 180),
  };
}

function quizEvidence(focus: string) {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };

  if (focus) {
    for (const hit of tools.search(focus, 18).results as any[]) {
      if (hit.kind === 'event') add(hit.canonical_id);
      if (ids.length >= 12) break;
    }
  }

  const preferred = tools.findEvents({ sort: 'significance', limit: 24 }).events as any[];
  for (const event of preferred) {
    add(event.id);
    if (ids.length >= 12) break;
  }

  return ids.map(eventEvidence).filter(Boolean);
}

function validateGeneratedQuestions(value: unknown, allowedIds: Set<string>, count: number) {
  const raw = Array.isArray(value) ? value : (value as any)?.questions;
  if (!Array.isArray(raw) || raw.length !== count) {
    throw new QuizInputError('invalid_generation', 'Hermes returned an incomplete quiz, so nothing was saved.', 503);
  }

  const seen = new Set<string>();
  return raw.map((item: any): GeneratedQuestion => {
    const questionText = compact(item?.question_text, 600);
    const guidance = compact(item?.answer_guidance, 1_600);
    const type = String(item?.question_type ?? '') as QuestionType;
    const eventIds: string[] = Array.isArray(item?.event_ids)
      ? [...new Set<string>(item.event_ids.map((id: unknown) => String(id)).filter((id: string) => allowedIds.has(id)))].slice(0, 4)
      : [];
    if (questionText.length < 12 || guidance.length < 12 || !QUESTION_TYPES.includes(type) || !eventIds.length) {
      throw new QuizInputError('invalid_generation', 'Hermes returned an ungrounded quiz, so nothing was saved.', 503);
    }
    const normalized = questionText.toLowerCase();
    if (seen.has(normalized)) {
      throw new QuizInputError('invalid_generation', 'Hermes returned duplicate questions, so nothing was saved.', 503);
    }
    seen.add(normalized);
    return {
      question_text: questionText,
      question_type: type,
      category: item?.category == null ? null : compact(item.category, 80),
      answer_guidance: guidance,
      event_ids: eventIds,
    };
  });
}

export function quizConfigured() {
  return Boolean(process.env.HERMES_BASE_URL);
}

export function quizStatus() {
  return { connected: quizConfigured(), default_question_count: 5 };
}

export async function createQuizSession(value: QuizInput, actor: string) {
  if (!quizConfigured()) {
    throw new QuizInputError(
      'intelligence_plane_not_connected',
      'Quiz generation is unavailable because the intelligence plane is not connected.',
      503,
    );
  }
  const focus = compact(value?.focus, 300);
  const count = Number(value?.question_count ?? 5);
  if (!Number.isInteger(count) || count < 3 || count > 8) {
    throw new QuizInputError('invalid_question_count', 'Choose between 3 and 8 questions.');
  }
  const evidence = quizEvidence(focus);
  if (evidence.length < 3) {
    throw new QuizInputError('evidence_unavailable', 'Not enough evidence is available to create this quiz.', 422);
  }

  const prompt = [
    `FOCUS\n${focus || 'A balanced knowledge check across the most significant stored crypto intelligence.'}`,
    `QUESTION COUNT\n${count}`,
    'OUTPUT CONTRACT\nReturn only valid JSON with a top-level "questions" array. Each item must contain question_text, question_type, category, answer_guidance, and event_ids. question_type must be factual, connection, principle, or cite_source. event_ids must contain one to four exact event IDs from the supplied evidence. Build a useful mix of factual recall, connections, implications, and source awareness. Do not reveal the answer inside the question.',
    `CORPUS EVIDENCE\n${evidence.map((record) => JSON.stringify(record)).join('\n')}`,
  ].join('\n\n').slice(0, 32_000);

  const generated = await generateWithHermes(prompt, {
    instructions: [
      "You are Hermes, the central intelligence brain in Mark Gerhart's private Crypto Intelligence system.",
      'Create a concise knowledge check using only the supplied evidence.',
      'Every question must be answerable from its linked records.',
      'Return only the requested JSON.',
    ],
    task: 'quiz_generation',
    maxTokens: 2_200,
    temperature: 0.2,
    timeoutMs: 120_000,
  });
  const questions = validateGeneratedQuestions(parseJson<any>(generated), new Set(evidence.map((item: any) => item.id)), count);
  const sessionId = `quiz_${randomUUID()}`;
  const createdAt = new Date().toISOString();

  db.transaction(() => {
    db.prepare('INSERT INTO quiz_sessions (id, created_at) VALUES (?, ?)').run(sessionId, createdAt);
    questions.forEach((question, index) => {
      const questionId = `question_${randomUUID()}`;
      db.prepare(
        `INSERT INTO quiz_questions
         (id, session_id, question_number, question_text, question_type, category, answer_guidance)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        questionId,
        sessionId,
        index + 1,
        question.question_text,
        question.question_type,
        question.category,
        question.answer_guidance,
      );
      question.event_ids.forEach((eventId, position) => {
        db.prepare(
          `INSERT INTO quiz_event_links (owner_type, owner_id, event_id, position)
           VALUES ('question', ?, ?, ?)`,
        ).run(questionId, eventId, position);
      });
    });
    audit(actor, 'quiz.generate', sessionId, { focus: focus || null, questions: count, evidence: evidence.length });
  })();
  return tools.getQuizSession(sessionId);
}

function validateAnswers(sessionId: string, answers: SubmittedAnswer[]) {
  const session = tools.getQuizSession(sessionId) as any;
  if (!session) throw new QuizInputError('not_found', 'Quiz session not found.', 404);
  if (session.completed_at) throw new QuizInputError('already_completed', 'This quiz has already been completed.', 409);
  if (!Array.isArray(answers) || answers.length !== session.questions.length) {
    throw new QuizInputError('incomplete_answers', 'Answer every question before finishing the quiz.');
  }
  const byId = new Map(answers.map((answer) => [String(answer?.question_id ?? ''), compact(answer?.answer_text, 4_000)]));
  const clean = session.questions.map((question: any) => {
    const answerText = byId.get(question.id) ?? '';
    if (answerText.length < 2) throw new QuizInputError('incomplete_answers', 'Answer every question before finishing the quiz.');
    return { question, answerText };
  });
  if (byId.size !== session.questions.length) {
    throw new QuizInputError('invalid_answers', 'One or more answers do not belong to this quiz.');
  }
  return { session, clean };
}

export async function gradeQuizSession(sessionId: string, answers: SubmittedAnswer[], actor: string) {
  if (!quizConfigured()) {
    throw new QuizInputError(
      'intelligence_plane_not_connected',
      'Quiz scoring is unavailable because the intelligence plane is not connected.',
      503,
    );
  }
  const { session, clean } = validateAnswers(sessionId, answers);
  const prompt = [
    'OUTPUT CONTRACT\nReturn only valid JSON with a top-level "results" array. Return exactly one result per question. Each result must contain question_id, is_correct as a boolean, and feedback. Feedback should be two or three useful sentences: first explain what the answer got right or missed, then state the key idea from the guidance. Grade for demonstrated understanding, not exact wording.',
    `QUIZ\n${clean.map(({ question, answerText }: any) => JSON.stringify({
      question_id: question.id,
      question_text: question.question_text,
      answer_guidance: question.answer_guidance,
      answer: answerText,
      evidence: question.events,
    })).join('\n')}`,
  ].join('\n\n').slice(0, 32_000);

  const generated = await generateWithHermes(prompt, {
    instructions: [
      "You are Hermes, the central intelligence brain in Mark Gerhart's private Crypto Intelligence system.",
      'Evaluate the submitted answers against the supplied guidance and evidence.',
      'Be fair, direct, and educational.',
      'Return only the requested JSON.',
    ],
    task: 'quiz_grading',
    maxTokens: 2_200,
    temperature: 0.1,
    timeoutMs: 120_000,
  });

  const parsed = parseJson<any>(generated);
  const results = Array.isArray(parsed) ? parsed : parsed?.results;
  if (!Array.isArray(results) || results.length !== clean.length) {
    throw new QuizInputError('invalid_grading', 'Hermes returned an incomplete score, so no answers were saved.', 503);
  }
  const allowed = new Set(clean.map(({ question }: any) => question.id));
  const seen = new Set<string>();
  const validated = results.map((result: any) => {
    const questionId = String(result?.question_id ?? '');
    const feedback = compact(result?.feedback, 1_600);
    if (!allowed.has(questionId) || seen.has(questionId) || typeof result?.is_correct !== 'boolean' || feedback.length < 8) {
      throw new QuizInputError('invalid_grading', 'Hermes returned an invalid score, so no answers were saved.', 503);
    }
    seen.add(questionId);
    return { questionId, isCorrect: result.is_correct, feedback };
  });
  const answerByQuestion = new Map(clean.map(({ question, answerText }: any) => [question.id, answerText]));
  const completedAt = new Date().toISOString();
  const score = validated.filter((item) => item.isCorrect).length;

  db.transaction(() => {
    validated.forEach((result) => {
      db.prepare(
        `INSERT INTO quiz_answers
         (id, session_id, question_id, answer_text, is_correct, feedback, context_note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `answer_${randomUUID()}`,
        sessionId,
        result.questionId,
        answerByQuestion.get(result.questionId),
        result.isCorrect ? 1 : 0,
        result.feedback,
        'Generated and graded from the linked stored intelligence by Hermes.',
        completedAt,
      );
    });
    db.prepare(
      'UPDATE quiz_sessions SET completed_at = ?, score_correct = ?, score_total = ? WHERE id = ?',
    ).run(completedAt, score, validated.length, sessionId);
    audit(actor, 'quiz.complete', sessionId, { score_correct: score, score_total: validated.length });
  })();
  return tools.getQuizSession(session.id);
}
