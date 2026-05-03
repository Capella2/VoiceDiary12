// app/entry/[id].tsx
// Entry detail screen — full text, editable title, share/delete

import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Alert, Share, StyleSheet, Platform, ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { getEntryById, updateEntryTitle, updateEntryBody, deleteEntry, Entry, getSetting } from '../../services/database';
import { transcribeAudio, SETTINGS } from '../../services/transcription';
import * as FileSystem from 'expo-file-system/legacy';

export default function EntryDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id }            = useLocalSearchParams<{ id: string }>();
  const [entry,     setEntry]     = useState<Entry | null>(null);
  const [title,     setTitle]     = useState('');
  const [body,      setBody]      = useState('');
  const [editMode,  setEditMode]  = useState(false);
  const [editBodyMode, setEditBodyMode] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [sound,     setSound]     = useState<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  async function handleTranscribe() {
    if (!entry?.audio_path) return;
    setIsTranscribing(true);
    try {
      const result = await transcribeAudio(entry.audio_path);
      updateEntryBody(entry.id, result.text);
      setEntry({ ...entry, body: result.text, provider: result.provider, model: result.model });
      Alert.alert('Success', 'Note successfully transcribed.');
      
      if (getSetting(SETTINGS.DELETE_AUDIO) === 'true') {
        await FileSystem.deleteAsync(entry.audio_path, { idempotent: true });
        setEntry(prev => prev ? { ...prev, audio_path: null } : null);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to transcribe.');
    } finally {
      setIsTranscribing(false);
    }
  }

  async function playAudio() {
    if (!entry?.audio_path) return;
    try {
      if (sound) {
        if (isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          await sound.playAsync();
          setIsPlaying(true);
        }
        return;
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: entry.audio_path },
        { shouldPlay: true }
      );
      setSound(newSound);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
          newSound.setPositionAsync(0);
          newSound.pauseAsync();
        }
      });
    } catch (e) {
      console.error('Playback error:', e);
      Alert.alert('Error', 'Failed to play audio.');
    }
  }

  useEffect(() => {
    const found = getEntryById(Number(id));
    if (found) {
      setEntry(found);
      setTitle(found.title);
      setBody(found.body);
    }
    setLoading(false);
  }, [id]);

  function saveTitle() {
    if (!entry) return;
    if (title.trim() === '') {
      setTitle(entry.title);
      setEditMode(false);
      return;
    }
    updateEntryTitle(entry.id, title.trim());
    setEntry({ ...entry, title: title.trim() });
    setEditMode(false);
  }

  function saveBody() {
    if (!entry) return;
    updateEntryBody(entry.id, body.trim());
    setEntry({ ...entry, body: body.trim() });
    setEditBodyMode(false);
  }

  function cancelBodyEdit() {
    if (entry) setBody(entry.body);
    setEditBodyMode(false);
  }

  function handleDelete() {
    if (!entry) return;
    Alert.alert(
      'Delete entry?',
      'This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteEntry(entry.id);
            router.replace('/');
          },
        },
      ]
    );
  }

  async function handleShare() {
    if (!entry) return;
    await Share.share({
      title: entry.title,
      message: `${entry.title}\n\n${entry.body}`,
    });
  }

  // ─── Loading / not found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#E53935" />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={s.center}>
        <Text style={s.notFound}>Entry not found</Text>
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView 
      style={s.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* ── Title ──────────────────────────────────────────── */}
        <View style={s.titleRow}>
          {editMode ? (
            <TextInput
              style={s.titleInput}
              value={title}
              onChangeText={setTitle}
              onBlur={saveTitle}
              onSubmitEditing={saveTitle}
              autoFocus
              returnKeyType="done"
              selectTextOnFocus
            />
          ) : (
            <TouchableOpacity
              style={s.titleTouchable}
              onPress={() => setEditMode(true)}
              activeOpacity={0.7}
            >
              <Text style={s.titleText}>{entry.title}</Text>
              <Text style={s.editIcon}>✏️</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Meta ───────────────────────────────────────────── */}
        <Text style={s.meta}>
          {entry.provider} · {entry.model}
          {entry.duration_sec > 0 && `  ·  🎙 ${formatDuration(entry.duration_sec)}`}
        </Text>

        {/* ── Body ───────────────────────────────────────────── */}
        <View style={s.bodyCard}>
          {entry.body || editBodyMode ? (
            editBodyMode ? (
              <View>
                <TextInput
                  style={[s.bodyText, s.bodyInput]}
                  value={body}
                  onChangeText={setBody}
                  multiline
                  autoFocus
                />
                <View style={s.editActions}>
                  <TouchableOpacity style={[s.editBtn, s.cancelBtn]} onPress={cancelBodyEdit}>
                    <Text style={s.editBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.editBtn, s.saveBtn]} onPress={saveBody}>
                    <Text style={s.editBtnText}>💾 Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditBodyMode(true)} activeOpacity={0.7}>
                <Text style={s.bodyText} selectable>{entry.body}</Text>
              </TouchableOpacity>
            )
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Text style={{ color: '#999', fontStyle: 'italic', marginBottom: 20 }}>Transcription pending</Text>
              <TouchableOpacity 
                style={[s.mainTranscribeBtn, isTranscribing && { opacity: 0.6 }]} 
                onPress={handleTranscribe}
                disabled={isTranscribing}
              >
                {isTranscribing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>✨ Transcribe Now</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

      </ScrollView>

      {/* ── Action bar ─────────────────────────────────────────── */}
      <View style={[s.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {entry.audio_path && (
          <ActionButton 
            icon={isPlaying ? "⏸" : "🔊"} 
            label={isPlaying ? "Pause" : "Listen"} 
            onPress={playAudio} 
          />
        )}
        <ActionButton icon="📋" label="Copy" onPress={() => {
          // Clipboard requires expo-clipboard — use Share as fallback
          Share.share({ message: entry.body });
        }} />
        <ActionButton icon="📤" label="Share" onPress={handleShare} />
        <ActionButton icon="🗑" label="Delete" onPress={handleDelete} danger />
      </View>
    </KeyboardAvoidingView>
  );
}

// Action button
function ActionButton({
  icon, label, onPress, danger = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={s.actionBtn} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.actionIcon}>{icon}</Text>
      <Text style={[s.actionLabel, danger && s.actionLabelDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Helper
function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Styles
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f8f8f8' },
  scroll:      { flex: 1 },
  content:     { padding: 16, paddingBottom: 24 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound:    { fontSize: 16, color: '#999' },

  titleRow:        { marginBottom: 6 },
  titleTouchable:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleText:       { flex: 1, fontSize: 22, fontWeight: '800', color: '#111', lineHeight: 28 },
  editIcon:        { fontSize: 16 },
  titleInput:      { fontSize: 22, fontWeight: '800', color: '#111', borderBottomWidth: 2, borderBottomColor: '#E53935', paddingVertical: 4 },

  meta:   { fontSize: 12, color: '#bbb', marginBottom: 16 },

  bodyCard:  { backgroundColor: '#fff', borderRadius: 14, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  bodyText:  { fontSize: 16, color: '#222', lineHeight: 26 },
  bodyInput: { borderBottomWidth: 1, borderBottomColor: '#eee', padding: 0, textAlignVertical: 'top', minHeight: 100 },
  
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  editBtn:     { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  cancelBtn:   { backgroundColor: '#eee' },
  saveBtn:     { backgroundColor: '#43A047' },
  editBtnText: { fontWeight: '600', color: '#333' },
  
  mainTranscribeBtn: { backgroundColor: '#1E88E5', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },

  actionBar:   { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', paddingBottom: Platform.OS === 'ios' ? 28 : 12, paddingTop: 12 },
  actionBtn:   { flex: 1, alignItems: 'center', gap: 4 },
  actionIcon:  { fontSize: 22 },
  actionLabel: { fontSize: 12, color: '#555', fontWeight: '600' },
  actionLabelDanger: { color: '#E53935' },
});
