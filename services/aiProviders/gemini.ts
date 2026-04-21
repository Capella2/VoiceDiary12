// services/aiProviders/gemini.ts
// Google Gemini API — audio transcription via multimodal model
// Free tier: 1500 requests/day on gemini-1.5-flash, no credit card required

import * as FileSystem from 'expo-file-system/legacy';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function transcribeWithGemini(params: {
  audioUri: string;
  apiKey: string;
  model?: string;        // default: 'gemini-1.5-flash'
  language?: string;     // 'Russian', 'English', or undefined = auto
}): Promise<string> {
  const {
    audioUri,
    apiKey,
    model = 'gemini-1.5-flash',
    language,
  } = params;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Gemini API key is not configured. Go to Settings.');
  }

  // Read audio file as base64
  const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Build transcription prompt
  const languageHint = language && language !== 'auto'
    ? ` The audio is in ${language}.`
    : '';

  const prompt =
    `Transcribe this audio recording accurately and completely.${languageHint}` +
    ` Return only the transcription text, without any comments or explanations.`;

  // Build request body
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
          {
            inline_data: {
              mime_type: 'audio/mp4',
              data: base64Audio,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,      // deterministic output for transcription
      maxOutputTokens: 8192,
    },
  };

  const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey.trim()}`;

  // Send request
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch {
    throw new Error('No internet connection. Check your network.');
  }

  // Parse response body
  let data: GeminiResponse;
  try {
    data = await response.json();
  } catch {
    throw new Error('Failed to parse Gemini response. Try again.');
  }

  // Handle API-level errors returned in JSON
  if (data.error) {
    const code = data.error.code;
    const msg  = data.error.message;

    if (code === 400) throw new Error(`Gemini bad request: ${msg}`);
    if (code === 403) throw new Error('Invalid Gemini API key. Check Settings.');
    if (code === 429) throw new Error('Gemini rate limit reached. Wait and try again.');
    throw new Error(`Gemini error ${code}: ${msg}`);
  }

  // Handle HTTP errors
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Invalid Gemini API key. Check Settings.');
    }
    if (response.status === 429) {
      throw new Error('Gemini rate limit reached. Wait and try again.');
    }
    throw new Error(`Gemini API error ${response.status}.`);
  }

  // Extract transcription text
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text || text.trim() === '') {
    throw new Error('Gemini returned empty transcription. Try recording again.');
  }

  return text.trim();
}

// ─── Connection test ──────────────────────────────────────────────────────────

export async function testGeminiConnection(
  apiKey: string,
  model = 'gemini-1.5-flash'
): Promise<void> {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API key is empty.');
  }

  // Send a minimal text request just to verify the key works
  const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey.trim()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    });
  } catch {
    throw new Error('No internet connection.');
  }

  let data: GeminiResponse;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Connection failed (${response.status}).`);
  }

  if (data.error?.code === 403 || response.status === 403) {
    throw new Error('Invalid API key.');
  }
  if (!response.ok) {
    throw new Error(`Connection failed (${response.status}).`);
  }
}