// app/entry/[id].tsx
// Entry detail screen — full text, editable title, share/delete

import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Alert, Share, StyleSheet, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { getEntryById, updateEntryTitle, deleteEntry, Entry } from '../../services/database';

export default function EntryDetailScreen() {
  const { id }            = useLocalSearchParams<{ id: string }>();
  const [entry,     setEntry]     = useState<Entry | null>(null);
  const [title,     setTitle]     = useState('');
  const [editMode,  setEditMode]  = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const found = getEntryById(Number(id));
    if (found) {
      setEntry(found);
      setTitle(found.title);
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

  function handleDelete() {
    if (!entry) return;
    Alert.alert(
      'Удалить запись?',
      'Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
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
        <Text style={s.notFound}>Запись не найдена</Text>
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
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
          <Text style={s.bodyText} selectable>{entry.body}</Text>
        </View>

      </ScrollView>

      {/* ── Action bar ─────────────────────────────────────────── */}
      <View style={s.actionBar}>
        <ActionButton icon="📋" label="Копировать" onPress={() => {
          // Clipboard requires expo-clipboard — use Share as fallback
          Share.share({ message: entry.body });
        }} />
        <ActionButton icon="📤" label="Поделиться" onPress={handleShare} />
        <ActionButton icon="🗑" label="Удалить" onPress={handleDelete} danger />
      </View>
    </View>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

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

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  actionBar:   { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', paddingBottom: Platform.OS === 'ios' ? 28 : 12, paddingTop: 12 },
  actionBtn:   { flex: 1, alignItems: 'center', gap: 4 },
  actionIcon:  { fontSize: 22 },
  actionLabel: { fontSize: 12, color: '#555', fontWeight: '600' },
  actionLabelDanger: { color: '#E53935' },
});