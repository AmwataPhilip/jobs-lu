export type PersonaId = 'philip' | 'chiara';

export interface CvBullet {
  id: string;
  text: string;
  tags: string[];
  // Optional work-history context — populated by PDF upload parsing
  // (admin/parseCvPdfCallable.ts) or filled in manually. Null for bullets
  // with no specific employer/date attached. Used to group bullets into a
  // real "Work Experience" section when generating a tailored CV PDF
  // (documents/generateTailoredCvCallable.ts); otherwise bullets render as a
  // flat achievements list.
  employer: string | null;
  period: string | null;
}

export interface Persona {
  personaId: PersonaId;
  displayName: string;
  // Used only as the CV document's contact line — kept in sync with
  // functions/src/config/allowlist.ts by convention, same as firestore.rules
  // and storage.rules already do.
  contactEmail: string;
  domains: string[];
  coreSkills: string[];
  // ESCO concept URIs (http://data.europa.eu/esco/skill/<uuid> or
  // .../occupation/<uuid>) are UUID-keyed and can't be reliably guessed —
  // left empty until a real ESCO lookup step (M3) populates them from the
  // official ESCO API/dataset rather than fabricated values.
  escoSkillUris: string[];
  targetRoles: string[];
  targetInstitutions: string[];
  salaryBaseline: number;
  cvBullets: CvBullet[];
}

// Spec source: docs/EU WorkMe_ Technical and Product Specification Document.md, Module B.
// TODO: cvBullets below are illustrative starters — replace with Philip's/Chiara's
// actual CV content before relying on auto-generated applications (M5).
export const PERSONAS: Record<PersonaId, Persona> = {
  philip: {
    personaId: 'philip',
    displayName: 'Philip Amwata',
    contactEmail: 'philip@amwatatech.com',
    domains: ['Deep-Tech', 'Fintech', 'Software Engineering'],
    coreSkills: [
      'C++',
      'Angular',
      '.NET 6',
      'TypeScript',
      'Causal AI',
      'Cloud Infrastructure',
    ],
    escoSkillUris: [],
    targetRoles: [
      'AI Architect',
      'Full-Stack Lead',
      'Risk Reporting Engineer',
      'DevSecOps',
    ],
    targetInstitutions: [
      'European Investment Bank (EIB)',
      'SnT (University of Luxembourg)',
      'Fintech Startups',
    ],
    salaryBaseline: 85000,
    cvBullets: [
      {
        id: 'philip-fullstack-1',
        text: 'Led full-stack delivery of production Angular/.NET systems, owning architecture from API design through deployment.',
        tags: ['Angular', '.NET 6', 'TypeScript', 'Full-Stack Lead'],
        employer: null,
        period: null,
      },
      {
        id: 'philip-causal-ai-1',
        text: 'Applied causal AI techniques to improve model explainability and decision reliability in risk-sensitive workflows.',
        tags: ['Causal AI', 'AI Architect', 'Risk Reporting Engineer'],
        employer: null,
        period: null,
      },
      {
        id: 'philip-cloud-1',
        text: 'Designed and hardened cloud infrastructure and CI/CD pipelines with a security-first (DevSecOps) posture.',
        tags: ['Cloud Infrastructure', 'DevSecOps'],
        employer: null,
        period: null,
      },
      {
        id: 'philip-cpp-1',
        text: 'Built performance-critical C++ components for latency-sensitive systems.',
        tags: ['C++', 'Deep-Tech'],
        employer: null,
        period: null,
      },
    ],
  },
  chiara: {
    personaId: 'chiara',
    displayName: 'Chiara Witry',
    contactEmail: 'chiarawitry5@gmail.com',
    domains: ['Anthropology', 'ESG', 'Talent Acquisition', 'DEI'],
    coreSkills: [
      'Talent Sourcing',
      'Social Research',
      'DEI Strategy',
      'Corporate Sustainability',
    ],
    escoSkillUris: [],
    targetRoles: [
      'ESG Impact Specialist',
      'Head of Talent Acquisition',
      'Diversity Lead',
    ],
    targetInstitutions: [
      'European Investment Bank (EIB)',
      'Amazon LU',
      'Multinationals (e.g. Birkenstock EU HQ)',
    ],
    salaryBaseline: 80000,
    cvBullets: [
      {
        id: 'chiara-talent-1',
        text: 'Directed end-to-end talent acquisition strategy, sourcing and closing hires across multinational teams.',
        tags: ['Talent Sourcing', 'Head of Talent Acquisition'],
        employer: null,
        period: null,
      },
      {
        id: 'chiara-dei-1',
        text: 'Designed and rolled out DEI strategy and diversity programs adopted at the organizational level.',
        tags: ['DEI Strategy', 'Diversity Lead'],
        employer: null,
        period: null,
      },
      {
        id: 'chiara-esg-1',
        text: 'Led corporate sustainability initiatives translating ESG commitments into measurable impact programs.',
        tags: ['Corporate Sustainability', 'ESG Impact Specialist'],
        employer: null,
        period: null,
      },
      {
        id: 'chiara-research-1',
        text: 'Applied social research methods (anthropological fieldwork, qualitative analysis) to workplace culture and DEI diagnostics.',
        tags: ['Social Research', 'Anthropology'],
        employer: null,
        period: null,
      },
    ],
  },
};
