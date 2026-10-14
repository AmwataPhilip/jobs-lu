import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { PersonaId } from '../config/personas';
import { Vacancy } from '../models/vacancy';

const COLLECTIONS = {
  Vacancies: 'jobslu_vacancies',
  Applications: 'jobslu_applications',
  Personas: 'jobslu_personas',
  Notifications: 'jobslu_notifications',
};

const PERSONA_CONFIG: Record<PersonaId, { displayName: string; email: string }> = {
  philip: {
    displayName: 'Philip Amwata',
    email: 'philip@amwatatech.com',
  },
  chiara: {
    displayName: 'Chiara Witry',
    email: 'chiarawitry5@gmail.com',
  },
};

// Keep in sync with the frontend's TOP_MATCH_THRESHOLD (70, as a percentage).
// Stored here as a 0–1 fraction since that's how matchScore is stored.
const TOP_MATCH_THRESHOLD = 0.7;
const THRESHOLD_PCT = Math.round(TOP_MATCH_THRESHOLD * 100);
const DAY_MS = 24 * 60 * 60 * 1000;
const DEADLINE_WINDOW_MS = 3 * DAY_MS;

// Fields the digest actually needs — avoids pulling rawDescription (and,
// pre-migration, any inline embedding) for every matched vacancy.
const MATCH_FIELDS = [
  'jobId',
  'title',
  'employer',
  'matchedPersona',
  'matchScore',
  'matchScores',
  'shortageOccupationMatch',
  'estimatedSalary',
  'postedAt',
  'ingestedAt',
  'matchedAt',
] as const;

interface UpcomingDeadlineItem {
  jobId: string;
  title: string;
  employer: string;
  deadline: Date;
  matchScore: number;
}

interface DigestSummary {
  personaId: PersonaId;
  recipientEmail: string;
  newMatches: Vacancy[];
  upcomingDeadlines: UpcomingDeadlineItem[];
  emailSent: boolean;
  error?: string;
}

export { TOP_MATCH_THRESHOLD, THRESHOLD_PCT };

// Effective score for a persona, handling both the per-persona matchScores map
// and pre-migration docs that only have the single primary matchScore.
export function personaScore(v: Vacancy, persona: PersonaId): number | null {
  const per = v.matchScores?.[persona];
  if (per != null) {
    return per;
  }
  return v.matchedPersona === persona ? v.matchScore : null;
}

// True if the match was (re)computed within the digest window. Prefers
// matchedAt — the moment scoreMatch ran — over postedAt/ingestedAt, so a job
// posted long ago but freshly matched today (common via the EURES backfill
// sweep) still counts as new. Falls back to posted/ingested for pre-migration
// docs that predate the matchedAt field.
export function isNewSince(v: Vacancy, since: Date): boolean {
  const sinceMs = since.getTime();
  if (v.matchedAt instanceof Timestamp) {
    return v.matchedAt.toMillis() >= sinceMs;
  }
  if (v.postedAt instanceof Timestamp) {
    return v.postedAt.toMillis() >= sinceMs;
  }
  if (v.ingestedAt instanceof Timestamp) {
    return v.ingestedAt.toMillis() >= sinceMs;
  }
  // No usable timestamp at all (shouldn't happen post-match) — surface it
  // rather than silently drop a genuinely-scored match.
  return true;
}

// One read of all active matches, reused across both personas.
async function fetchActiveMatches(): Promise<Vacancy[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTIONS.Vacancies)
    .where('status', 'in', ['matched', 'applied'])
    .select(...MATCH_FIELDS)
    .get();
  return snapshot.docs.map((doc) => doc.data() as Vacancy);
}

export function recentTopMatchesFor(
  allMatches: Vacancy[],
  personaId: PersonaId,
  since: Date
): Vacancy[] {
  return allMatches
    .filter((v) => {
      const score = personaScore(v, personaId);
      return score != null && score >= TOP_MATCH_THRESHOLD && isNewSince(v, since);
    })
    .sort((a, b) => (personaScore(b, personaId) ?? 0) - (personaScore(a, personaId) ?? 0));
}

