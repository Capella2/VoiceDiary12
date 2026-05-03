// app/(tabs)/index.tsx
// Main screen — diary entries grouped by month

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, SectionList, TouchableOpacity,
  TextInput, Alert, StyleSheet, Platform, LayoutAnimation, UIManager,
} from 'react-native';
import { Audio } from 'expo-av';
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

  // Загрузка при фокусе на экран
  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [])
  );

  // Обновление при изменении поискового запроса
  useEffect(() => {
    loadEntries();
  }, [query]);

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

  function confirmDelete(id: number, title: string) {
    Alert.alert('Удалить?', `Удалить "${title}"?`, [
      { text: 'Отмена', style: 'cancel' },
      { 
        text: 'Удалить', 
        style: 'destructive', 
        onPress: async () => { 
          await deleteEntry(id); 
          loadEntries(); 
        } 
      }
    ]);
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        {!searchMode ? (
          <View style={s.headerRow}>
            <Text style={s.title}>Дневник</Text>
            <TouchableOpacity onPress={() => setSearchMode(true)} style={s.searchBtn}>
              <Text style={s.searchIcon}>🔍</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.searchRow}>
            <TextInput
              style={s.searchInput}
              placeholder="Поиск по заметкам..."
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            <TouchableOpacity onPress={() => { setSearchMode(false); setQuery(''); }} style={s.closeBtn}>
              <Text style={s.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
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
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>
              {query.trim() !== '' ? 'Ничего не найдено' : 'Записей пока нет'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ─── Вспомогательные функции и стили (EntryCard, EmptyState, styles) ──────────

function EntryCard({ entry, onPress, onLongPress }: { entry: Entry, onPress: () => void, onLongPress: () => void }) {
  const [collapsed, setCollapsed] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound,     setSound]     = useState<Audio.Sound | null>(null);

  const toggleCollapse = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed(!collapsed);
  };

  async function playAudio() {
    if (!entry.audio_path) return;
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
      Alert.alert('Ошибка', 'Не удалось воспроизвести аудио.');
    }
  }

  // Cleanup sound on unmount
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (sound) {
          sound.unloadAsync();
        }
      };
    }, [sound])
  );

  return (
    <TouchableOpacity 
      style={s.card} 
      onPress={onPress} 
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={s.cardHeader}>
        <TouchableOpacity style={s.cardTitleContainer} onPress={toggleCollapse}>
          <Text style={s.cardTitle}>{entry.title}</Text>
          <Text style={s.collapseIcon}>{collapsed ? '▼' : '▲'}</Text>
        </TouchableOpacity>
        
        {entry.audio_path && (
          <TouchableOpacity style={s.playBtn} onPress={playAudio}>
            <Text style={s.playBtnIcon}>{isPlaying ? '⏸' : '▶️'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!collapsed && (
        <Text style={[s.cardBody, !entry.body && { fontStyle: 'italic', color: '#999' }]}>
          {entry.body || '(Ожидает расшифровки...)'}
        </Text>
      )}
      
      {collapsed && (
        <Text style={[s.cardBody, !entry.body && { fontStyle: 'italic', color: '#999' }]} numberOfLines={1}>
          {entry.body || '(Ожидает расшифровки...)'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111' },
  
  searchBtn: { padding: 8 },
  searchIcon: { fontSize: 20 },
  
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, height: 40, backgroundColor: '#f0f0f0', borderRadius: 10, paddingHorizontal: 15, fontSize: 16 },
  closeBtn: { padding: 5 },
  closeIcon: { fontSize: 18, color: '#999' },

  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 16 },

  sectionHeader: { padding: 15, backgroundColor: '#eee', borderRadius: 8, marginHorizontal: 10, marginTop: 10 },
  sectionTitle: { fontWeight: '700', color: '#555' },
  card: { padding: 16, backgroundColor: '#fff', marginHorizontal: 10, marginVertical: 5, borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitleContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontWeight: '700', fontSize: 16, flexShrink: 1 },
  collapseIcon: { fontSize: 12, color: '#999', marginLeft: 8 },
  playBtn: { padding: 8, backgroundColor: '#f0f0f0', borderRadius: 20, marginLeft: 10 },
  playBtnIcon: { fontSize: 16 },
  cardBody: { fontSize: 14, color: '#666', marginTop: 4, lineHeight: 20 }
});
