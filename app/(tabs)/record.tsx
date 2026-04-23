import { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Alert, ScrollView, StyleSheet,
} from 'react-native';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { router, useFocusEffect } from 'expo-router';
import { saveEntry, getSetting } from '../../services/database';
import { transcribeAudio, buildEntryTitle, SETTINGS } from '../../services/transcription';

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

type ScreenState = 'idle' | 'recording' | 'recorded' | 'transcribing' | 'done';

export default function RecordScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ScreenState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('');
  const [currentProvider, setCurrentProvider] = useState('groq');

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date | null>(null);

  useFocusEffect(
    useCallback(() => {
      const p = getSetting(SETTINGS.PROVIDER) ?? 'groq';
      setCurrentProvider(p);
    }, [])
  );

  function startTimer() {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Нет доступа', 'Разрешите доступ к микрофону.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();
      recordingRef.current = recording;
      startTimeRef.current = new Date();
      setState('recording');
      startTimer();
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось начать запись.');
    }
  }

  async function stopRecording() {
    stopTimer();
    try {
      const recording = recordingRef.current;
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setDuration(elapsed);
      setAudioUri(uri ?? null);
      setState('recorded');
      recordingRef.current = null;
    } catch (e) {
      setState('idle');
    }
  }

  async function transcribe() {
    if (!audioUri) return;
    setState('transcribing');
    setStatusText(`Расшифровка (${currentProvider})...`);
    try {
      const result = await transcribeAudio(audioUri);
      const recordedAt = startTimeRef.current ?? new Date();
      saveEntry({
        title: buildEntryTitle(recordedAt),
        body: result.text,
        recorded_at: recordedAt.toISOString(),
        duration_sec: duration,
        audio_path: audioUri,
        provider: result.provider,
        model: result.model,
      });
      if (getSetting(SETTINGS.DELETE_AUDIO) === 'true') {
        await FileSystem.deleteAsync(audioUri, { idempotent: true });
      }
      setState('done');
      setStatusText('Готово!');
      setTimeout(() => {
        setState('idle');
        router.replace('/');
      }, 1000);
    } catch (e) {
      setState('recorded');
      Alert.alert(
        'Ошибка расшифровки',
        'Не удалось расшифровать запись. Сохранить её без текста?',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Сохранить черновик',
            onPress: () => {
              const recordedAt = startTimeRef.current ?? new Date();
              saveEntry({
                title: buildEntryTitle(recordedAt),
                body: '',
                recorded_at: recordedAt.toISOString(),
                duration_sec: duration,
                audio_path: audioUri,
                provider: 'offline',
                model: '-',
              });
              setState('done');
              setStatusText('Сохранено без текста');
              setTimeout(() => {
                setState('idle');
                router.replace('/');
              }, 1000);
            }
          }
        ]
      );
    }
  }

  const isBusy = state === 'transcribing' || state === 'done';

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f8f8', paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.buttonArea}>
          <TouchableOpacity
            style={[s.bigBtn, state === 'recording' && s.bigBtnRecording, (state === 'recorded' || isBusy) && s.bigBtnDone]}
            onPress={() => (state === 'recording' ? stopRecording() : startRecording())}
            disabled={state === 'recorded' || isBusy}
          >
            <Text style={{ fontSize: 64 }}>{state === 'recording' ? '⏹' : '🎙'}</Text>
          </TouchableOpacity>
          <Text style={s.timerText}>
            {state === 'recording' ? formatTime(elapsed) : formatTime(duration)}
          </Text>
          <Text style={s.hintText}>
            {state === 'idle' && 'Нажми для записи'}
            {state === 'recording' && 'Запись идет...'}
            {isBusy ? statusText : (state === 'recorded' && 'Запись завершена')}
          </Text>
        </View>

        {state === 'recorded' && !isBusy && (
          <View style={{ width: '100%', gap: 12 }}>
            <TouchableOpacity style={s.transcribeBtn} onPress={transcribe}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>✨ Расшифровать</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.reRecordBtn} onPress={() => setState('idle')}>
              <Text>🔄 Перезаписать</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// Вспомогательная функция вынесена наружу для стабильности бандлера
function formatTime(secs) {
  if (!secs) return "00:00";
  var m = Math.floor(secs / 60);
  var s = Math.floor(secs % 60);
  var displayM = m < 10 ? "0" + m : m;
  var displayS = s < 10 ? "0" + s : s;
  return displayM + ":" + displayS;
}

const s = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', padding: 40 },
  buttonArea: { alignItems: 'center', marginVertical: 60 },
  bigBtn: { width: 150, height: 150, borderRadius: 75, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center', elevation: 5 },
  bigBtnRecording: { backgroundColor: '#B71C1C' },
  bigBtnDone: { backgroundColor: '#9E9E9E' },
  timerText: { fontSize: 40, fontWeight: '200', marginVertical: 20 },
  hintText: { color: '#888' },
  transcribeBtn: { backgroundColor: '#1E88E5', padding: 18, borderRadius: 12, alignItems: 'center' },
  reRecordBtn: { padding: 15, alignItems: 'center' },
});