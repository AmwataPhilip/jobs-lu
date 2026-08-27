import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { PersonaId } from '../config/personas';
import { Vacancy } from '../models/vacancy';

const COLLECTIONS = {
  Vacancies: 'jobslu_vacancies',
  Applications: 'jobslu_applications',
  Personas: 'jobslu_personas',
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

const TOP_MATCH_THRESHOLD = 0.8;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEADLINE_WINDOW_MS = 3 * DAY_MS;

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

async function fetchRecentTopMatches(
  personaId: PersonaId,
  since: Date
): Promise<Vacancy[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection(COLLECTIONS.Vacancies)
    .where('matchedPersona', '==', personaId)
    .where('status', 'in', ['matched', 'applied'])
    .where('matchScore', '>=', TOP_MATCH_THRESHOLD)
    .get();

  const sinceTime = since.getTime();
  const recent: Vacancy[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() as Vacancy;
    let matchTime = 0;

    if (data.postedAt instanceof Timestamp) {
      matchTime = data.postedAt.toMillis();
    } else if (data.ingestedAt instanceof Timestamp) {
      matchTime = data.ingestedAt.toMillis();
    }

    // Include if ingested/posted within the window or if timestamp is fresh
    if (matchTime === 0 || matchTime >= sinceTime) {
      recent.push(data);
    }
  }

  // Sort highest match score first
  return recent.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
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
  const upcoming: UpcomingDeadlineItem[] = [];

  for (const appDoc of appsSnapshot.docs) {
    const appData = appDoc.data();
    const jobId = appData['jobId'] || appDoc.id;
    const vacancyDoc = await db.collection(COLLECTIONS.Vacancies).doc(jobId).get();

    if (!vacancyDoc.exists) {
      continue;
    }

    const vacancy = vacancyDoc.data() as Vacancy;
    if (vacancy.applicationDeadline instanceof Timestamp) {
      const deadlineDate = vacancy.applicationDeadline.toDate();
      const deadlineTime = deadlineDate.getTime();

      if (deadlineTime >= now && deadlineTime <= cutoff) {
        upcoming.push({
          jobId,
          title: vacancy.title,
          employer: vacancy.employer || 'Not disclosed',
          deadline: deadlineDate,
          matchScore: Math.round((vacancy.matchScore ?? 0) * 100),
        });
      }
    }
  }

  // Sort closest deadline first
  return upcoming.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}

function buildEmailHtml(
  displayName: string,
  newMatches: Vacancy[],
  upcomingDeadlines: UpcomingDeadlineItem[]
): string {
  const matchesHtml = newMatches.length > 0
    ? `
      <div style="margin-bottom: 28px;">
        <h2 style="font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #E2883A; margin: 0 0 14px 0;">
          🎯 New Top-Tier Matches (≥80%)
        </h2>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${newMatches
            .map((m) => {
              const score = Math.round((m.matchScore ?? 0) * 100);
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
  upcomingDeadlines: UpcomingDeadlineItem[]
): string {
  let text = `EU WORKME - Daily Digest for ${displayName}\n\n`;

  if (newMatches.length > 0) {
    text += `=== NEW TOP-TIER MATCHES (≥80%) ===\n`;
    for (const m of newMatches) {
      const score = Math.round((m.matchScore ?? 0) * 100);
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

export async function sendDailyDigest(
  resendApiKey: string | undefined
): Promise<DigestSummary[]> {
  const since = new Date(Date.now() - DAY_MS);
  const personas: PersonaId[] = ['philip', 'chiara'];
  const results: DigestSummary[] = [];

  for (const personaId of personas) {
    const config = PERSONA_CONFIG[personaId];
    try {
      const newMatches = await fetchRecentTopMatches(personaId, since);
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

      if (!resendApiKey) {
        logger.warn('Skipping email delivery: JOBSLU_RESEND_API_KEY is not configured', {
          personaId,
          newMatchCount: newMatches.length,
          deadlineCount: upcomingDeadlines.length,
        });
        results.push({
          personaId,
          recipientEmail: config.email,
          newMatches,
          upcomingDeadlines,
          emailSent: false,
          error: 'JOBSLU_RESEND_API_KEY not configured',
        });
        continue;
      }

      const subject = `EU WorkMe: ${newMatches.length} new match${newMatches.length === 1 ? '' : 'es'}${
        upcomingDeadlines.length > 0 ? `, ${upcomingDeadlines.length} deadline${upcomingDeadlines.length === 1 ? '' : 's'} approaching` : ''
      }`;

      const html = buildEmailHtml(config.displayName, newMatches, upcomingDeadlines);
      const text = buildEmailPlainText(config.displayName, newMatches, upcomingDeadlines);

      await sendEmailViaResend(resendApiKey, config.email, subject, html, text);

      logger.info('Digest email sent successfully', {
        personaId,
        recipient: config.email,
        matchCount: newMatches.length,
        deadlinesCount: upcomingDeadlines.length,
      });

      results.push({
        personaId,
        recipientEmail: config.email,
        newMatches,
        upcomingDeadlines,
        emailSent: true,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send digest email', { personaId, error: errorMsg });
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
