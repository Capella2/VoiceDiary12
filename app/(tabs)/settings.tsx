// app/(tabs)/settings.tsx
// Settings screen — AI provider config, language, appearance

import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Switch, Alert, ActivityIndicator, StyleSheet, Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
const { StorageAccessFramework } = FileSystem;
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { getSetting, saveSetting, deleteAllAudioFiles, getAllEntriesForBackup, importEntries } from '../../services/database';
import { SETTINGS, Provider } from '../../services/transcription';
import { testGroqConnection } from '../../services/aiProviders/groq';
import { testGeminiConnection } from '../../services/aiProviders/gemini';

// ─── Provider option ──────────────────────────────────────────────────────────

const PROVIDERS: { label: string; value: Provider }[] = [
  { label: 'Groq (Whisper) — Recommended', value: 'groq' },
  { label: 'Google Gemini',                  value: 'gemini' },
  { label: 'OpenRouter',                     value: 'openrouter' },
];

const LANGUAGES = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'Russian',     value: 'ru' },
  { label: 'English',     value: 'en' },
  { label: 'German',      value: 'de' },
  { label: 'French',      value: 'fr' },
  { label: 'Spanish',     value: 'es' },
];

const DATE_FORMATS = [
  { label: 'DD.MM.YYYY',  value: 'DD.MM.YYYY' },
  { label: 'MM/DD/YYYY',  value: 'MM/DD/YYYY' },
  { label: 'YYYY-MM-DD',  value: 'YYYY-MM-DD' },
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
  const [isExporting,  setIsExporting]  = useState(false);
  const [isImporting,  setIsImporting]  = useState(false);

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
        Alert.alert('OpenRouter', 'OpenRouter test not implemented yet.');
        return;
      }
      Alert.alert('✅ Success', 'Connection works!');
    } catch (e: any) {
      Alert.alert('❌ Error', e.message ?? 'Unknown error');
    } finally {
      setTesting(false);
    }
  }

  async function handleCleanup() {
    Alert.alert(
      'Clear Storage?',
      'All original audio files will be deleted. Note text will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: async () => {
            try {
              const count = await deleteAllAudioFiles();
              Alert.alert('Done', `Deleted files: ${count}`);
            } catch (e) {
              Alert.alert('Error', 'Failed to clear files');
            }
          }
        }
      ]
    );
  }

  async function handleExportBackup() {
    setIsExporting(true);
    try {
      const data = getAllEntriesForBackup();
      if (!data || data.length === 0) {
        Alert.alert('Empty', 'No entries to export');
        return;
      }
      
      const jsonString = JSON.stringify(data, null, 2);
      const fileName = 'VoiceDiary_Backup.json';

      // Android SAF
      if (Platform.OS === 'android' && StorageAccessFramework) {
        try {
          const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
          
          if (permissions.granted) {
            const fileUri = await StorageAccessFramework.createFileAsync(
              permissions.directoryUri,
              'VoiceDiary_Backup',
              'application/json'
            );
            
            await FileSystem.writeAsStringAsync(fileUri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });
            Alert.alert('Done', 'Backup successfully saved to selected folder');
            return;
          }
        } catch (safErr) {
          console.warn('SAF error, falling back to Sharing:', safErr);
        }
      }

      // Sharing fallback / iOS
      const tempUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(tempUri, jsonString);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(tempUri, { 
          mimeType: 'application/json', 
          dialogTitle: 'Save Backup' 
        });
      } else {
        Alert.alert('Error', 'Sharing not available');
      }

    } catch (e: any) {
      console.error('Export error:', e);
      Alert.alert('Error', `Failed to save file: ${e.message}`);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImportBackup() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (res.canceled) return;

      setIsImporting(true);
      const content = await FileSystem.readAsStringAsync(res.assets[0].uri);
      const data = JSON.parse(content);

      if (!Array.isArray(data)) {
        throw new Error('Invalid backup file format');
      }

      const count = importEntries(data);
      Alert.alert('Success', `Imported ${count} new entries`);
    } catch (e) {
      console.error('Import error:', e);
      Alert.alert('Import Error', 'Failed to read backup file. Make sure it is a valid VoiceDiary JSON.');
    } finally {
      setIsImporting(false);
    }
  }

  const activeKey    = provider === 'groq' ? groqKey
                     : provider === 'gemini' ? geminiKey : orKey;
  const setActiveKey = provider === 'groq' ? setGroqKey
                     : provider === 'gemini' ? setGeminiKey : setOrKey;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>

      {/* ── AI Provider ─────────────────────────────────────────── */}
      <SectionHeader title="AI Provider" />

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
        API Key ({provider === 'groq' ? 'Groq'
                 : provider === 'gemini' ? 'Gemini' : 'OpenRouter'})
      </Text>
      <View style={s.keyRow}>
        <TextInput
          style={[s.input, s.keyInput]}
          value={activeKey}
          onChangeText={setActiveKey}
          placeholder="Paste key here..."
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
          <Text style={s.label}>Gemini Model</Text>
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
          ? '🔗 Free key: console.groq.com  •  2 hours audio/day'
          : provider === 'gemini'
          ? '🔗 Free key: aistudio.google.com  •  1500 requests/day'
          : '🔗 Free key: openrouter.ai'}
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
          : <Text style={s.testBtnText}>🔌 Test Connection</Text>
        }
      </TouchableOpacity>

      {/* ── Transcription ────────────────────────────────────────── */}
      <SectionHeader title="Transcription" />

      <Text style={s.label}>Recording Language</Text>
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
      <SectionHeader title="App Preferences" />

      <Text style={s.label}>Date Format</Text>
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
          <Text style={s.switchLabel}>Delete audio after transcription</Text>
          <Text style={s.switchHint}>Saves space on your device</Text>
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
        <Text style={s.cleanupBtnText}>🗑 Clear saved audio files</Text>
      </TouchableOpacity>

      {/* ── Save button ───────────────────────────────────────────── */}
      <TouchableOpacity
        style={[s.saveBtn, saved && s.saveBtnSaved]}
        onPress={saveAll}
        activeOpacity={0.8}
      >
        <Text style={s.saveBtnText}>
          {saved ? '✅ Saved!' : 'Save Settings'}
        </Text>
      </TouchableOpacity>

      {/* ── Backup & Restore ─────────────────────────────────────── */}
      <SectionHeader title="Data (Text)" />
      
      <View style={{ gap: 10, marginTop: 8 }}>
        <TouchableOpacity style={s.secondaryBtn} onPress={handleExportBackup} disabled={isExporting}>
          <Text style={s.secondaryBtnText}>
            {isExporting ? 'Creating...' : '📤 Export notes (JSON)'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={s.secondaryBtn} onPress={handleImportBackup} disabled={isImporting}>
          <Text style={s.secondaryBtnText}>
            {isImporting ? 'Loading...' : '📥 Import from file'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── About ────────────────────────────────────────────────── */}
      <SectionHeader title="About" />
      <View style={s.aboutBox}>
        <Text style={s.aboutText}>VoiceDiary v1.0.0</Text>
        <Text style={s.aboutText}>Author: Capt. Stoyev Igor</Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// Section header
function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

// Styles
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

  secondaryBtn:     { padding: 14, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', marginTop: 4 },
  secondaryBtnText: { color: '#444', fontSize: 14, fontWeight: '600' },
  
  aboutBox:         { padding: 16, alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, marginTop: 8, borderWidth: 1, borderColor: '#eee' },
  aboutText:        { fontSize: 14, color: '#666', fontWeight: '500', lineHeight: 20 },
});
