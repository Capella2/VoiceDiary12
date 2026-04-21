// app/(tabs)/settings.tsx
// Settings screen — AI provider config, language, appearance

import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Switch, Alert, ActivityIndicator, StyleSheet, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getSetting, saveSetting, deleteAllAudioFiles } from '../../services/database';
import { SETTINGS, Provider } from '../../services/transcription';
import { testGroqConnection } from '../../services/aiProviders/groq';
import { testGeminiConnection } from '../../services/aiProviders/gemini';

// ─── Provider option ──────────────────────────────────────────────────────────

const PROVIDERS: { label: string; value: Provider }[] = [
  { label: 'Groq (Whisper) — рекомендуется', value: 'groq' },
  { label: 'Google Gemini',                  value: 'gemini' },
  { label: 'OpenRouter',                     value: 'openrouter' },
];

const LANGUAGES = [
  { label: 'Авто-определение', value: 'auto' },
  { label: 'Русский',          value: 'ru' },
  { label: 'Английский',       value: 'en' },
  { label: 'Немецкий',         value: 'de' },
  { label: 'Французский',      value: 'fr' },
  { label: 'Испанский',        value: 'es' },
];

const DATE_FORMATS = [
  { label: 'ДД.ММ.ГГГГ',  value: 'DD.MM.YYYY' },
  { label: 'ММ/ДД/ГГГГ',  value: 'MM/DD/YYYY' },
  { label: 'ГГГГ-ММ-ДД',  value: 'YYYY-MM-DD' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const [provider,     setProvider]     = useState<Provider>('groq');
  const [groqKey,      setGroqKey]      = useState('');
  const [geminiKey,    setGeminiKey]    = useState('');
  const [geminiModel,  setGeminiModel]  = useState('gemini-1.5-flash');
  const [orKey,        setOrKey]        = useState('');
  const [orModel,      setOrModel]      = useState('');
  const [language,     setLanguage]     = useState('auto');
  const [dateFormat,   setDateFormat]   = useState('DD.MM.YYYY');
  const [deleteAudio,  setDeleteAudio]  = useState(false);
  const [showKey,      setShowKey]      = useState(false);
  const [testing,      setTesting]      = useState(false);
  const [saved,        setSaved]        = useState(false);

  // Load settings when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('[SettingsScreen] Loading settings...');
      try {
        const p = getSetting(SETTINGS.PROVIDER);
        setProvider((p ?? 'groq') as Provider);

        setGroqKey(getSetting(SETTINGS.GROQ_API_KEY)  ?? '');
        setGeminiKey(getSetting(SETTINGS.GEMINI_API_KEY) ?? '');
        setGeminiModel(getSetting(SETTINGS.GEMINI_MODEL) ?? 'gemini-1.5-flash');
        setOrKey(getSetting(SETTINGS.OR_API_KEY)  ?? '');
        setOrModel(getSetting(SETTINGS.OR_MODEL)  ?? '');
        setLanguage(getSetting(SETTINGS.LANGUAGE)     ?? 'auto');
        setDateFormat(getSetting(SETTINGS.DATE_FORMAT) ?? 'DD.MM.YYYY');
        setDeleteAudio(getSetting(SETTINGS.DELETE_AUDIO) === 'true');
        console.log('[SettingsScreen] Settings loaded.');
      } catch (err) {
        console.error('[SettingsScreen] Failed to load settings:', err);
      }
    }, [])
  );

  function saveAll() {
    saveSetting(SETTINGS.PROVIDER,       provider);
    saveSetting(SETTINGS.GROQ_API_KEY,   groqKey.trim());
    saveSetting(SETTINGS.GEMINI_API_KEY, geminiKey.trim());
    saveSetting(SETTINGS.GEMINI_MODEL,   geminiModel.trim());
    saveSetting(SETTINGS.OR_API_KEY,     orKey.trim());
    saveSetting(SETTINGS.OR_MODEL,       orModel.trim());
    saveSetting(SETTINGS.LANGUAGE,       language);
    saveSetting(SETTINGS.DATE_FORMAT,    dateFormat);
    saveSetting(SETTINGS.DELETE_AUDIO,   deleteAudio ? 'true' : 'false');

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testConnection() {
    saveAll();
    setTesting(true);
    try {
      if (provider === 'groq') {
        await testGroqConnection(groqKey.trim());
      } else if (provider === 'gemini') {
        await testGeminiConnection(geminiKey.trim(), geminiModel.trim());
      } else {
        Alert.alert('OpenRouter', 'Проверка OpenRouter пока не реализована.');
        return;
      }
      Alert.alert('✅ Успешно', 'Подключение работает!');
    } catch (e: any) {
      Alert.alert('❌ Ошибка', e.message ?? 'Неизвестная ошибка');
    } finally {
      setTesting(false);
    }
  }

  async function handleCleanup() {
    Alert.alert(
      'Очистить память?',
      'Все оригинальные аудиофайлы будут удалены. Текст заметок сохранится.',
      [
        { text: 'Отмена', style: 'cancel' },
        { 
          text: 'Очистить', 
          style: 'destructive',
          onPress: async () => {
            try {
              const count = await deleteAllAudioFiles();
              Alert.alert('Готово', `Удалено файлов: ${count}`);
            } catch (e) {
              Alert.alert('Ошибка', 'Не удалось очистить файлы');
            }
          }
        }
      ]
    );
  }

  // Active API key and setter for currently selected provider
  const activeKey    = provider === 'groq' ? groqKey
                     : provider === 'gemini' ? geminiKey : orKey;
  const setActiveKey = provider === 'groq' ? setGroqKey
                     : provider === 'gemini' ? setGeminiKey : setOrKey;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>

      {/* ── AI Provider ─────────────────────────────────────────── */}
      <SectionHeader title="ИИ провайдер" />

      {PROVIDERS.map(p => (
        <TouchableOpacity
          key={p.value}
          style={[s.radioRow, provider === p.value && s.radioRowActive]}
          onPress={() => setProvider(p.value)}
          activeOpacity={0.7}
        >
          <View style={[s.radioCircle, provider === p.value && s.radioCircleActive]} />
          <Text style={[s.radioLabel, provider === p.value && s.radioLabelActive]}>
            {p.label}
          </Text>
        </TouchableOpacity>
      ))}

      {/* API Key input */}
      <Text style={s.label}>
        API ключ ({provider === 'groq' ? 'Groq'
                 : provider === 'gemini' ? 'Gemini' : 'OpenRouter'})
      </Text>
      <View style={s.keyRow}>
        <TextInput
          style={[s.input, s.keyInput]}
          value={activeKey}
          onChangeText={setActiveKey}
          placeholder="Вставьте ключ сюда…"
          placeholderTextColor="#aaa"
          secureTextEntry={!showKey}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={s.eyeBtn}
          onPress={() => setShowKey(v => !v)}
        >
          <Text style={s.eyeIcon}>{showKey ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>

      {/* Gemini model picker */}
      {provider === 'gemini' && (
        <>
          <Text style={s.label}>Модель Gemini</Text>
          {['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'].map(m => (
            <TouchableOpacity
              key={m}
              style={[s.radioRow, geminiModel === m && s.radioRowActive]}
              onPress={() => setGeminiModel(m)}
              activeOpacity={0.7}
            >
              <View style={[s.radioCircle, geminiModel === m && s.radioCircleActive]} />
              <Text style={[s.radioLabel, geminiModel === m && s.radioLabelActive]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Helper links */}
      <Text style={s.hint}>
        {provider === 'groq'
          ? '🔗 Бесплатный ключ: console.groq.com  •  2 часа аудио/день'
          : provider === 'gemini'
          ? '🔗 Бесплатный ключ: aistudio.google.com  •  1500 запросов/день'
          : '🔗 Бесплатный ключ: openrouter.ai'}
      </Text>

      {/* Test button */}
      <TouchableOpacity
        style={[s.testBtn, testing && s.testBtnDisabled]}
        onPress={testConnection}
        disabled={testing}
        activeOpacity={0.8}
      >
        {testing
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={s.testBtnText}>🔌 Проверить подключение</Text>
        }
      </TouchableOpacity>

      {/* ── Transcription ────────────────────────────────────────── */}
      <SectionHeader title="Расшифровка" />

      <Text style={s.label}>Язык записи</Text>
      {LANGUAGES.map(l => (
        <TouchableOpacity
          key={l.value}
          style={[s.radioRow, language === l.value && s.radioRowActive]}
          onPress={() => setLanguage(l.value)}
          activeOpacity={0.7}
        >
          <View style={[s.radioCircle, language === l.value && s.radioCircleActive]} />
          <Text style={[s.radioLabel, language === l.value && s.radioLabelActive]}>
            {l.label}
          </Text>
        </TouchableOpacity>
      ))}

      {/* ── App preferences ──────────────────────────────────────── */}
      <SectionHeader title="Приложение" />

      <Text style={s.label}>Формат даты</Text>
      {DATE_FORMATS.map(f => (
        <TouchableOpacity
          key={f.value}
          style={[s.radioRow, dateFormat === f.value && s.radioRowActive]}
          onPress={() => setDateFormat(f.value)}
          activeOpacity={0.7}
        >
          <View style={[s.radioCircle, dateFormat === f.value && s.radioCircleActive]} />
          <Text style={[s.radioLabel, dateFormat === f.value && s.radioLabelActive]}>
            {f.label}
          </Text>
        </TouchableOpacity>
      ))}

      <View style={s.switchRow}>
        <View style={s.switchText}>
          <Text style={s.switchLabel}>Удалять аудио после расшифровки</Text>
          <Text style={s.switchHint}>Освобождает место на телефоне</Text>
        </View>
        <Switch
          value={deleteAudio}
          onValueChange={setDeleteAudio}
          trackColor={{ false: '#ddd', true: '#E53935' }}
          thumbColor="#fff"
        />
      </View>

      <TouchableOpacity
        style={s.cleanupBtn}
        onPress={handleCleanup}
        activeOpacity={0.7}
      >
        <Text style={s.cleanupBtnText}>🗑 Очистить сохраненные аудиофайлы</Text>
      </TouchableOpacity>

      {/* ── Save button ───────────────────────────────────────────── */}
      <TouchableOpacity
        style={[s.saveBtn, saved && s.saveBtnSaved]}
        onPress={saveAll}
        activeOpacity={0.8}
      >
        <Text style={s.saveBtnText}>
          {saved ? '✅ Сохранено!' : 'Сохранить настройки'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ACCENT = '#E53935';

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f8f8f8' },
  content:         { padding: 16 },

  sectionHeader:   { marginTop: 24, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 6 },
  sectionTitle:    { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8 },

  label:           { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 14, marginBottom: 6 },
  hint:            { fontSize: 12, color: '#888', marginTop: 6, lineHeight: 18 },

  radioRow:        { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: '#eee' },
  radioRowActive:  { borderColor: ACCENT, backgroundColor: '#fff5f5' },
  radioCircle:     { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#ccc', marginRight: 10 },
  radioCircleActive: { borderColor: ACCENT, backgroundColor: ACCENT },
  radioLabel:      { fontSize: 14, color: '#444', flex: 1 },
  radioLabelActive: { color: ACCENT, fontWeight: '600' },

  keyRow:          { flexDirection: 'row', alignItems: 'center' },
  input:           { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 14, color: '#222', marginBottom: 4 },
  keyInput:        { flex: 1, marginRight: 8, marginBottom: 0 },
  eyeBtn:          { padding: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 10 },
  eyeIcon:         { fontSize: 18 },

  testBtn:         { marginTop: 16, backgroundColor: '#1E88E5', borderRadius: 12, padding: 14, alignItems: 'center' },
  testBtnDisabled: { opacity: 0.6 },
  testBtnText:     { color: '#fff', fontWeight: '700', fontSize: 15 },

  switchRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 14, marginTop: 8, borderWidth: 1, borderColor: '#eee' },
  switchText:      { flex: 1 },
  switchLabel:     { fontSize: 14, color: '#333', fontWeight: '600' },
  switchHint:      { fontSize: 12, color: '#999', marginTop: 2 },

  cleanupBtn:      { marginTop: 16, padding: 14, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  cleanupBtnText:  { color: '#666', fontSize: 13, fontWeight: '600' },

  saveBtn:         { marginTop: 24, backgroundColor: ACCENT, borderRadius: 14, padding: 16, alignItems: 'center' },
  saveBtnSaved:    { backgroundColor: '#43A047' },
  saveBtnText:     { color: '#fff', fontWeight: '700', fontSize: 16 },
});
