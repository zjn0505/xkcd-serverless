/**
 * Workflow instance retention for crawlers.
 * Free plan max is 3 days; keep success short to limit SQLite storage.
 * @see https://developers.cloudflare.com/workflows/reference/pricing/#storage-usage
 */
export const CRAWLER_WORKFLOW_RETENTION = {
  successRetention: '1 day',
  errorRetention: '3 days',
} as const;
