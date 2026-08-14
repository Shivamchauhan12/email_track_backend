require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const contactRoutes = require('./routes/contactRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS Configuration
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
];

const envOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : [];

const rawAllowedOrigins = [...defaultOrigins, ...envOrigins];
const allowedOrigins = new Set();

rawAllowedOrigins.forEach(url => {
  if (url) {
    allowedOrigins.add(url);
    allowedOrigins.add(url.replace(/\/+$/, '')); // remove trailing slash
  }
});

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman, server-to-server, email tracking pixels)
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/+$/, '');

    if (
      process.env.FRONTEND_URL === '*' ||
      allowedOrigins.has(cleanOrigin) ||
      allowedOrigins.has(origin) ||
      allowedOrigins.has('*')
    ) {
      return callback(null, true);
    }

    console.warn(`⚠️ [CORS Blocked] Request from origin '${origin}' not in allowed origins list.`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Tracking endpoints (no auth, public access)
app.use('/', trackingRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  const baseUrl = process.env.APP_URL || `http://localhost:${PORT}`;
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Tracking pixel endpoint: ${baseUrl}/track/open/:id`);
  console.log(`✅ Link tracker endpoint: ${baseUrl}/track/click/:code`);
  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    console.log(`\n⚠️  IMPORTANT NOTE FOR EMAIL OPEN TRACKING:`);
    console.log(`    APP_URL is currently '${baseUrl}'.`);
    console.log(`    External email clients (Gmail, Outlook, Yahoo) cannot access 'localhost'.`);
    console.log(`    To test email open tracking from real email clients, expose your server using ngrok`);
    console.log(`    (e.g., 'npx ngrok http ${PORT}') and set APP_URL in .env to your ngrok URL.\n`);
  }
});
