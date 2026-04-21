// services/transcription.ts
// Dispatcher — routes transcription request to the correct AI provider
// based on settings stored in the local database

import { getSetting } from './database';
import { transcribeWithGroq } from './aiProviders/groq';
import { transcribeWithGemini } from './aiProviders/gemini';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Provider = 'groq' | 'gemini' | 'openrouter';

export interface TranscriptionResult {
  text: string;
  provider: Provider;
  model: string;
}

// ─── Settings keys (shared constants) ────────────────────────────────────────

export const SETTINGS = {
  PROVIDER:        'provider',          // 'groq' | 'gemini' | 'openrouter'
  GROQ_API_KEY:    'groq_api_key',
  GEMINI_API_KEY:  'gemini_api_key',
  GEMINI_MODEL:    'gemini_model',      // e.g. 'gemini-1.5-flash'
  OR_API_KEY:      'or_api_key',        // OpenRouter
  OR_MODEL:        'or_model',
  LANGUAGE:        'language',          // 'auto' | 'ru' | 'en' | ...
  THEME:           'theme',             // 'system' | 'light' | 'dark'
  DATE_FORMAT:     'date_format',
  DELETE_AUDIO:    'delete_audio',      // 'true' | 'false'
} as const;

// ─── Language code helpers ────────────────────────────────────────────────────

// Groq/Whisper uses ISO 639-1 codes: 'ru', 'en', etc.
// Gemini expects language names: 'Russian', 'English', etc.

const LANGUAGE_NAMES: Record<string, string> = {
  ru: 'Russian',
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  zh: 'Chinese',
  ja: 'Japanese',
  ar: 'Arabic',
};

function toLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function transcribeAudio(
  audioUri: string
): Promise<TranscriptionResult> {
  // Load all required settings from SQLite
  const provider  = (getSetting(SETTINGS.PROVIDER) ?? 'groq') as Provider;
  const language  = getSetting(SETTINGS.LANGUAGE) ?? 'auto';

  switch (provider) {
    // ── Groq ────────────────────────────────────────────────────────────────
    case 'groq': {
      const apiKey = getSetting(SETTINGS.GROQ_API_KEY) ?? '';
      const text   = await transcribeWithGroq({
        audioUri,
        apiKey,
        language: language === 'auto' ? undefined : language,
      });
      return { text, provider: 'groq', model: 'whisper-large-v3' };
    }

    // ── Gemini ──────────────────────────────────────────────────────────────
    case 'gemini': {
      const apiKey = getSetting(SETTINGS.GEMINI_API_KEY) ?? '';
      const model  = getSetting(SETTINGS.GEMINI_MODEL) ?? 'gemini-1.5-flash';
      const text   = await transcribeWithGemini({
        audioUri,
        apiKey,
        model,
        language: language === 'auto' ? undefined : toLanguageName(language),
      });
      return { text, provider: 'gemini', model };
    }

    // ── OpenRouter ──────────────────────────────────────────────────────────
    case 'openrouter': {
      // OpenRouter support will be added in Phase 2
      throw new Error(
        'OpenRouter transcription is not yet supported. ' +
        'Please use Groq or Gemini in Settings.'
      );
    }

    default:
      throw new Error(`Unknown provider: "${provider}". Check Settings.`);
  }
}

// ─── Auto-generate entry title from recording date ────────────────────────────

export function buildEntryTitle(date: Date): string {
  const fmt = getSetting(SETTINGS.DATE_FORMAT) ?? 'DD.MM.YYYY';

  const dd   = String(date.getDate()).padStart(2, '0');
  const mm   = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const hh   = String(date.getHours()).padStart(2, '0');
  const min  = String(date.getMinutes()).padStart(2, '0');

  let datePart: string;
  switch (fmt) {
    case 'MM/DD/YYYY': datePart = `${mm}/${dd}/${yyyy}`; break;
    case 'YYYY-MM-DD': datePart = `${yyyy}-${mm}-${dd}`; break;
    default:           datePart = `${dd}.${mm}.${yyyy}`;
  }

  return `${datePart}  ${hh}:${min}`;
}