async function fetchUpcomingDraftDeadlines(
  personaId: PersonaId
): Promise<UpcomingDeadlineItem[]> {
  const db = getFirestore();
  const appsSnapshot = await db
    .collection(COLLECTIONS.Applications)
    .where('persona', '==', personaId)
    .where('status', '==', 'draft')
    .get();

  if (appsSnapshot.empty) {
    return [];
  }

  const now = Date.now();
  const cutoff = now + DEADLINE_WINDOW_MS;

  // Batch the vacancy lookups into a single getAll instead of one get per app.
  const jobIds = appsSnapshot.docs.map((d) => (d.data()['jobId'] as string) || d.id);
  const vacancyRefs = jobIds.map((id) => db.collection(COLLECTIONS.Vacancies).doc(id));
  const vacancyDocs = vacancyRefs.length > 0 ? await db.getAll(...vacancyRefs) : [];

  const upcoming: UpcomingDeadlineItem[] = [];
  for (const vacancyDoc of vacancyDocs) {
    if (!vacancyDoc.exists) {
      continue;
    }
    const vacancy = vacancyDoc.data() as Vacancy;
    if (vacancy.applicationDeadline instanceof Timestamp) {
      const deadlineDate = vacancy.applicationDeadline.toDate();
      const deadlineTime = deadlineDate.getTime();
      if (deadlineTime >= now && deadlineTime <= cutoff) {
        upcoming.push({
          jobId: vacancyDoc.id,
          title: vacancy.title,
          employer: vacancy.employer || 'Not disclosed',
          deadline: deadlineDate,
          matchScore: Math.round((vacancy.matchScore ?? 0) * 100),
        });
      }
    }
  }

  return upcoming.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

function buildEmailHtml(
  displayName: string,
  newMatches: Vacancy[],
  upcomingDeadlines: UpcomingDeadlineItem[],
  personaId: PersonaId
): string {
  const matchesHtml = newMatches.length > 0
    ? `
      <div style="margin-bottom: 28px;">
        <h2 style="font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #E2883A; margin: 0 0 14px 0;">
          🎯 New Top-Tier Matches (≥${THRESHOLD_PCT}%)
        </h2>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${newMatches
            .map((m) => {
              const score = Math.round((personaScore(m, personaId) ?? m.matchScore ?? 0) * 100);
              const salary = m.estimatedSalary ? ` · €${m.estimatedSalary.toLocaleString('en-US')}` : '';
              const shortage = m.shortageOccupationMatch ? ` <span style="background: rgba(226,136,58,0.15); color: #E2883A; font-size: 11px; padding: 2px 6px; border-radius: 3px;">ADEM Shortage</span>` : '';
              return `
                <div style="padding: 14px; background: #221A16; border: 1px solid rgba(248,243,233,0.1); border-radius: 6px; margin-bottom: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <div style="font-size: 15px; font-weight: 600; color: #F8F3E9;">${m.title}</div>
                    <div style="font-family: monospace; font-size: 14px; font-weight: 600; color: #E2883A;">${score}%</div>
                  </div>
                  <div style="font-size: 13px; color: rgba(248,243,233,0.6); margin-top: 4px;">
                    ${m.employer}${salary}${shortage}
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `
    : '';

  const deadlinesHtml = upcomingDeadlines.length > 0
    ? `
      <div style="margin-bottom: 28px;">
        <h2 style="font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #C1432A; margin: 0 0 14px 0;">
          ⏳ Approaching Deadlines (Drafts within 3 days)
        </h2>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${upcomingDeadlines
            .map((d) => {
              const dateStr = d.deadline.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              });
              return `
                <div style="padding: 14px; background: #221A16; border: 1px solid rgba(193,67,42,0.3); border-radius: 6px; margin-bottom: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <div style="font-size: 15px; font-weight: 600; color: #F8F3E9;">${d.title}</div>
                    <div style="font-size: 12px; font-weight: 600; color: #C1432A;">Due: ${dateStr}</div>
                  </div>
                  <div style="font-size: 13px; color: rgba(248,243,233,0.6); margin-top: 4px;">
                    ${d.employer} · Match: ${d.matchScore}% (Draft ready for review)
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #1A1310; color: #F8F3E9; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #1A1310; border: 1px solid rgba(248,243,233,0.12); border-radius: 8px; padding: 28px;">
          <div style="margin-bottom: 24px; border-bottom: 1px solid rgba(248,243,233,0.1); padding-bottom: 16px;">
            <h1 style="font-size: 18px; font-weight: 700; color: #F8F3E9; margin: 0; letter-spacing: 0.02em;">
              EU WORKME · Daily Digest
            </h1>
            <p style="font-size: 13px; color: rgba(248,243,233,0.5); margin: 4px 0 0 0;">
              Hello ${displayName}, here are your latest high-match roles and deadline reminders.
            </p>
          </div>

          ${matchesHtml}
          ${deadlinesHtml}

          <div style="margin-top: 32px; border-top: 1px solid rgba(248,243,233,0.1); padding-top: 16px; font-size: 12px; color: rgba(248,243,233,0.4); text-align: center;">
            EU WorkMe · Precision Luxembourg Career Aggregation & Compliance Portal
          </div>
        </div>
      </body>
    </html>
  `;
}

function buildEmailPlainText(
  displayName: string,
  newMatches: Vacancy[],
  upcomingDeadlines: UpcomingDeadlineItem[],
  personaId: PersonaId
): string {
  let text = `EU WORKME - Daily Digest for ${displayName}\n\n`;

  if (newMatches.length > 0) {
    text += `=== NEW TOP-TIER MATCHES (≥${THRESHOLD_PCT}%) ===\n`;
    for (const m of newMatches) {
      const score = Math.round((personaScore(m, personaId) ?? m.matchScore ?? 0) * 100);
      const salary = m.estimatedSalary ? ` (Est. €${m.estimatedSalary.toLocaleString('en-US')})` : '';
      const shortage = m.shortageOccupationMatch ? ' [ADEM Shortage]' : '';
      text += `* ${m.title} - ${m.employer} | Match: ${score}%${salary}${shortage}\n`;
    }
    text += `\n`;
  }

  if (upcomingDeadlines.length > 0) {
    text += `=== APPROACHING DEADLINES (Drafts within 3 days) ===\n`;
    for (const d of upcomingDeadlines) {
      text += `* ${d.title} - ${d.employer} | Due: ${d.deadline.toDateString()} (Match: ${d.matchScore}%)\n`;
    }
    text += `\n`;
  }

  text += `Log in to EU WorkMe to review dossier cover letters and CV alignments.`;
  return text;
}

async function sendEmailViaResend(
  apiKey: string,
  toEmail: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: 'EU WorkMe <notifications@amwatatech.com>',
      to: [toEmail],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend API failed (HTTP ${response.status}): ${errorBody}`);
  }
}

// Mirrors the digest into an in-app notification doc so the content is never
// lost when email isn't configured or delivery fails — the dashboard header
// surfaces unread ones (see jobslu_notifications rules + NotificationsService).
async function writeInAppNotification(
  personaId: PersonaId,
  newMatches: Vacancy[],
  upcomingDeadlines: UpcomingDeadlineItem[],
  emailSent: boolean
): Promise<void> {
  const db = getFirestore();
  const parts: string[] = [];
  if (newMatches.length > 0) {
    parts.push(`${newMatches.length} new top-tier match${newMatches.length === 1 ? '' : 'es'}`);
  }
  if (upcomingDeadlines.length > 0) {
    parts.push(`${upcomingDeadlines.length} deadline${upcomingDeadlines.length === 1 ? '' : 's'} within 3 days`);
  }
  await db.collection(COLLECTIONS.Notifications).add({
    persona: personaId,
    type: 'digest',
    title: 'Daily digest',
    summary: parts.join(' · '),
    newMatchCount: newMatches.length,
    deadlineCount: upcomingDeadlines.length,
    topMatches: newMatches.slice(0, 5).map((m) => ({
      jobId: m.jobId,
      title: m.title,
      employer: m.employer,
      score: Math.round((personaScore(m, personaId) ?? m.matchScore ?? 0) * 100),
    })),
    emailSent,
    createdAt: FieldValue.serverTimestamp(),
    readAt: null,
  });
}

export async function sendDailyDigest(
  resendApiKey: string | undefined
): Promise<DigestSummary[]> {
  const since = new Date(Date.now() - DAY_MS);
  const personas: PersonaId[] = ['philip', 'chiara'];
  const results: DigestSummary[] = [];
  const allMatches = await fetchActiveMatches();

  for (const personaId of personas) {
    const config = PERSONA_CONFIG[personaId];
    try {
      const newMatches = recentTopMatchesFor(allMatches, personaId, since);
      const upcomingDeadlines = await fetchUpcomingDraftDeadlines(personaId);

      if (newMatches.length === 0 && upcomingDeadlines.length === 0) {
        logger.info('No new matches or approaching deadlines for digest', { personaId });
        results.push({
          personaId,
          recipientEmail: config.email,
          newMatches: [],
          upcomingDeadlines: [],
          emailSent: false,
        });
        continue;
      }

      let emailSent = false;
      let error: string | undefined;

      if (resendApiKey) {
        try {
          const subject = `EU WorkMe: ${newMatches.length} new match${newMatches.length === 1 ? '' : 'es'}${
            upcomingDeadlines.length > 0 ? `, ${upcomingDeadlines.length} deadline${upcomingDeadlines.length === 1 ? '' : 's'} approaching` : ''
          }`;
          const html = buildEmailHtml(config.displayName, newMatches, upcomingDeadlines, personaId);
          const text = buildEmailPlainText(config.displayName, newMatches, upcomingDeadlines, personaId);
          await sendEmailViaResend(resendApiKey, config.email, subject, html, text);
          emailSent = true;
          logger.info('Digest email sent successfully', {
            personaId,
            recipient: config.email,
            matchCount: newMatches.length,
            deadlinesCount: upcomingDeadlines.length,
          });
        } catch (emailError) {
          error = emailError instanceof Error ? emailError.message : String(emailError);
          logger.error('Digest email delivery failed; falling back to in-app notification', {
            personaId,
            error,
          });
        }
      } else {
        error = 'JOBSLU_RESEND_API_KEY not configured';
        logger.warn('JOBSLU_RESEND_API_KEY unset; writing in-app notification only', {
          personaId,
          newMatchCount: newMatches.length,
          deadlineCount: upcomingDeadlines.length,
        });
      }

      // Always record the digest in-app, so it's available whether or not
      // email went out.
      await writeInAppNotification(personaId, newMatches, upcomingDeadlines, emailSent);

      results.push({
        personaId,
        recipientEmail: config.email,
        newMatches,
        upcomingDeadlines,
        emailSent,
        error,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to build digest', { personaId, error: errorMsg });
      results.push({
        personaId,
        recipientEmail: config.email,
        newMatches: [],
        upcomingDeadlines: [],
        emailSent: false,
        error: errorMsg,
      });
    }
  }

  return results;
}
