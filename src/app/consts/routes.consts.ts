export const ROUTES = {
  authentication: {
    signIn: 'sign-in',
  },
  dashboard: 'dashboard',
  jobs: 'jobs',
  otherMatches: 'matches/other',
  applications: 'applications',
};

export function jobDetailUrl(jobId: string): string {
  return `/${ROUTES.jobs}/${jobId}`;
}
