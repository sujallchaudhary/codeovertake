const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { errorHandler } = require('./middlewares');

const studentRoutes = require('./routes/students');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');
const contributorRoutes = require('./routes/contributors');
const Meta = require('./models/Meta');

const app = express();

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT'],
}));

// Body parsing
app.use(express.json());

// Routes
app.use('/api/students', studentRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/contributors', contributorRoutes);

// Health check
app.get('/api/health', async (req, res, next) => {
  try {
    const lastCronRun = await Meta.findOne({ key: 'lastCronRun' }).lean();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      lastCronRun: lastCronRun?.value || null,
    });
  } catch (error) {
    next(error);
  }
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
