const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { errorHandler } = require('./middlewares');

const studentRoutes = require('./routes/students');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');
const contributorRoutes = require('./routes/contributors');

// Codolio-style tracker / portfolio / contest-manager features
const authRoutes = require('./routes/auth');
const contestRoutes = require('./routes/contests');
const problemRoutes = require('./routes/problems');
const workspaceRoutes = require('./routes/workspace');
const noteRoutes = require('./routes/notes');
const revisionRoutes = require('./routes/revision');
const sheetRoutes = require('./routes/sheets');
const companyRoutes = require('./routes/companies');
const portfolioRoutes = require('./routes/portfolio');
const claimRoutes = require('./routes/claims');
const webhookRoutes = require('./routes/webhooks');

const Meta = require('./models/Meta');

const app = express();

// Security
app.use(helmet());

/**
 * Allowed origins: the configured frontend, plus any browser extension.
 * The extension's popup sends `Origin: chrome-extension://<id>` and the id
 * differs per install, so it is matched by scheme rather than listed.
 */
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({
  origin(origin, callback) {
    // Same-origin/server-to-server requests send no Origin header
    if (!origin) return callback(null, true);
    if (origin === allowedOrigin) return callback(null, true);
    if (/^(chrome-extension|moz-extension):\/\//.test(origin)) return callback(null, true);
    return callback(null, false);
  },
  // DELETE/PATCH are needed by the workspace, notes, sheets and portfolio APIs
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

/**
 * Webhooks are mounted BEFORE the JSON parser and receive the raw body, because
 * Svix signatures are computed over the exact bytes Clerk sent. Parsing first
 * would invalidate every signature.
 */
app.use('/api/webhooks', express.raw({ type: '*/*', limit: '1mb' }), webhookRoutes);

// Body parsing. The limit is raised because sheet CSV imports and note content
// are posted inline as text.
app.use(express.json({ limit: '2mb' }));

// Routes
app.use('/api/students', studentRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/contributors', contributorRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/revision', revisionRoutes);
app.use('/api/sheets', sheetRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/claims', claimRoutes);

// Health check
app.get('/api/health', async (req, res, next) => {
  try {
    const [lastCronRun, lastContestSync] = await Promise.all([
      Meta.findOne({ key: 'lastCronRun' }).lean(),
      Meta.findOne({ key: 'lastContestSync' }).lean(),
    ]);
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      lastCronRun: lastCronRun?.value || null,
      lastContestSync: lastContestSync?.value || null,
    });
  } catch (error) {
    next(error);
  }
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
