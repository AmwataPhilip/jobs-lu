export interface ShortageOccupation {
  occupationCode: string | null;
  titleFr: string;
  escoUri?: string;
  addedAt: string;
  sourceNote: string;
}

// ADEM ("Agence pour le développement de l'emploi") publishes Luxembourg's
// official "métiers très en pénurie" (severe shortage occupations) list
// annually in the Journal Officiel — there is no public API for it, per
// spec Module B. This is a manually-curated snapshot of the 2026 list (20
// occupations, reference year 2025), gathered 2026-08-27 from ADEM's
// announcement and press coverage. Only 3 of the 20 had a published ROME-style
// code in the sources found; the rest are titles only.
//
// TODO: re-seed this list when ADEM publishes an updated year, and fill in
// occupationCode/escoUri for the remaining entries from the official
// Journal Officiel PDF (not fabricated here).
const SOURCE_NOTE =
  'ADEM "métiers très en pénurie" 2026 list (ref. year 2025), seeded 2026-08-27 from adem.public.lu and press coverage (L\'essentiel).';

export const SHORTAGE_OCCUPATIONS: ShortageOccupation[] = [
  { occupationCode: null, titleFr: 'Analyse de crédits et risques bancaires', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Gestion de clientèle bancaire', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Front office marchés financiers', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: 'F1610', titleFr: 'Pose et restauration de couvertures', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Management et ingénierie études, recherche et développement industriel', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: 'H1502', titleFr: 'Management et ingénierie qualité industrielle', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: 'I1304', titleFr: "Installation et maintenance d'équipements industriels et d'exploitation", addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Maintenance mécanique industrielle', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Réparation de carrosserie', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: "Soins d'hygiène, de confort du patient", addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Soins infirmiers généralistes', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Action sociale', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Éducation de jeunes enfants', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Intervention socioéducative', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Défense et conseil juridique', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Analyse et ingénierie financière', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Audit et contrôle comptables et financiers', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: "Administration de systèmes d'information", addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: "Expertise et support technique en systèmes d'information", addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
  { occupationCode: null, titleFr: 'Études et développement informatique', addedAt: '2026-08-27', sourceNote: SOURCE_NOTE },
];
