// Verified live against generativelanguage.googleapis.com on 2026-08-27 —
// text-embedding-004 no longer exists; gemini-embedding-001 is the current
// stable embedding model and supports truncating its output via
// outputDimensionality (verified: 768 works).
// Must match the `dimension` in firestore.indexes.json for jobslu_vacancies.embedding.
export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSION = 768;
