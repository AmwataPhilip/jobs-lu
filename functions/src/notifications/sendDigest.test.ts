import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { Vacancy } from '../models/vacancy';
import { personaScore, isNewSince, recentTopMatchesFor, TOP_MATCH_THRESHOLD } from './sendDigest';

const DAY_MS = 24 * 60 * 60 * 1000;

function vacancy(partial: Partial<Vacancy>): Vacancy {
  return {
    jobId: 'job',
    source: 'EURES',
    externalId: 'x',
    title: 'Engineer',
    employer: 'ACME',
    location: { country: 'LU', city: null, allowsTelework: false, teleworkPercentageMax: 0 },
    rawDescription: '',
    extractedSkills: [],
    extractedSkillLabels: [],
    estimatedSalary: null,
    shortageOccupationMatch: null,
    matchedPersona: null,
    matchScore: null,
    postedAt: null,
    applicationDeadline: null,
    ingestedAt: Timestamp.now(),
    ingestionRunId: 'run',
    status: 'matched',
    ...partial,
  } as Vacancy;
}

describe('Digest personaScore', () => {
  it('reads the per-persona matchScores map when present', () => {
    const v = vacancy({ matchScores: { philip: 0.82, chiara: 0.61 }, matchedPersona: 'philip', matchScore: 0.82 });
    assert.equal(personaScore(v, 'philip'), 0.82);
    assert.equal(personaScore(v, 'chiara'), 0.61);
  });

  it('falls back to the primary matchScore for pre-migration docs', () => {
    const v = vacancy({ matchedPersona: 'philip', matchScore: 0.9 });
    assert.equal(personaScore(v, 'philip'), 0.9);
    assert.equal(personaScore(v, 'chiara'), null);
  });
});

describe('Digest isNewSince', () => {
  const since = new Date(Date.now() - DAY_MS);

  it('counts a match whose matchedAt is within the window', () => {
    const v = vacancy({ matchedAt: Timestamp.fromMillis(Date.now() - DAY_MS / 2) });
    assert.equal(isNewSince(v, since), true);
  });

  it('excludes a match whose matchedAt is before the window', () => {
    const v = vacancy({ matchedAt: Timestamp.fromMillis(Date.now() - 5 * DAY_MS) });
    assert.equal(isNewSince(v, since), false);
  });

  it('counts a freshly-matched job even when it was posted long ago', () => {
    // The core fix: an old EURES listing matched today must still count as new.
    const v = vacancy({
      matchedAt: Timestamp.fromMillis(Date.now() - DAY_MS / 4),
      postedAt: Timestamp.fromMillis(Date.now() - 60 * DAY_MS),
    });
    assert.equal(isNewSince(v, since), true);
  });

  it('falls back to postedAt when matchedAt is absent (pre-migration)', () => {
    const recent = vacancy({ postedAt: Timestamp.fromMillis(Date.now() - DAY_MS / 2) });
    const old = vacancy({ postedAt: Timestamp.fromMillis(Date.now() - 10 * DAY_MS) });
    assert.equal(isNewSince(recent, since), true);
    assert.equal(isNewSince(old, since), false);
  });
});

describe('Digest recentTopMatchesFor', () => {
  const since = new Date(Date.now() - DAY_MS);
  const fresh = () => Timestamp.fromMillis(Date.now() - DAY_MS / 2);

  it('keeps only this persona\'s top-tier, recently-matched jobs, sorted desc', () => {
    const all = [
      vacancy({ jobId: 'a', matchScores: { philip: 0.95 }, matchedAt: fresh() }),
      vacancy({ jobId: 'b', matchScores: { philip: 0.72 }, matchedAt: fresh() }),
      vacancy({ jobId: 'c', matchScores: { philip: 0.5 }, matchedAt: fresh() }), // below threshold
      vacancy({ jobId: 'd', matchScores: { philip: 0.9 }, matchedAt: Timestamp.fromMillis(Date.now() - 9 * DAY_MS) }), // stale
    ];
    const result = recentTopMatchesFor(all, 'philip', since);
    assert.deepEqual(result.map((v) => v.jobId), ['a', 'b']);
  });

  it('surfaces a cross-persona match when the non-primary persona qualifies', () => {
    const all = [
      // Primary match is chiara, but philip's score also clears the bar.
      vacancy({ jobId: 'shared', matchedPersona: 'chiara', matchScore: 0.8, matchScores: { philip: 0.78, chiara: 0.8 }, matchedAt: fresh() }),
    ];
    const forPhilip = recentTopMatchesFor(all, 'philip', since);
    assert.deepEqual(forPhilip.map((v) => v.jobId), ['shared']);
  });

  it('uses the shared top-match threshold constant', () => {
    assert.equal(TOP_MATCH_THRESHOLD, 0.7);
  });
});
