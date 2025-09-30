const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const corsOptions = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // Increase limit for audio data
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/knowledge', require('./features/voice-agent/routes/knowledge'));
app.use('/api/voice-tools', require('./features/voice-agent/routes/voice-tools'));
app.use('/api/chained-voice', require('./features/voice-agent/routes/chained-voice'));
app.use('/api/estimate', require('./features/estimator/routes/estimate'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'After Hours Call Server is running' });
});

app.listen(PORT, () => {
  console.log(`AHCA Server running on port ${PORT}`);
});
