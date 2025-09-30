const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    console.log('📎 [MULTER] Received file:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: req.headers['content-length']
    });
    // Accept all files for now, but log the details
    cb(null, true);
  }
});

// Zod schema for estimate validation
const EstimateSchema = z.object({
  project_meta: z.object({
    region: z.string().optional(),
    currency: z.string().optional(),
    estimator_id: z.string().optional()
  }).optional(),
  line_items: z.array(z.object({
    type: z.enum(['material', 'labor', 'assembly']),
    catalog_key: z.string().optional(),
    name: z.string(),
    attributes: z.object({}).optional(),
    quantity: z.number().min(0).default(1),
    unit: z.string(),
    waste_percent: z.number().min(0).max(100).default(0), // Allow percentage format
    labor_hours: z.object({
      most_likely: z.number().min(0),
      low_surprise: z.number().min(0).optional(),
      high_surprise: z.number().min(0).optional()
    }).optional(),
    pricing: z.object({
      source: z.enum(['catalog', 'llm_average']),
      unit_price: z.number().min(0).optional(),
      hourly_rate: z.number().min(0).optional(),
      unit_price_effective_date: z.string().optional()
    }).refine(data => data.unit_price != null || data.hourly_rate != null, {
      message: "Either unit_price or hourly_rate must be provided"
    }),
    confidence: z.object({
      extraction: z.number().min(0).max(1).optional(),
      normalization: z.number().min(0).max(1).optional()
    }).optional(),
    notes: z.string().optional(),
    line_total: z.number().optional()
  })),
  totals: z.object({
    subtotal: z.number().optional(),
    tax_total: z.number().optional(),
    grand_total: z.number().optional()
  }).optional()
});

// Load catalog data
function loadCatalog(customCatalogData = null) {
  try {
    if (customCatalogData) {
      console.log('🗂️ [CATALOG] Using custom catalog data from client');
      return customCatalogData;
    }
    
    const catalogPath = path.join(__dirname, '../data/catalog.json');
    const catalogData = fs.readFileSync(catalogPath, 'utf8');
    console.log('🗂️ [CATALOG] Using default catalog.json');
    return JSON.parse(catalogData);
  } catch (error) {
    console.error('Error loading catalog:', error);
    return null;
  }
}

