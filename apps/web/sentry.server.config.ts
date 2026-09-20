import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || 'https://c209787c1c56ffddbbadd2b36a226ee5@o4512119900536832.ingest.us.sentry.io/4512119917117440';

Sentry.init({
  dsn: SENTRY_DSN,
  tracesSampleRate: 1.0,
});
