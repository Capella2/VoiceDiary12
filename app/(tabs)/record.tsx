// app/(tabs)/record.tsx
// Record screen — voice recording + AI transcription

import { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Alert, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { router, useFocusEffect } from 'expo-router';
import { saveEntry, getSetting } from '../../services/database';
import { transcribeAudio, buildEntryTitle, SETTINGS } from '../../services/transcription';

// ─── Recording config ─────────────────────────────────────────────────────────

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  web: {},
};

// ─── Screen states ────────────────────────────────────────────────────────────

type ScreenState = 'idle' | 'recording' | 'recorded' | 'transcribing' | 'done';

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecordScreen() {
  const [state,       setState]       = useState<ScreenState>('idle');
  const [elapsed,     setElapsed]     = useState(0);   // seconds while recording
  const [duration,    setDuration]    = useState(0);   // final duration seconds
  const [audioUri,    setAudioUri]    = useState<string | null>(null);
  const [statusText,  setStatusText]  = useState('');

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date | null>(null);

  console.log('[RecordScreen] Rendering, state:', state);

  // Load current provider for the badge
  const [currentProvider, setCurrentProvider] = useState('groq');

  useFocusEffect(
    useCallback(() => {
      try {
        const p = getSetting(SETTINGS.PROVIDER) ?? 'groq';
        setCurrentProvider(p);
        console.log('[RecordScreen] Current provider:', p);
      } catch (e) {
        console.error('[RecordScreen] Settings load error:', e);
      }
    }, [])
  );

  // ── Timer helpers ──────────────────────────────────────────────────────────

  function startTimer() {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(s => s + 1);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // ── Start recording ────────────────────────────────────────────────────────

  async function startRecording() {
    console.log('[RecordScreen] startRecording called');
    try {
      // Request microphone permission
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        console.warn('[RecordScreen] Microphone permission not granted');
        Alert.alert(
          'Нет доступа к микрофону',
          'Разрешите доступ к микрофону в настройках телефона.'
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      console.log('[RecordScreen] Preparing recording...');
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();

      recordingRef.current = recording;
      startTimeRef.current = new Date();
      setState('recording');
      startTimer();
      console.log('[RecordScreen] Recording started');
    } catch (e: any) {
      console.error('[RecordScreen] startRecording ERROR:', e);
      Alert.alert('Ошибка записи', e.message ?? 'Не удалось начать запись.');
    }
  }

  // ── Stop recording ─────────────────────────────────────────────────────────

  async function stopRecording() {
    console.log('[RecordScreen] stopRecording called');
    stopTimer();
    const finalDuration = elapsed;

    try {
      const recording = recordingRef.current;
      if (!recording) return;

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      setDuration(finalDuration);
      setAudioUri(uri ?? null);
      setState('recorded');
      console.log('[RecordScreen] Recording stopped, URI:', uri);
    } catch (e: any) {
      console.error('[RecordScreen] stopRecording ERROR:', e);
      Alert.alert('Ошибка', e.message ?? 'Не удалось остановить запись.');
      setState('idle');
    }
  }

  // ── Re-record ──────────────────────────────────────────────────────────────

  function reRecord() {
    console.log('[RecordScreen] reRecord called');
    setAudioUri(null);
    setElapsed(0);
    setDuration(0);
    setStatusText('');
    setState('idle');
  }

  // ── Transcribe ─────────────────────────────────────────────────────────────

  async function transcribe() {
    if (!audioUri) return;

    setState('transcribing');
    const provider = getSetting(SETTINGS.PROVIDER) ?? 'groq';
    setStatusText(`Отправляю на расшифровку (${provider})…`);
    console.log(`[RecordScreen] Starting transcription with ${provider}...`);

    try {
      const result = await transcribeAudio(audioUri);
      console.log('[RecordScreen] Transcription success');

      // Build title from recording start time
      const recordedAt  = startTimeRef.current ?? new Date();
      const title       = buildEntryTitle(recordedAt);

      // Save to database
      console.log('[RecordScreen] Saving to DB...');
      saveEntry({
        title,
        body:        result.text,
        recorded_at: recordedAt.toISOString(),
        duration_sec: duration,
        audio_path:  audioUri,
        provider:    result.provider,
        model:       result.model,
      });

      // Delete audio file if setting is enabled
      if (getSetting(SETTINGS.DELETE_AUDIO) === 'true') {
        console.log('[RecordScreen] Deleting source audio file...');
        await FileSystem.deleteAsync(audioUri, { idempotent: true });
      }

      setState('done');
      setStatusText('Готово!');

      // Navigate to diary tab after short delay
      setTimeout(() => {
        reRecord();
        router.replace('/');
      }, 1200);

    } catch (e: any) {
      console.error('[RecordScreen] Transcribe ERROR:', e);
      setState('recorded');
      Alert.alert('Ошибка расшифровки', e.message ?? 'Попробуй ещё раз.');
    }
  }

  // ── Big button press ───────────────────────────────────────────────────────

  function handleBigButton() {
    if (state === 'idle')      return startRecording();
    if (state === 'recording') return stopRecording();
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const isTranscribing = state === 'transcribing' || state === 'done';

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Big record button ─────────────────────────────────── */}
      <View style={s.buttonArea}>
        <TouchableOpacity
          style={[
            s.bigBtn,
            state === 'recording' && s.bigBtnRecording,
            (state === 'recorded' || isTranscribing) && s.bigBtnDone,
          ]}
          onPress={handleBigButton}
          disabled={state === 'recorded' || isTranscribing}
          activeOpacity={0.8}
        >
          <Text style={s.bigBtnIcon}>
            {state === 'recording' ? '⏹' : '🎙'}
          </Text>
        </TouchableOpacity>

        {/* Timer / duration */}
        <Text style={s.timerText}>
          {state === 'recording'
            ? formatTime(elapsed)
            : state === 'recorded' || isTranscribing
            ? formatTime(duration)
            : ''}
        </Text>

        {/* Hint under button */}
        <Text style={s.hintText}>
          {state === 'idle'      ? 'Нажми чтобы начать запись'  : ''}
          {state === 'recording' ? 'Нажми чтобы остановить'     : ''}
          {state === 'recorded'  ? 'Запись готова'               : ''}
          {state === 'transcribing' ? statusText                 : ''}
          {state === 'done'      ? statusText                    : ''}
        </Text>
      </View>

      {/* ── Controls after recording ──────────────────────────── */}
      {(state === 'recorded' || isTranscribing) && (
        <View style={s.controls}>

          {/* Transcribe button */}
          <TouchableOpacity
            style={[s.transcribeBtn, isTranscribing && s.transcriBtnDisabled]}
            onPress={transcribe}
            disabled={isTranscribing}
            activeOpacity={0.8}
          >
            {isTranscribing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.transcriBtnText}>✨ Расшифровать</Text>
            }
          </TouchableOpacity>

          {/* Re-record button */}
          {!isTranscribing && (
            <TouchableOpacity
              style={s.reRecordBtn}
              onPress={reRecord}
              activeOpacity={0.7}
            >
              <Text style={s.reRecordText}>🔄 Записать заново</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Provider info ─────────────────────────────────────── */}
      <View style={s.providerBadge}>
        <Text style={s.providerText}>
          Провайдер: {currentProvider}
        </Text>
      </View>

    </ScrollView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ACCENT = '#E53935';

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f8f8f8' },
  content:      { flexGrow: 1, alignItems: 'center', paddingTop: 60, paddingBottom: 40, paddingHorizontal: 24 },

  buttonArea:   { alignItems: 'center', marginBottom: 48 },

  bigBtn: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: ACCENT, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 16,
    elevation: 12,
  },
  bigBtnRecording: {
    backgroundColor: '#B71C1C',
    shadowColor: '#B71C1C',
  },
  bigBtnDone: {
    backgroundColor: '#9E9E9E',
    shadowColor: '#9E9E9E',
  },
  bigBtnIcon:   { fontSize: 64 },

  timerText:    { marginTop: 20, fontSize: 36, fontWeight: '200', color: '#333', letterSpacing: 2, minHeight: 44 },
  hintText:     { marginTop: 8, fontSize: 15, color: '#888', textAlign: 'center', minHeight: 22 },

  controls:     { width: '100%', gap: 12 },

  transcribeBtn: {
    backgroundColor: '#1E88E5', borderRadius: 14,
    padding: 18, alignItems: 'center',
    shadowColor: '#1E88E5', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  transcriBtnDisabled: { opacity: 0.65 },
  transcriBtnText:     { color: '#fff', fontSize: 17, fontWeight: '700' },

  reRecordBtn:  { borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#fff' },
  reRecordText: { fontSize: 15, color: '#555', fontWeight: '600' },

  providerBadge: { marginTop: 'auto', paddingTop: 24 },
  providerText:  { fontSize: 12, color: '#bbb', textAlign: 'center' },
});