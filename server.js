const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for audio data
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/openai', require('./routes/openai'));
app.use('/api/knowledge', require('./routes/knowledge'));
app.use('/api/voice-tools', require('./routes/voice-tools'));
app.use('/api/chained-voice', require('./routes/chained-voice'));
app.use('/api/livekit', require('./routes/livekit'));
app.use('/api/realtime-agent', require('./routes/realtime-agent'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'After Hours Call Server is running' });
});

app.listen(PORT, () => {
  console.log(`AHCA Server running on port ${PORT}`);
});
