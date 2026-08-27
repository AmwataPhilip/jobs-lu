export const ROUTES = {
  authentication: {
    signIn: 'sign-in',
  },
  dashboard: 'dashboard',
  jobs: 'jobs',
};

export function jobDetailUrl(jobId: string): string {
  return `/${ROUTES.jobs}/${jobId}`;
}
