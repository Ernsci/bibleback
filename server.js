require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => res.json({ status: 'Bible AI API running' }));

// SYSTEM INSTRUCTION for the AI - thoughtful, measured guidance WITH COMFORT DIRECTIVE
const SYSTEM_INSTRUCTION = 'You are Bible AI, offering thoughtful, compassionate reflection grounded in Scripture. ' +
  'An appropriate Bible verse is already selected and displayed to the user automatically above your message. ' +
  'Guidelines: ' +
  '1) Do NOT quote, restate, or reference a specific verse - the verse is shown separately. Respond with reflection only. ' +
  '2) Answer the user\'s question thoughtfully and accurately, in a warm and grounded tone. ' +
  '3) When the user opens up or shares personal feelings, offer gentle comfort and sincere empathy. ' +
  '4) Keep responses concise: 2-3 short paragraphs maximum, clear and human. ' +
  '5) Respectful and measured - never preachy, dogmatic, or lecturing. ' +
  '6) If the question is outside Scripture\'s scope, acknowledge it honestly and offer a grounded, general perspective. ' +
  '7) Never invent Bible verses or references. ' +
  '8) Avoid filler, clichés, and generic platitudes. Write like a thoughtful person, not a chatbot. ' +
  '9) Do not open with "Certainly", "Of course", or "As an AI". ' +
  '10) Output plain prose only: no markdown, no bold, no bullet or numbered lists, ' +
  'and never show your reasoning, plan, or analysis - just the finished reflection.';

// Free models on OpenRouter. "openrouter/free" auto-routes to an available
// free model; the rest are explicit fallbacks if that route fails or
// returns an empty reply. All of these cost $0. DeepSeek has no free tier,
// so free routing is used instead.
const FREE_MODELS = [
  'openrouter/free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'google/gemma-4-31b-it:free'
];

function modelChain() {
  const override = (process.env.OPENROUTER_MODEL || '').trim();
  return override ? [override].concat(FREE_MODELS) : FREE_MODELS;
}

// Some free models occasionally return their planning/analysis instead of the
// finished answer. Treat that as a failed attempt and let the next model try.
const PLANNING_PATTERN = new RegExp([
  'analyze the input',
  'user statement',
  'chain[- ]of[- ]thought',
  'here(?:\'s| is) (?:my|the) (?:plan|approach|analysis)',
  'let me (?:think|break|analyze)',
  '^\\s*\\d{1,2}[.)]\\s'
].join('|'), 'im');

function isUnusable(text) {
  if (!text || text.trim().length < 40) return true;
  return PLANNING_PATTERN.test(text);
}

// Ask OpenRouter, trying each model in the chain until one returns text.
async function generateReflection(userMessage) {
  const chain = modelChain();
  let lastError = 'no model produced a response';

  for (const model of chain) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 800,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('OpenRouter [' + model + '] ' + response.status + ': ' + errText.slice(0, 300));
        lastError = 'upstream ' + response.status;
        continue;
      }

      const data = await response.json();
      const choice = data.choices && data.choices[0] && data.choices[0].message;
      const content = (choice && choice.content || '').trim();

      if (content && !isUnusable(content)) {
        console.log('Answered by ' + data.model + ' (cost ' + (data.usage && data.usage.cost) + ')');
        return content;
      }

      // Empty, too short, or leaked planning text - try the next model.
      lastError = content ? 'unusable output' : 'empty response';
      console.warn('Rejected output from ' + model + ' (' + lastError + ')');
    } catch (err) {
      console.error('OpenRouter [' + model + '] request failed:', err.message);
      lastError = err.message;
    }
  }

  throw new Error(lastError);
}

