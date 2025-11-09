// Stream Summaries API with x402 Payment Protection
// Version 1.0.0 - November 2025
console.log('[STREAM-SUMMARIES] ===== Starting Stream Summaries API with x402 =====');

import express from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { paymentMiddleware } from 'x402-express';

// Configuration
const RECEIVING_WALLET = '0x52110a2Cc8B6bBf846101265edAAe34E753f3389';
const FACILITATOR_URL = 'https://facilitator.ultravioletadao.xyz';
const S3_BUCKET = 'ultravioletadao';
const S3_REGION = 'us-east-1';
const PRICE_PER_SUMMARY = '$0.05'; // 0.05 USDC

// Supported mainnet networks (no testnets)
const SUPPORTED_NETWORKS = [
  'optimism',
  'base',
  'polygon',
  'avalanche',
  'celo',
  'hyperevm',
  'solana'
];

// Initialize S3 Client
const s3Client = new S3Client({ region: S3_REGION });

// Initialize Express app
const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Helper function to read JSON from S3
async function readFromS3(key) {
  console.log(`[S3_READ] Reading from bucket: ${S3_BUCKET}, key: ${key}`);

  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key
    });

    const response = await s3Client.send(command);
    const bodyContents = await streamToString(response.Body);
    const data = JSON.parse(bodyContents);

    console.log(`[S3_READ] Successfully read ${key}`);
    return data;
  } catch (error) {
    console.error(`[S3_ERROR] Error reading ${key}:`, error.message);
    throw error;
  }
}

// Helper to convert stream to string
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

// Helper function to get latest summary from index
async function getLatestSummary(language = 'es') {
  const indexKey = `stream-summaries/index_${language}.json`;
  const index = await readFromS3(indexKey);

  if (!index.streams || index.streams.length === 0) {
    throw new Error('No summaries found');
  }

  // Sort by date to get the latest (streams should already be sorted, but just in case)
  const sorted = [...index.streams].sort((a, b) =>
    new Date(b.fecha_stream) - new Date(a.fecha_stream)
  );

  return sorted[0];
}

// ============================================
// PUBLIC ENDPOINTS (No payment required)
// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'stream-summaries',
    version: '1.0.0'
  });
});

// Get supported networks
app.get('/networks', (req, res) => {
  res.json({
    success: true,
    networks: SUPPORTED_NETWORKS,
    facilitator: FACILITATOR_URL,
    receivingWallet: RECEIVING_WALLET,
    price: PRICE_PER_SUMMARY
  });
});

// Get index of all summaries (metadata only, no full content)
app.get('/summaries', async (req, res) => {
  try {
    const language = req.query.lang || 'es';
    const indexKey = `stream-summaries/index_${language}.json`;
    const index = await readFromS3(indexKey);

    // Return index but without full summary content
    res.json({
      success: true,
      data: {
        ultima_actualizacion: index.ultima_actualizacion,
        total_streams: index.total_streams,
        streams: index.streams.map(s => ({
          video_id: s.video_id,
          streamer: s.streamer,
          titulo: s.titulo,
          fecha_stream: s.fecha_stream,
          duracion: s.duracion,
          thumbnail_url: s.thumbnail_url,
          // Do not include full summary here
        }))
      }
    });
  } catch (error) {
    console.error('[ERROR] Failed to fetch index:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch summaries index'
    });
  }
});

// Get latest summary (ALWAYS FREE)
app.get('/summaries/latest', async (req, res) => {
  try {
    const language = req.query.lang || 'es';
    const latestMeta = await getLatestSummary(language);

    // Fetch full summary from S3
    const summaryKey = `stream-summaries/${latestMeta.streamer}/${latestMeta.fecha_stream}/${latestMeta.video_id}.${language}.json`;
    const fullSummary = await readFromS3(summaryKey);

    console.log(`[LATEST_FREE] Serving latest summary for ${latestMeta.streamer}`);

    res.json({
      success: true,
      data: fullSummary,
      message: 'This is the latest summary - always free!'
    });
  } catch (error) {
    console.error('[ERROR] Failed to fetch latest summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch latest summary'
    });
  }
});

// ============================================
// PROTECTED ENDPOINTS (Payment required)
// ============================================

// Get specific summary by ID
// Business Logic: Latest summary is FREE, older summaries require payment
// Payment verification is handled CLIENT-SIDE using x402-fetch
app.get('/summaries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const language = req.query.lang || 'es';

    console.log(`[GET /summaries/${id}] Request received`);

    // Fetch index to find summary metadata
    const indexKey = `stream-summaries/index_${language}.json`;
    const index = await readFromS3(indexKey);

    // Find the summary with this video_id
    const summaryMeta = index.streams.find(s => s.video_id === id);

    if (!summaryMeta) {
      return res.status(404).json({
        success: false,
        error: 'Summary not found'
      });
    }

    // Check if this is the latest summary
    const latest = await getLatestSummary(language);
    const isLatest = summaryMeta.video_id === latest.video_id;

    if (isLatest) {
      // Latest summary is always FREE - serve it directly
      const summaryKey = `stream-summaries/${summaryMeta.streamer}/${summaryMeta.fecha_stream}/${summaryMeta.video_id}.${language}.json`;
      const fullSummary = await readFromS3(summaryKey);

      console.log(`[LATEST_FREE] Serving latest summary ${id} for free`);

      return res.json({
        success: true,
        data: fullSummary,
        message: 'This is the latest summary - always free!'
      });
    }

    // For older summaries, return 402 Payment Required with x402 format
    // Client will handle payment using x402-fetch
    console.log(`[PAYMENT_REQUIRED] Summary ${id} requires payment`);

    return res.status(402).json({
      message: 'Payment Required',
      accepts: [{
        payTo: RECEIVING_WALLET,
        asset: 'USDC',
        network: 'base',
        amount: '50000', // 0.05 USDC (6 decimals: 0.05 * 10^6 = 50000)
        description: 'Access to stream summary',
        resource: `/summaries/${id}`,
        facilitator: FACILITATOR_URL,
        supportedNetworks: SUPPORTED_NETWORKS
      }],
      summary: {
        video_id: summaryMeta.video_id,
        streamer: summaryMeta.streamer,
        titulo: summaryMeta.titulo,
        fecha_stream: summaryMeta.fecha_stream,
        thumbnail_url: summaryMeta.thumbnail_url
      }
    });

  } catch (error) {
    console.error('[ERROR] Failed to fetch summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch summary'
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'GET /networks',
      'GET /summaries',
      'GET /summaries/latest',
      'GET /summaries/:id (protected)'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server (for Fargate/Docker or local testing)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[FARGATE] Server running on http://localhost:${PORT}`);
});

// Export app for testing
export default app;
