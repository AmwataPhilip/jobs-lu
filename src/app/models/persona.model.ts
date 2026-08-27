export type PersonaId = 'philip' | 'chiara';

export interface CvBullet {
  id: string;
  text: string;
  tags: string[];
}

export interface Persona {
  personaId: PersonaId;
  displayName: string;
  domains: string[];
  coreSkills: string[];
  escoSkillUris: string[];
  targetRoles: string[];
  targetInstitutions: string[];
  salaryBaseline: number;
  cvBullets: CvBullet[];
}