app.post('/api/chat', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    const userMessage = req.body.message;
    if (!userMessage) return res.status(400).json({ error: 'Message required' });

    // 1. Ask OpenRouter (free model chain)
    const aiResponse = await generateReflection(userMessage);

    // 2. Get a relevant Bible verse via keyword matching
    const verse = getRelevantVerse(userMessage);

    // 3. Format response: verse first, then AI reflection
    const formattedResponse = formatResponse(aiResponse, verse);

    res.json({ 
      response: formattedResponse,
      verseReference: verse.reference,
      verseText: verse.text
    });
  } catch (error) {
    console.error('Chat failed:', error.message);

    // Degrade gracefully: still offer Scripture even if the model is unavailable.
    const verse = getRelevantVerse((req.body && req.body.message) || '');
    res.status(200).json({
      response: 'I could not reach the reflection service just now, but this passage may still be something steady to hold onto.',
      verseReference: verse.reference,
      verseText: verse.text,
      degraded: true
    });
  }
});

// Keyword-to-verse mapping for meaningful integration
function getRelevantVerse(message) {
  const lower = message.toLowerCase();

  const verseMap = {
    'love': { reference: '1 John 4:7', text: 'Beloved, let us love one another, for love is from God.' },
    'peace': { reference: 'John 14:27', text: 'Peace I leave with you; my peace I give to you.' },
    'faith': { reference: 'Hebrews 11:1', text: 'Now faith is the assurance of things hoped for.' },
    'hope': { reference: 'Lamentations 3:24', text: 'The Lord is my portion' + String.fromCharCode(39) + ', says my soul, therefore I will hope in him.' },
    'strength': { reference: 'Isaiah 40:31', text: 'But they who wait for the Lord shall renew their strength.' },
    'wisdom': { reference: 'James 1:5', text: 'If any of you lacks wisdom, let him ask God.' },
    'forgiveness': { reference: 'Ephesians 4:32', text: 'Be kind to one another, tenderhearted, forgiving one another.' },
    'joy': { reference: 'Psalm 16:11', text: 'You make known to me the path of life; in your presence there is fullness of joy.' },
    'courage': { reference: 'Joshua 1:9', text: 'Be strong and courageous. Do not be frightened, for the Lord your God is with you.' },
    'comfort': { reference: '2 Corinthians 1:3', text: 'Blessed be the God and Father of our Lord Jesus Christ, the Father of mercies and God of all comfort.' },
    'griev': { reference: 'Psalm 34:18', text: 'The Lord is near to the brokenhearted and saves the crushed in spirit.' },
    'loss': { reference: 'Psalm 34:18', text: 'The Lord is near to the brokenhearted and saves the crushed in spirit.' },
    'broken': { reference: 'Psalm 34:18', text: 'The Lord is near to the brokenhearted and saves the crushed in spirit.' },
    'sad': { reference: 'Psalm 34:18', text: 'The Lord is near to the brokenhearted and saves the crushed in spirit.' },
    'death': { reference: 'Psalm 23:4', text: 'Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me.' },
    'dying': { reference: 'Psalm 23:4', text: 'Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me.' },
    'depress': { reference: 'Psalm 42:11', text: 'Why are you cast down, O my soul? Hope in God; for I shall again praise him.' },
    'anxiety': { reference: 'Philippians 4:6-7', text: 'Do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God. And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.' },
    'anxious': { reference: 'Philippians 4:6-7', text: 'Do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God.' },
    'worried': { reference: 'Matthew 6:34', text: 'Therefore do not be anxious about tomorrow, for tomorrow will be anxious for itself.' },
    'heartbreak': { reference: 'Psalm 34:18', text: 'The Lord is near to the brokenhearted and saves the crushed in spirit.' },
    'lonely': { reference: 'Deuteronomy 31:8', text: 'It is the Lord who goes before you. He will be with you; he will not leave you or forsake you.' },
    'alone': { reference: 'Deuteronomy 31:8', text: 'It is the Lord who goes before you. He will be with you; he will not leave you or forsake you.' },
    'afraid': { reference: 'Isaiah 41:10', text: 'Fear not, for I am with you; be not dismayed, for I am your God; I will strengthen you, I will help you.' },
    'fear': { reference: 'Isaiah 41:10', text: 'Fear not, for I am with you; be not dismayed, for I am your God; I will strengthen you, I will help you.' },
    'tired': { reference: 'Matthew 11:28', text: 'Come to me, all who labor and are heavy laden, and I will give you rest.' },
    'weary': { reference: 'Matthew 11:28', text: 'Come to me, all who labor and are heavy laden, and I will give you rest.' },
    'lost': { reference: 'Psalm 23:4', text: 'Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me.' },
    'grateful': { reference: '1 Thessalonians 5:18', text: 'Give thanks in all circumstances; for this is the will of God in Christ Jesus for you.' },
    'thankful': { reference: '1 Thessalonians 5:18', text: 'Give thanks in all circumstances; for this is the will of God in Christ Jesus for you.' },
    'angry': { reference: 'Ephesians 4:26', text: 'Be angry and do not sin; do not let the sun go down on your anger.' },
  };

  // Check for keyword matches - exact or substring
  let selectedVerse = null;
  for (const [keyword, verse] of Object.entries(verseMap)) {
    if (lower.includes(keyword)) {
      selectedVerse = verse;
      break;
    }
  }

  // If an Old Testament verse was selected, use a New Testament default instead.
  const otPattern = /(Psalm|Isaiah|Deuteronomy|Lamentations|Proverbs|Ecclesiastes|Job|Genesis|Exodus|Leviticus|Numbers|Joshua|Judges|Ruth|1\s?Samuel|2\s?Samuel|1\s?Kings|2\s?Kings|1\s?Chronicles|2\s?Chronicles|Ezra|Nehemiah|Esther)/i;
  if (selectedVerse && otPattern.test(selectedVerse.reference)) {
    return {
      reference: 'John 14:27',
      text: 'Peace I leave with you; my peace I give to you.'
    };
  }

  // Default: a New Testament wisdom verse
  // (If a retrieved verse happens to be from the Old Testament, the fallback below will be used instead.)
  return {
    reference: 'John 14:27',
    text: 'Peace I leave with you; my peace I give to you.'
  };
}

