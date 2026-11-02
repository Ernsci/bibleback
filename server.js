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
const SYSTEM_INSTRUCTION = 'You are Bible AI, providing considered, compassionate responses that reference Scripture. ' +
  'Guidelines: ' +
  '1) Answer the user\'s question thoughtfully and accurately. ' +
  '2) Reference at least one relevant Bible verse with its text. ' +
  '3) When the user opens up or shares personal feelings, offer comfort using Bible verses - ' +
  'begin with the verse, then gentle, brief words of comfort. ' +
  '4) Keep responses concise (2-3 short paragraphs maximum). ' +
  '5) Use a respectful, measured tone - not preachy or dogmatic. ' +
  '6) If the question is outside Scripture\'s scope, acknowledge that and offer a general wisdom perspective. ' +
  '7) Never invent or hallucinate Bible verses or references. ' +
  '8) Format: begin with the verse reference and text, then your response. ' +
  '9) One verse per response is sufficient. ' +
  '10) Be helpful without being weighty. Keep it brief. ' +
  '11) When users share vulnerability, lead with a comfort verse (Psalm 34:18, Matthew 5:4, 2 Corinthians 1:3) ' +
  'followed by minimal, sincere empathy.';

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

// Format the complete response with verse
function formatResponse(aiText, verse) {
  const cleaned = (aiText || '').trim();

  // Clean the AI text - remove any verse references the AI might have included
  const cleanedText = cleaned
    .split('\n')
    .filter(line => !line.match(/^(PS|Proverbs|Isaiah|John|Matthew|etc)\./i))
    .join(' ')
    .trim();

  // Build the response: verse first, then the AI reflection
  const verseDisplay = '📖 ' + verse.reference + ': "' + verse.text + '"';

  // If the AI text is mostly empty or generic, just return the verse
  if (cleanedText.length < 20 || /^(well|hmm|okay|alright)/i.test(cleanedText)) {
    return verseDisplay + '<br><br>' + (cleanedText || 'May God\'s wisdom speak into this moment.');
  }

  return verseDisplay + '<br><br>' + cleanedText;
};

app.listen(PORT, function() {
  console.log('📚 Bible AI Server running on port ' + PORT);
});