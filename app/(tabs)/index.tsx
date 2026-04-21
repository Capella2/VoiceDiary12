// app/(tabs)/index.tsx
// Main screen — diary entries grouped by month

import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, SectionList, TouchableOpacity,
  TextInput, Alert, StyleSheet, Platform, LayoutAnimation, UIManager,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { getAllEntries, searchEntries, deleteEntry, Entry } from '../../services/database';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiaryScreen() {
  const [rawData, setRawData] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  useFocusEffect(useCallback(() => { loadEntries(); }, [query]));

  function loadEntries(text = query) {
    const data = text.trim() === '' ? getAllEntries() : searchEntries({ query: text });
    setRawData(data);
  }

  // Группировка записей
  const sections = useMemo(() => {
    const groups: Record<string, Entry[]> = {};
    rawData.forEach(entry => {
      const date = new Date(entry.recorded_at);
      const key = `${date.getFullYear()} — ${date.toLocaleString('ru', { month: 'long' })}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });
    return Object.keys(groups).sort().reverse().map(title => ({
      title,
      data: collapsedSections[title] ? [] : groups[title],
      isCollapsed: !!collapsedSections[title]
    }));
  }, [rawData, collapsedSections]);

  function toggleSection(title: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedSections(prev => ({ ...prev, [title]: !prev[title] }));
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Дневник</Text>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={item => String(item.id)}
        renderSectionHeader={({ section }) => (
          <TouchableOpacity style={s.sectionHeader} onPress={() => toggleSection(section.title)}>
            <Text style={s.sectionTitle}>{section.title} ({section.isCollapsed ? '...' : section.data.length})</Text>
          </TouchableOpacity>
        )}
        renderItem={({ item }) => (
          <EntryCard
            entry={item}
            onPress={() => router.push(`/entry/${item.id}`)}
            onLongPress={() => confirmDelete(item.id, item.title)}
          />
        )}
      />
    </View>
  );
}

// ─── Вспомогательные функции и стили (EntryCard, EmptyState, styles) ──────────

function EntryCard({ entry, onPress, onLongPress }: { entry: Entry, onPress: () => void, onLongPress: () => void }) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} onLongPress={onLongPress}>
      <Text style={s.cardTitle}>{entry.title}</Text>
      <Text style={s.cardBody} numberOfLines={2}>{entry.body}</Text>
    </TouchableOpacity>
  );
}

function confirmDelete(id: number, title: string) {
  Alert.alert('Удалить?', 'Действие нельзя отменить.', [
    { text: 'Отмена' },
    { text: 'Удалить', style: 'destructive', onPress: async () => { await deleteEntry(id); } }
  ]);
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  header: { padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '800' },
  sectionHeader: { padding: 15, backgroundColor: '#eee', borderRadius: 8, marginHorizontal: 10, marginTop: 10 },
  sectionTitle: { fontWeight: '700', color: '#555' },
  card: { padding: 16, backgroundColor: '#fff', marginHorizontal: 10, marginVertical: 5, borderRadius: 10 },
  cardTitle: { fontWeight: '700', fontSize: 16 },
  cardBody: { fontSize: 14, color: '#666', marginTop: 4 }
});