// Convert audio to text using OpenAI Whisper API
async function transcribeAudio(audioFilePath) {
  try {
    console.log('🎧 [TRANSCRIBE] Starting transcription...');
    console.log('🎧 [TRANSCRIBE] Audio file path:', audioFilePath);
    
    // Check if file exists and get stats
    const fileStats = fs.statSync(audioFilePath);
    console.log('🎧 [TRANSCRIBE] File stats:', {
      size: fileStats.size + ' bytes',
      exists: fs.existsSync(audioFilePath)
    });

    if (fileStats.size === 0) {
      throw new Error('Audio file is empty');
    }

    // Create form data using fs.createReadStream for better compatibility with OpenAI
    const form = new FormData();
    form.append('file', fs.createReadStream(audioFilePath), 'audio.webm');
    form.append('model', 'whisper-1');

    console.log('🎧 [TRANSCRIBE] Form data prepared with file stream');
    console.log('🎧 [TRANSCRIBE] Sending to OpenAI Whisper API via axios...');
    
    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...form.getHeaders()
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    console.log('🎧 [TRANSCRIBE] OpenAI response status:', response.status);
    console.log('🎧 [TRANSCRIBE] Raw result:', response.data);
    console.log('🎧 [TRANSCRIBE] Extracted text:', response.data.text);
    
    if (!response.data.text || response.data.text.trim().length === 0) {
      throw new Error('Transcription returned empty text');
    }

    return response.data.text;
  } catch (error) {
    console.error('💥 [TRANSCRIBE] Error:', {
      message: error.message,
      stack: error.stack,
      filePath: audioFilePath,
      axiosError: error.response?.data || 'No axios response data'
    });
    
    // Handle axios errors specifically
    if (error.response) {
      console.error('🎧 [TRANSCRIBE] Axios response error:', error.response.status, error.response.data);
      throw new Error(`Transcription failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    
    throw error;
  }
}

// Generate estimate from transcript using OpenAI
async function generateEstimate(transcript, customCatalogData = null) {
  const catalog = loadCatalog(customCatalogData);
  const catalogText = catalog ? JSON.stringify(catalog, null, 2) : '';

  const systemPrompt = `You are a strict JSON extractor and estimator. You MUST output **only valid JSON** that matches the Estimate schema provided below. 

CRITICAL REQUIREMENTS:
- Return ONLY pure JSON, no markdown code blocks, no \`\`\`json\`\`\`, no explanations
- Ensure numeric fields are actual numbers, not strings
- Units must be consistent

Available catalog items for reference:
${catalogText}`;

  const userPrompt = `Transcript: "${transcript}"

Task: Convert the transcript into an Estimate JSON object with EXACT schema:

{
  "project_meta": {
    "currency": "USD",
    "region": "US-OR-PDX"
  },
  "line_items": [
    {
      "type": "assembly", // or "material" or "labor"
      "catalog_key": "cedar_privacy_fence_linear_ft",
      "name": "Cedar Privacy Fence (per linear ft)",
      "quantity": 50,
      "unit": "lf",
      "waste_percent": 0.05,
      "pricing": {
        "source": "catalog",
        "unit_price": 29  // for materials/assemblies
      },
      "confidence": {"extraction": 0.9},
      "notes": "Description here"
    },
    {
      "type": "labor",
      "catalog_key": "post_hole_digging", 
      "name": "Post Hole Digging",
      "quantity": 1,
      "unit": "hr",
      "labor_hours": {"most_likely": 5},
      "pricing": {
        "source": "catalog",
        "hourly_rate": 45  // for labor
      },
      "confidence": {"extraction": 0.8},
      "notes": "Labor description"
    }
  ]
}

LABOR HOURS HANDLING:
- If user specifies hours (e.g., "digging will take 8 hours", "3 hours for installation", "needs 6 hours total"):
  * Use the EXACT hours mentioned by user
  * Set confidence.extraction to 0.95 (high confidence for user-specified values)
  * Note in the "notes" field that hours were user-specified
- If NO hours mentioned:
  * Estimate reasonable hours based on project scope and industry standards
  * Set confidence.extraction based on how clear the requirements are (0.7-0.9)
  * Always provide labor_hours.most_likely for ALL labor items

CRITICAL: Return ONLY this exact structure. No nested "estimate" wrapper. No markdown.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const result = await response.json();
    let estimateText = result.choices[0].message.content.trim();
    
    console.log('🤖 [LLM] Raw LLM response:', estimateText);
    
    // Clean up the JSON if it's wrapped in markdown code blocks
    if (estimateText.startsWith('```json') && estimateText.endsWith('```')) {
      estimateText = estimateText.slice(7, -3).trim();
      console.log('🧹 [LLM] Cleaned JSON from markdown:', estimateText);
    } else if (estimateText.startsWith('```') && estimateText.endsWith('```')) {
      estimateText = estimateText.slice(3, -3).trim();
      console.log('🧹 [LLM] Cleaned JSON from code blocks:', estimateText);
    }
    
    // Try to parse JSON
    let estimateJson;
    try {
      estimateJson = JSON.parse(estimateText);
      console.log('✅ [LLM] Successfully parsed JSON');
      
      // Check if the response is wrapped in an "estimate" property
      if (estimateJson.estimate && !estimateJson.line_items) {
        console.log('🔧 [LLM] Unwrapping nested estimate structure');
        console.log('🔍 [LLM] Original structure:', JSON.stringify(estimateJson, null, 2));
        estimateJson = estimateJson.estimate;
        console.log('🔍 [LLM] Unwrapped structure:', JSON.stringify(estimateJson, null, 2));
      }
      
      // Ensure we have the required structure
      if (!estimateJson.line_items) {
        console.log('⚠️ [LLM] Missing line_items, creating empty array');
        estimateJson.line_items = [];
      }
      
      if (!estimateJson.project_meta) {
        console.log('⚠️ [LLM] Missing project_meta, adding defaults');
        estimateJson.project_meta = {
          currency: "USD",
          region: "US-OR-PDX"
        };
      }
      
    } catch (parseError) {
      console.error('❌ [LLM] JSON parse error:', parseError.message);
      console.error('🔍 [LLM] Problematic text:', estimateText);
      throw new Error('LLM returned invalid JSON');
    }

    return estimateJson;
  } catch (error) {
    console.error('Generate estimate error:', error);
    throw error;
  }
}

// Repair invalid estimate with LLM
async function repairEstimate(invalidEstimate, validationErrors) {
  const systemPrompt = `You are a JSON repair assistant. Fix the provided JSON to match the Estimate schema. 

CRITICAL: Return ONLY pure JSON, no markdown code blocks, no \`\`\`json\`\`\`, no explanations.`;
  
  const userPrompt = `Invalid JSON: ${JSON.stringify(invalidEstimate, null, 2)}

Validation errors: ${validationErrors}

Key fixes needed:
- waste_percent should be decimal (e.g., 5% = 0.05, not 5)
- labor items need unit_price OR hourly_rate
- all numeric values must be numbers, not strings

Return only the corrected JSON.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`Repair request failed: ${response.status}`);
    }

    const result = await response.json();
    let repairedText = result.choices[0].message.content.trim();
    
    // Clean up markdown if present
    if (repairedText.startsWith('```json') && repairedText.endsWith('```')) {
      repairedText = repairedText.slice(7, -3).trim();
    } else if (repairedText.startsWith('```') && repairedText.endsWith('```')) {
      repairedText = repairedText.slice(3, -3).trim();
    }
    
    return JSON.parse(repairedText);
  } catch (error) {
    console.error('Repair estimate error:', error);
    throw error;
  }
}

// Apply catalog pricing and compute totals
function processEstimate(estimate, customCatalogData = null) {
  const catalog = loadCatalog(customCatalogData);
  let subtotal = 0;

  estimate.line_items.forEach(item => {
    // Apply catalog pricing if available
    if (item.catalog_key && catalog) {
      const catalogItem = findCatalogItem(catalog, item.catalog_key);
      if (catalogItem) {
        item.pricing.source = 'catalog';
        if (catalogItem.unit_price) {
          item.pricing.unit_price = catalogItem.unit_price;
        } else if (catalogItem.hourly_rate) {
          item.pricing.hourly_rate = catalogItem.hourly_rate;
        }
      }
    }

    // Normalize waste_percent to decimal if it's a percentage
    if (item.waste_percent && item.waste_percent > 1) {
      item.waste_percent = item.waste_percent / 100;
    }

    // Compute line total
    let linePrice = 0;
    
    if (item.type === 'labor' && item.labor_hours && item.pricing.hourly_rate) {
      // Labor: hours * hourly_rate
      linePrice = item.labor_hours.most_likely * item.pricing.hourly_rate;
    } else if (item.pricing.unit_price) {
      // Materials/Assembly: quantity * unit_price * (1 + waste)
      const wasteMultiplier = 1 + (item.waste_percent || 0);
      linePrice = item.quantity * item.pricing.unit_price * wasteMultiplier;
    } else if (item.pricing.hourly_rate && item.quantity) {
      // Fallback: quantity * hourly_rate (for labor without specific hours)
      linePrice = item.quantity * item.pricing.hourly_rate;
    }

    item.line_total = Math.round(linePrice * 100) / 100; // Round to 2 decimals
    subtotal += item.line_total;
  });

  // Compute totals
  const taxRate = 0.0875; // 8.75% tax
  const taxTotal = subtotal * taxRate;
  const grandTotal = subtotal + taxTotal;

  estimate.totals = {
    subtotal: Math.round(subtotal * 100) / 100,
    tax_total: Math.round(taxTotal * 100) / 100,
    grand_total: Math.round(grandTotal * 100) / 100
  };

  return estimate;
}

// Find catalog item by key
function findCatalogItem(catalog, key) {
  for (const category of ['materials', 'labor', 'assemblies', 'extras']) {
    if (catalog[category] && catalog[category][key]) {
      return catalog[category][key];
    }
  }
  return null;
}

// Apply safe defaults for invalid estimates
function applySafeDefaults(estimate) {
  const safeEstimate = {
    project_meta: {
      region: 'US-OR-PDX',
      currency: 'USD'
    },
    line_items: [],
    totals: {
      subtotal: 0,
      tax_total: 0,
      grand_total: 0
    }
  };

  if (Array.isArray(estimate?.line_items)) {
    safeEstimate.line_items = estimate.line_items.map(item => ({
      type: item.type || 'material',
      name: item.name || 'Unknown Item',
      quantity: Math.max(0, item.quantity || 1),
      unit: item.unit || 'ea',
      waste_percent: Math.max(0, Math.min(1, item.waste_percent || 0)),
      pricing: {
        source: 'llm_average',
        unit_price: Math.max(0, item.pricing?.unit_price || 0)
      },
      confidence: {
        extraction: 0.1,
        normalization: 0.1
      },
      notes: 'Applied safe defaults due to validation errors',
      line_total: 0
    }));
  }

  return safeEstimate;
}

/**
 * POST /api/estimate
 * Process audio file and return structured estimate
 */
router.post('/', upload.single('audio'), async (req, res) => {
  const startTime = Date.now();
  let tempFilePath = null;

  try {
    console.log('\n🎤 =================== NEW ESTIMATE REQUEST ===================');
    console.log('⏰ [SERVER] Request received at:', new Date().toISOString());
    console.log('🔍 [SERVER] Request headers:', {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'user-agent': req.headers['user-agent']?.substring(0, 50) + '...'
    });

    if (!req.file) {
      console.error('❌ [SERVER] No audio file in request');
      return res.status(400).json({
        error: 'No audio file provided',
        meta: { processing_time_ms: Date.now() - startTime }
      });
    }

    tempFilePath = req.file.path;
    
    // Extract custom catalog data if provided
    let customCatalogData = null;
    if (req.body.customCatalog) {
      try {
        customCatalogData = JSON.parse(req.body.customCatalog);
        console.log('📋 [SERVER] Custom catalog received from client');
      } catch (error) {
        console.warn('⚠️ [SERVER] Invalid custom catalog JSON, using default');
      }
    }
    
    // Rename file with proper extension for OpenAI
    const audioExtension = req.file.originalname?.endsWith('.webm') ? '.webm' : 
                          req.file.mimetype?.includes('webm') ? '.webm' : '.webm';
    const renamedPath = tempFilePath + audioExtension;
    
    try {
      fs.renameSync(tempFilePath, renamedPath);
      tempFilePath = renamedPath;
      console.log('📁 [SERVER] Audio file renamed to:', renamedPath);
    } catch (renameError) {
      console.warn('⚠️ [SERVER] Could not rename file, using original path');
    }
    
    console.log('📁 [SERVER] Audio file received:', {
      originalname: req.file.originalname,
      size: req.file.size + ' bytes',
      mimetype: req.file.mimetype,
      tempPath: tempFilePath,
      finalExtension: audioExtension
    });

    // Step 1: Transcribe audio
    console.log('🎧 [SERVER] Step 1: Transcribing audio...');
    const transcript = await transcribeAudio(tempFilePath);
    console.log('📝 [SERVER] Transcript received:', transcript.length + ' characters');
    console.log('📝 [SERVER] Transcript preview:', transcript.substring(0, 150) + '...');

    // Step 2: Generate estimate from transcript
    console.log('🤖 [SERVER] Step 2: Generating estimate from transcript...');
    let estimateJson = await generateEstimate(transcript, customCatalogData);
    console.log('📊 [SERVER] Raw LLM response received');

    // Step 3: Validate estimate
    console.log('✅ [SERVER] Step 3: Validating estimate schema...');
    let validationResult = EstimateSchema.safeParse(estimateJson);
    let validationAttempts = 1;

    if (!validationResult.success) {
      console.log('❌ [SERVER] Validation failed, attempting repair...');
      console.log('🔧 [SERVER] Validation errors:', JSON.stringify(validationResult.error.issues, null, 2));
      try {
        estimateJson = await repairEstimate(estimateJson, JSON.stringify(validationResult.error.issues));
        validationResult = EstimateSchema.safeParse(estimateJson);
        validationAttempts++;
        console.log('🛠️ [SERVER] Repair attempt completed');
      } catch (repairError) {
        console.error('💥 [SERVER] Repair failed:', repairError.message);
      }
    }

    // Step 4: Apply safe defaults if still invalid
    if (!validationResult.success) {
      console.log('🔧 [SERVER] Step 4: Applying safe defaults...');
      estimateJson = applySafeDefaults(estimateJson);
      validationResult = EstimateSchema.safeParse(estimateJson);
      console.log('🛡️ [SERVER] Safe defaults applied');
    }

    // Step 5: Process estimate (apply catalog pricing and compute totals)
    console.log('💰 [SERVER] Step 5: Processing pricing and totals...');
    const finalEstimate = processEstimate(validationResult.data, customCatalogData);
    console.log('💵 [SERVER] Final totals calculated:', {
      subtotal: finalEstimate.totals?.subtotal,
      tax: finalEstimate.totals?.tax_total,
      grand_total: finalEstimate.totals?.grand_total
    });

    const processingTime = Date.now() - startTime;
    console.log(`✅ [SERVER] SUCCESS! Estimate processed in ${processingTime}ms`);
    console.log('📤 [SERVER] Sending response to client...\n');

    res.json({
      estimate: finalEstimate,
      meta: {
        processing_time_ms: processingTime,
        validation: {
          ok: validationResult.success,
          attempts: validationAttempts
        }
      }
    });

  } catch (error) {
    console.error('\n💥 =================== SERVER ERROR ===================');
    console.error('❌ [SERVER] Error processing estimate:', {
      message: error.message,
      stack: error.stack,
      file: tempFilePath,
      processingTime: Date.now() - startTime
    });
    console.error('======================================================\n');
    
    res.status(500).json({
      error: 'Failed to process estimate',
      message: error.message,
      meta: {
        processing_time_ms: Date.now() - startTime,
        validation: { ok: false }
      }
    });
  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('🗑️ Cleaned up temporary file');
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }
  }
});

module.exports = router;
