import { GoogleGenAI, Type } from '@google/genai';
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL } from '../config/embedding';

// Verified live against generativelanguage.googleapis.com on 2026-08-27 —
// gemini-2.5-flash is retired for new users; gemini-flash-latest is the
// current stable fast-tier alias.
const GENERATION_MODEL = 'gemini-flash-latest';

let client: GoogleGenAI | null = null;

function getClient(apiKey: string): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export interface JobSignals {
  skillLabels: string[];
  allowsTelework: boolean;
  teleworkPercentageMax: number;
  shortageOccupationMatch: string | null;
  // ISO 8601 date (YYYY-MM-DD), or null. Neither EURES nor Silicon Luxembourg
  // expose a structured deadline field — this is a best-effort read of the
  // description text (e.g. "apply by...", "closing date..."), so it's null
  // far more often than not.
  applicationDeadline: string | null;
}

const JOB_SIGNALS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    skillLabels: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Concise skill/competency phrases requested by the job, in English, suitable for looking up in the ESCO skills taxonomy (e.g. "cloud infrastructure", "risk management"). 3-12 items.',
    },
    allowsTelework: {
      type: Type.BOOLEAN,
      description:
        'True if the description mentions remote work, telework, home office, or hybrid work as available for this role.',
    },
    teleworkPercentageMax: {
      type: Type.NUMBER,
      description:
        'Best-effort estimate of the maximum percentage of working time that can be done remotely (0-100). If the description says e.g. "2 days remote per week", estimate as a percentage of a 5-day week (40). If telework is not mentioned, use 0.',
    },
    shortageOccupationMatch: {
      type: Type.STRING,
      nullable: true,
      description:
        'If this job clearly matches one of the provided ADEM shortage occupation titles, return that title EXACTLY as given in the list. Otherwise return null. Do not invent a title that is not in the list.',
    },
    applicationDeadline: {
      type: Type.STRING,
      nullable: true,
      description:
        'If the description explicitly states an application deadline / closing date, return it as an ISO 8601 date (YYYY-MM-DD). Otherwise return null. Do not guess or infer one from unrelated dates (e.g. a start date).',
    },
  },
  required: [
    'skillLabels',
    'allowsTelework',
    'teleworkPercentageMax',
    'shortageOccupationMatch',
    'applicationDeadline',
  ],
};

export async function extractJobSignals(
  apiKey: string,
  title: string,
  rawDescription: string,
  shortageOccupationTitles: string[]
): Promise<JobSignals> {
  const ai = getClient(apiKey);
  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: `Job title: ${title}\n\nJob description:\n${rawDescription.slice(0, 8000)}\n\nADEM shortage occupation titles (French):\n${shortageOccupationTitles.map((t) => `- ${t}`).join('\n')}`,
    config: {
      systemInstruction:
        'You extract structured signals from Luxembourg job vacancy postings for a job-matching pipeline. Respond only with the requested JSON.',
      responseMimeType: 'application/json',
      responseSchema: JOB_SIGNALS_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned no text for job signal extraction');
  }
  const parsed = JSON.parse(text) as JobSignals;
  const shortageMatch =
    parsed.shortageOccupationMatch &&
    shortageOccupationTitles.includes(parsed.shortageOccupationMatch)
      ? parsed.shortageOccupationMatch
      : null;
  const deadline =
    parsed.applicationDeadline && !Number.isNaN(Date.parse(parsed.applicationDeadline))
      ? parsed.applicationDeadline
      : null;
  return {
    skillLabels: parsed.skillLabels ?? [],
    allowsTelework: Boolean(parsed.allowsTelework),
    teleworkPercentageMax: Math.max(
      0,
      Math.min(100, Number(parsed.teleworkPercentageMax) || 0)
    ),
    shortageOccupationMatch: shortageMatch,
    applicationDeadline: deadline,
  };
}

export interface GeneratedApplication {
  reorderedCvBulletIds: string[];
  coverLetter: string;
  generationRationale: string;
}

const APPLICATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reorderedCvBulletIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'The provided CV bullet IDs, reordered with the most relevant bullets for this specific job first. Must include every ID exactly once — do not drop or invent IDs.',
    },
    coverLetter: {
      type: Type.STRING,
      description:
        "A concise, specific cover letter (3-4 short paragraphs) addressing this employer's stated requirements directly. Acknowledge Luxembourg/Greater Region market context (multilingual environment, cross-border commuting) only where genuinely relevant to the role — don't force it. No placeholders like [Company Name].",
    },
    generationRationale: {
      type: Type.STRING,
      description:
        'One or two sentences explaining why the bullets were reordered this way, for the candidate to review.',
    },
  },
  required: ['reorderedCvBulletIds', 'coverLetter', 'generationRationale'],
};

export async function generateApplication(
  apiKey: string,
  params: {
    candidateName: string;
    jobTitle: string;
    employer: string;
    jobDescription: string;
    cvBullets: { id: string; text: string }[];
  }
): Promise<GeneratedApplication> {
  const ai = getClient(apiKey);
  const bulletList = params.cvBullets
    .map((b) => `- [${b.id}] ${b.text}`)
    .join('\n');
  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: `Candidate: ${params.candidateName}\n\nJob title: ${params.jobTitle}\nEmployer: ${params.employer}\n\nJob description:\n${params.jobDescription.slice(0, 8000)}\n\nCandidate's available CV bullets:\n${bulletList}`,
    config: {
      systemInstruction:
        'You help a candidate tailor their application to a specific Luxembourg-area job vacancy. Reorder their existing CV bullets by relevance and draft a cover letter. Respond only with the requested JSON.',
      responseMimeType: 'application/json',
      responseSchema: APPLICATION_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned no text for application generation');
  }
  const parsed = JSON.parse(text) as GeneratedApplication;
  const validIds = new Set(params.cvBullets.map((b) => b.id));
  const reorderedCvBulletIds = (parsed.reorderedCvBulletIds ?? []).filter(
    (id) => validIds.has(id)
  );
  // Guard against Gemini dropping/inventing IDs — fall back to original
  // order for any bullets it didn't return, appended at the end.
  for (const bullet of params.cvBullets) {
    if (!reorderedCvBulletIds.includes(bullet.id)) {
      reorderedCvBulletIds.push(bullet.id);
    }
  }

  return {
    reorderedCvBulletIds,
    coverLetter: parsed.coverLetter ?? '',
    generationRationale: parsed.generationRationale ?? '',
  };
}

export async function embedText(
  apiKey: string,
  text: string
): Promise<number[]> {
  const ai = getClient(apiKey);
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text.slice(0, 8000),
    config: { outputDimensionality: EMBEDDING_DIMENSION },
  });
  const values = response.embeddings?.[0]?.values;
  if (!values) {
    throw new Error('Gemini returned no embedding values');
  }
  return values;
}

export interface ExtractedCvBullet {
  text: string;
  tags: string[];
  employer: string | null;
  period: string | null;
}

const CV_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    bullets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: {
            type: Type.STRING,
            description:
              'One concise achievement/responsibility statement, written substantively as it appears in the source CV. Do not invent or embellish content not present in the document.',
          },
          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2-5 short skill/role keywords this bullet demonstrates (e.g. "Angular", "Full-Stack Lead").',
          },
          employer: {
            type: Type.STRING,
            nullable: true,
            description: "The employer/company this bullet's role is under, exactly as written. Null if not tied to a specific employer (e.g. a summary line).",
          },
          period: {
            type: Type.STRING,
            nullable: true,
            description: 'The date range for that role as written in the CV (e.g. "2021 - Present"). Null if unknown.',
          },
        },
        required: ['text', 'tags', 'employer', 'period'],
      },
    },
  },
  required: ['bullets'],
};