// Format the AI reflection. The verse is returned separately and rendered by
// the client, so we strip any verse text the model may have repeated.
function formatResponse(aiText, verse) {
  var text = (aiText || '').trim();
  var citation = /(?:[1-3]\s)?[A-Z][a-z]+\.?\s\d+:\d+(?:-\d+)?/;

  // 1) Drop a leading sentence if it restates a verse citation.
  var firstSentence = text.match(/^[\s\S]*?[.!?]["'”’]?(?=\s|$)/);
  if (firstSentence && citation.test(firstSentence[0])) {
    text = text.slice(firstSentence[0].length).trim();
  }

  // 2) Remove exact repeats of the chosen verse text.
  if (verse && verse.text) {
    text = text.split(verse.text).join(' ');
  }

  // 3) Cosmetic cleanup: drop stray markdown the model may have emitted.
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[*-]\s+/gm, '')
    .replace(/\s{2,}/g, ' ');

  // 4) Strip a bare leading citation token, if any remains.
  text = text.replace(/^[^A-Za-z0-9]*(?:[1-3]\s)?[A-Z][a-z]+\.?\s\d+:\d+(?:-\d+)?\s*[:.\-–—]?\s*/i, '');
  text = text.replace(/^[\s"'“”‘’.,:;📖-]+/, '').replace(/\s{2,}/g, ' ').trim();

  if (text.length < 20) {
    text = 'May this passage bring you peace and clarity as you reflect on it.';
  }

  return text;
};

// Admin secret (can be overridden via environment variable on Render)
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'brion';

// Admin‑only page that shows the total unique‑user count
app.get('/bible', (req, res) => {
  if (req.query.admin === ADMIN_SECRET) {
    const count = users.size;
    res.send(`<h1>Total users: ${count}</h1><p>This app has been used by ${count} unique people.</p>`);
  } else {
    res.status(403).send('Admin only');
  }
});

app.listen(PORT, function() {
  console.log('📚 Bible AI Server running on port ' + PORT);
});