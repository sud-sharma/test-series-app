import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { limits } from './security.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhook.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin / server-to-server (no Origin header) and listed origins
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        cb(new Error('Origin not allowed by CORS'));
      },
    })
  );

  // Webhook must be mounted BEFORE express.json() so it receives the raw body
  app.use('/api/webhooks', webhookRoutes);

  app.use(express.json({ limit: '20kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/admin', adminRoutes);

  // Overall cap per IP; the registration and payment routes add stricter limits of their own
  app.use('/api', limits.general, publicRoutes);

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.message === 'Origin not allowed by CORS') return res.status(403).json({ error: err.message });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request' });
    console.error(err);
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    res.status(status).json({
      error: status === 500 ? 'Something went wrong, please try again' : err.error?.description || err.message,
    });
  });

  return app;
}