// Extracts CV bullets directly from a PDF's content — Gemini reads the PDF
// natively (no separate text-extraction library needed). Used by
// admin/parseCvPdfCallable.ts; the caller always treats the result as a
// review-before-save draft, never writes it straight to Firestore, since
// LLM extraction from a real document can still misread text.
export async function extractCvBulletsFromPdf(
  apiKey: string,
  pdfBase64: string
): Promise<ExtractedCvBullet[]> {
  const ai = getClient(apiKey);
  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          {
            text: 'Extract every distinct achievement/responsibility bullet point from this CV/resume. For each, identify the employer and date range it belongs to if the CV is structured that way, and 2-5 short skill/role tags. Preserve the language the bullet is originally written in — do not translate.',
          },
        ],
      },
    ],
    config: {
      systemInstruction:
        'You extract structured CV/resume content for a job-matching pipeline. Only extract what is actually present in the document — never fabricate employers, dates, or achievements. Respond only with the requested JSON.',
      responseMimeType: 'application/json',
      responseSchema: CV_EXTRACTION_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned no text for CV extraction');
  }
  const parsed = JSON.parse(text) as { bullets: ExtractedCvBullet[] };
  return (parsed.bullets ?? [])
    .map((b) => ({
      text: (b.text ?? '').trim(),
      tags: Array.isArray(b.tags) ? b.tags.filter((t) => typeof t === 'string') : [],
      employer: b.employer || null,
      period: b.period || null,
    }))
    .filter((b) => b.text.length > 0);
}

export interface TailoredCvContent {
  professionalSummary: string;
  bullets: { text: string; employer: string | null; period: string | null }[];
}

const TAILORED_CV_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    professionalSummary: {
      type: Type.STRING,
      description: '2-3 sentence professional summary tailored to this specific job, written in the requested language.',
    },
    bullets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: {
            type: Type.STRING,
            description: "The bullet's text, translated into the requested language if it wasn't already in that language. Do not change its factual content.",
          },
          employer: { type: Type.STRING, nullable: true },
          period: { type: Type.STRING, nullable: true },
        },
        required: ['text', 'employer', 'period'],
      },
      description: 'The candidate\'s bullets that are most relevant to this job, ordered most-relevant first. Include every bullet that has genuine relevance; omit ones that don\'t.',
    },
  },
  required: ['professionalSummary', 'bullets'],
};

// Selects/reorders a candidate's CV bullets by relevance to a specific job
// and writes everything in the requested language — used by
// documents/generateTailoredCvCallable.ts to build a job-specific CV PDF.
// Distinct from generateApplication()'s cover-letter reordering: this keeps
// employer/period attached (needed for a real "Work Experience" section) and
// translates rather than just reordering in the original language.
export async function generateTailoredCvContent(
  apiKey: string,
  params: {
    candidateName: string;
    jobTitle: string;
    employer: string;
    jobDescription: string;
    language: string;
    cvBullets: { text: string; employer: string | null; period: string | null }[];
  }
): Promise<TailoredCvContent> {
  const ai = getClient(apiKey);
  const bulletList = params.cvBullets
    .map((b) => `- ${b.text}${b.employer ? ` [${b.employer}${b.period ? `, ${b.period}` : ''}]` : ''}`)
    .join('\n');
  const response = await ai.models.generateContent({
    model: GENERATION_MODEL,
    contents: `Candidate: ${params.candidateName}\n\nTarget job: ${params.jobTitle} at ${params.employer}\n\nJob description:\n${params.jobDescription.slice(0, 8000)}\n\nCandidate's full CV bullets:\n${bulletList}\n\nWrite all output in this language: ${params.language}.`,
    config: {
      systemInstruction:
        'You tailor a candidate\'s existing CV content to a specific job for a Luxembourg-area job-application tool. Select and reorder their real bullets by relevance — never invent new achievements. Respond only with the requested JSON.',
      responseMimeType: 'application/json',
      responseSchema: TAILORED_CV_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned no text for CV tailoring');
  }
  const parsed = JSON.parse(text) as TailoredCvContent;
  return {
    professionalSummary: parsed.professionalSummary ?? '',
    bullets: (parsed.bullets ?? []).map((b) => ({
      text: b.text ?? '',
      employer: b.employer || null,
      period: b.period || null,
    })),
  };
}
