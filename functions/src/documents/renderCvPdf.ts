import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

// Europass-inspired blue, not the exact official hex — this is a styled
// homage (colored header band, sidebar-free single-column sections), not an
// attempt at the official Europass template or ELM/XML interchange format.
// See docs/APP_AUDIT.md's "Decided against" section for why ELM specifically
// isn't used here.
const HEADER_BLUE = rgb(0.106, 0.227, 0.42); // #1B3A6B
const INK = rgb(0.12, 0.12, 0.14);
const MUTED = rgb(0.4, 0.4, 0.42);
const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export interface CvPdfBullet {
  text: string;
  employer: string | null;
  period: string | null;
}

export interface CvPdfInput {
  candidateName: string;
  contactEmail: string;
  jobTitle: string;
  employer: string;
  professionalSummary: string;
  bullets: CvPdfBullet[];
  skills: string[];
  language: string;
}

function wrapText(font: PDFFont, size: number, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
      }
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}

interface Cursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
}

function newPage(doc: PDFDocument): PDFPage {
  return doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
}

function ensureSpace(cursor: Cursor, needed: number): void {
  if (cursor.y - needed < MARGIN) {
    cursor.page = newPage(cursor.doc);
    cursor.y = PAGE_HEIGHT - MARGIN;
  }
}

function drawParagraph(cursor: Cursor, text: string, size: number, font: PDFFont, color = INK, lineGap = 4): void {
  const lines = wrapText(font, size, text, CONTENT_WIDTH);
  for (const line of lines) {
    ensureSpace(cursor, size + lineGap);
    cursor.page.drawText(line, { x: MARGIN, y: cursor.y, size, font, color });
    cursor.y -= size + lineGap;
  }
}

function drawSectionHeading(cursor: Cursor, title: string): void {
  ensureSpace(cursor, 28);
  cursor.y -= 6;
  cursor.page.drawText(title.toUpperCase(), {
    x: MARGIN,
    y: cursor.y,
    size: 10,
    font: cursor.bold,
    color: HEADER_BLUE,
  });
  cursor.y -= 4;
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
    thickness: 0.75,
    color: HEADER_BLUE,
  });
  cursor.y -= 14;
}

// Renders a single-column, Europass-inspired CV PDF and returns the raw
// bytes. Bullets with an employer/period are grouped into a real "Work
// Experience" section (in the order given — callers pass them pre-ordered
// by relevance, see documents/generateTailoredCvCallable.ts); bullets
// without either land in a flat "Additional Experience" list.
export async function renderCvPdf(input: CvPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const page = newPage(doc);
  const cursor: Cursor = { doc, page, y: PAGE_HEIGHT, regular, bold };

  // Header band
  const headerHeight = 92;
  cursor.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - headerHeight, width: PAGE_WIDTH, height: headerHeight, color: HEADER_BLUE });
  cursor.page.drawText(input.candidateName, {
    x: MARGIN,
    y: PAGE_HEIGHT - 42,
    size: 22,
    font: bold,
    color: rgb(1, 1, 1),
  });
  cursor.page.drawText(`Application for ${input.jobTitle} — ${input.employer}`, {
    x: MARGIN,
    y: PAGE_HEIGHT - 62,
    size: 10.5,
    font: italic,
    color: rgb(0.85, 0.88, 0.95),
  });
  cursor.page.drawText(input.contactEmail, {
    x: MARGIN,
    y: PAGE_HEIGHT - 78,
    size: 9,
    font: regular,
    color: rgb(0.85, 0.88, 0.95),
  });
  cursor.y = PAGE_HEIGHT - headerHeight - 24;

  drawSectionHeading(cursor, 'Professional Summary');
  drawParagraph(cursor, input.professionalSummary, 10.5, regular);
  cursor.y -= 10;

  const withEmployer = input.bullets.filter((b) => b.employer || b.period);
  const withoutEmployer = input.bullets.filter((b) => !b.employer && !b.period);

  if (withEmployer.length > 0) {
    drawSectionHeading(cursor, 'Work Experience');
    let lastKey: string | null = null;
    for (const bullet of withEmployer) {
      const key = `${bullet.employer ?? ''}|${bullet.period ?? ''}`;
      if (key !== lastKey) {
        ensureSpace(cursor, 30);
        if (lastKey !== null) {
          cursor.y -= 6;
        }
        if (bullet.employer) {
          ensureSpace(cursor, 16);
          cursor.page.drawText(bullet.employer, { x: MARGIN, y: cursor.y, size: 11, font: bold, color: INK });
          cursor.y -= 14;
        }
        if (bullet.period) {
          ensureSpace(cursor, 14);
          cursor.page.drawText(bullet.period, { x: MARGIN, y: cursor.y, size: 9, font: italic, color: MUTED });
          cursor.y -= 14;
        }
        lastKey = key;
      }
      drawParagraph(cursor, `•  ${bullet.text}`, 10, regular);
    }
    cursor.y -= 10;
  }

  if (withoutEmployer.length > 0) {
    drawSectionHeading(cursor, 'Additional Experience');
    for (const bullet of withoutEmployer) {
      drawParagraph(cursor, `•  ${bullet.text}`, 10, regular);
    }
    cursor.y -= 10;
  }

  if (input.skills.length > 0) {
    drawSectionHeading(cursor, 'Skills');
    drawParagraph(cursor, input.skills.join('  ·  '), 10, regular);
  }

  return doc.save();
}
