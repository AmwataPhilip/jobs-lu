import { Persona } from '../config/personas';

// Shared by admin/seedReferenceData.ts and admin/updatePersonaCallable.ts so
// a persona always embeds the same way regardless of which path wrote it.
export function personaEmbeddingText(persona: {
  displayName: string;
  domains: string[];
  coreSkills: string[];
  targetRoles: string[];
  cvBullets: Persona['cvBullets'];
}): string {
  return [
    persona.displayName,
    persona.domains.join(', '),
    persona.coreSkills.join(', '),
    persona.targetRoles.join(', '),
    persona.cvBullets.map((b) => b.text).join(' '),
  ].join('\n');
}
