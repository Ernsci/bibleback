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
  '9) Do not open with "Certainly", "Of course", or "As an AI".';

app.post('/api/chat', async (req, res) => {
  try {
    const userMessage = req.body.message;
    if (!userMessage) return res.status(400).json({ error: 'Message required' });

    // 1. Call OpenRouter AI with system instruction
    const openrouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: userMessage }
        ],
        max_tokens: 400,
      }),
    });

    if (!openrouterResponse.ok) {
      const errText = await openrouterResponse.text();
      console.error('OpenRouter error:', errText);
      return res.status(500).json({ error: 'AI service error' });
    }

    const data = await openrouterResponse.json();
    const aiResponse = data.choices[0].message.content;

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
    console.error(error);
    res.status(500).json({ error: 'Server error' });
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
    ' grief': { reference: 'Psalm 34:18', text: 'The Lord is near to the brokenhearted and saves the crushed in spirit.' },
    'anxiety': { reference: 'Philippians 4:6-7', text: 'Do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God. And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.' },
    'heartbreak': { reference: 'Psalm 34:18', text: 'The Lord is near to the brokenhearted and saves the crushed in spirit.' },
    'lonely': { reference: 'Psalm 23:4', text: 'Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me.' },
  };

  // Check for keyword matches - exact or substring
  for (const [keyword, verse] of Object.entries(verseMap)) {
    if (lower.includes(keyword)) {
      return verse;
    }
  }

  // Default: a general wisdom verse
  return {
    reference: 'Proverbs 3:5-6',
    text: 'Trust in the Lord with all your heart, and do not lean on your own understanding. In all your ways acknowledge him, and he will make straight your paths.'
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

  // 3) Strip a bare leading citation token, if any remains.
  text = text.replace(/^[^A-Za-z0-9]*(?:[1-3]\s)?[A-Z][a-z]+\.?\s\d+:\d+(?:-\d+)?\s*[:.\-–—]?\s*/i, '');
  text = text.replace(/^[\s"'“”‘’.,:;📖-]+/, '').replace(/\s{2,}/g, ' ').trim();

  if (text.length < 20) {
    text = 'May this passage bring you peace and clarity as you reflect on it.';
  }

  return text;
};

app.listen(PORT, function() {
  console.log('📚 Bible AI Server running on port ' + PORT);
});