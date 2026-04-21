// services/aiProviders/groq.ts
// Groq Whisper API — free audio transcription (2h/day, no credit card)

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroqTranscriptionResult {
  text: string;
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function transcribeWithGroq(params: {
  audioUri: string;        // local file URI from expo-av
  apiKey: string;
  language?: string;       // 'ru', 'en', or undefined = auto-detect
}): Promise<string> {
  const { audioUri, apiKey, language } = params;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Groq API key is not configured. Go to Settings.');
  }

  // Use FormData for multipart/form-data
  const formData = new FormData();
  formData.append('model', WHISPER_MODEL);
  formData.append('response_format', 'json');
  
  if (language && language !== 'auto') {
    formData.append('language', language);
  }

  // In React Native, to upload a file we pass an object with uri, type and name
  // We need to ensure the URI is properly formatted for the platform
  const fileUri = Platform.OS === 'android' ? audioUri : audioUri.replace('file://', '');

  // @ts-ignore - FormData.append expects string | Blob, but RN supports this object
  formData.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  });

  // Send request
  let response: Response;
  try {
    response = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
      body: formData,
    });
  } catch (networkError) {
    throw new Error('No internet connection. Check your network.');
  }

  // Handle HTTP errors
  if (!response.ok) {
    let errorMessage = `Groq API error ${response.status}`;
    try {
      const errorBody = await response.json();
      errorMessage = errorBody?.error?.message ?? errorMessage;
    } catch {
      // ignore JSON parse error
    }

    if (response.status === 401) {
      throw new Error('Invalid Groq API key. Check Settings.');
    }
    if (response.status === 429) {
      throw new Error('Groq rate limit reached. Wait a moment and try again.');
    }
    throw new Error(errorMessage);
  }

  // Parse response
  let data: GroqTranscriptionResult;
  try {
    data = await response.json();
  } catch {
    throw new Error('Failed to parse Groq response. Try again.');
  }

  if (!data.text || data.text.trim() === '') {
    throw new Error('AI returned empty transcription. Try recording again.');
  }

  return data.text.trim();
}

// ─── Connection test ──────────────────────────────────────────────────────────

export async function testGroqConnection(apiKey: string): Promise<void> {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API key is empty.');
  }

  // Just check that the key is valid by calling models list endpoint
  let response: Response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
    });
  } catch {
    throw new Error('No internet connection.');
  }

  if (response.status === 401) {
    throw new Error('Invalid API key.');
  }
  if (!response.ok) {
    throw new Error(`Connection failed (${response.status}).`);
  }
  // success — no return value needed
}