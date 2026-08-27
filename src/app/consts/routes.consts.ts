export const ROUTES = {
  authentication: {
    signIn: 'sign-in',
  },
  dashboard: 'dashboard',
  jobs: 'jobs',
  otherMatches: 'matches/other',
  applications: 'applications',
  companies: 'companies',
};

export function jobDetailUrl(jobId: string): string {
  return `/${ROUTES.jobs}/${jobId}`;
}

export function companyDetailUrl(companyName: string): string {
  return `/${ROUTES.companies}?company=${encodeURIComponent(companyName)}`;
}

