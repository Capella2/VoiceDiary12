// app/(tabs)/index.tsx
// Main screen — diary entries grouped by Year -> Month -> Day with persistent collapse state

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, Alert, StyleSheet, Platform, LayoutAnimation, UIManager,
} from 'react-native';
import { Audio } from 'expo-av';
import { useFocusEffect, router } from 'expo-router';
import { getAllEntries, searchEntries, deleteEntry, Entry, getSetting, saveSetting } from '../../services/database';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Types for Flattened List ────────────────────────────────────────────────

type ListItem = 
  | { type: 'YEAR';  id: string; title: string; count: number }
  | { type: 'MONTH'; id: string; title: string; count: number; yearId: string }
  | { type: 'DAY';   id: string; title: string; count: number; monthId: string; yearId: string }
  | { type: 'ENTRY'; id: string; data: Entry;  dayId: string;   monthId: string; yearId: string };

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiaryScreen() {
  const [rawData, setRawData] = useState<Entry[]>([]);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const [showLaunchChoice, setShowLaunchChoice] = useState(false);
  const isFirstMount = useRef(true);

  const loadEntries = useCallback((text = query) => {
    const data = text.trim() === '' ? getAllEntries() : searchEntries({ query: text });
    setRawData(data);
  }, [query]);

  // Load persistence and data
  useFocusEffect(
    useCallback(() => {
      loadEntries();
      
      if (isFirstMount.current) {
        setShowLaunchChoice(true);
        isFirstMount.current = false;
      }

      const saved = getSetting('ui_collapsed_state_v2'); // New key for 4-tier state
      if (saved) {
        try { setCollapsed(JSON.parse(saved)); } catch(e) {}
      }
      setIsLoaded(true);
    }, [loadEntries])
  );

  // Sync persistence
  useEffect(() => {
    if (isLoaded) {
      saveSetting('ui_collapsed_state_v2', JSON.stringify(collapsed));
    }
  }, [collapsed, isLoaded]);

  useEffect(() => { loadEntries(); }, [query, loadEntries]);

  // Flattening Logic: Year -> Month -> Day -> Entry
  const displayList = useMemo(() => {
    const list: ListItem[] = [];
    if (rawData.length === 0) return list;

    // Grouping structure: Year -> Month -> Day -> Entries
    const tree: Record<string, Record<string, Record<string, Entry[]>>> = {};

    rawData.forEach(entry => {
      const d = new Date(entry.recorded_at);
      const yId = `y-${d.getFullYear()}`;
      const mId = `m-${d.getFullYear()}-${d.getMonth() + 1}`;
      const dId = `d-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

      if (!tree[yId]) tree[yId] = {};
      if (!tree[yId][mId]) tree[yId][mId] = {};
      if (!tree[yId][mId][dId]) tree[yId][mId][dId] = [];
      tree[yId][mId][dId].push(entry);
    });

    // Build Flat Array
    const yIds = Object.keys(tree).sort().reverse();
    yIds.forEach(yId => {
      const yearStr = yId.split('-')[1];
      
      // Calculate total entries in year
      let yearTotal = 0;
      Object.values(tree[yId]).forEach(m => {
        Object.values(m).forEach(d => yearTotal += d.length);
      });

      list.push({ type: 'YEAR', id: yId, title: yearStr, count: yearTotal });

      if (!collapsed[yId] || searchMode) {
        const mIds = Object.keys(tree[yId]).sort((a,b) => {
          const ma = parseInt(a.split('-')[2]);
          const mb = parseInt(b.split('-')[2]);
          return mb - ma;
        });

        mIds.forEach(mId => {
          const monthNum = parseInt(mId.split('-')[2]);
          const mDate = new Date(parseInt(yearStr), monthNum - 1);
          const mTitle = mDate.toLocaleDateString('en', { month: 'long' });

          // Calculate total entries in month
          let monthTotal = 0;
          Object.values(tree[yId][mId]).forEach(d => monthTotal += d.length);

          list.push({ type: 'MONTH', id: mId, title: mTitle, count: monthTotal, yearId: yId });

          if (!collapsed[mId] || searchMode) {
            const dIds = Object.keys(tree[yId][mId]).sort((a,b) => {
              const da = parseInt(a.split('-')[3]);
              const db = parseInt(b.split('-')[3]);
              return db - da;
            });

            dIds.forEach(dId => {
              const dEntries = tree[yId][mId][dId];
              const dDate = new Date(dEntries[0].recorded_at);
              const dTitle = dDate.toLocaleDateString('en', { weekday: 'long', day: 'numeric' });

              list.push({ type: 'DAY', id: dId, title: dTitle, count: dEntries.length, monthId: mId, yearId: yId });

              if (!collapsed[dId] || searchMode) {
                dEntries.forEach(entry => {
                  list.push({ type: 'ENTRY', id: `e-${entry.id}`, data: entry, dayId: dId, monthId: mId, yearId: yId });
                });
              }
            });
          }
        });
      }
    });

    return list;
  }, [rawData, collapsed, searchMode]);

  function toggle(id: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function confirmDelete(id: number, title: string) {
    Alert.alert('Delete?', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteEntry(id); loadEntries(); } }
    ]);
  }

  return (
    <View style={s.container}>
      {/* ── Launch Choice Modal ────────────────────────────────── */}
      {showLaunchChoice && (
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalEmoji}>🎙️</Text>
            <Text style={s.modalTitle}>Welcome to VoiceDiary</Text>
            <Text style={s.modalHint}>How would you like to start?</Text>
            
            <TouchableOpacity 
              style={[s.modalBtn, s.modalBtnPrimary]} 
              onPress={() => {
                setShowLaunchChoice(false);
                router.push('/record?mode=quick');
              }}
            >
              <Text style={s.modalBtnTextPrimary}>⚡ Quick 6s Record</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={s.modalBtn} 
              onPress={() => setShowLaunchChoice(false)}
            >
              <Text style={s.modalBtnText}>Open Diary</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={s.header}>
        {!searchMode ? (
          <View style={s.headerRow}>
            <Text style={s.title}>Diary</Text>
            <TouchableOpacity onPress={() => setSearchMode(true)} style={s.searchBtn}>
              <Text style={s.searchIcon}>🔍</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.searchRow}>
            <TextInput
              style={s.searchInput}
              placeholder="Search notes..."
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

      <FlatList
        data={displayList}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => {
          if (item.type === 'YEAR') {
            return (
              <TouchableOpacity style={s.yearHeader} onPress={() => toggle(item.id)}>
                <Text style={s.yearTitle}>{item.title}</Text>
                <View style={s.badgeYear}><Text style={s.badgeTextYear}>{item.count}</Text></View>
                <Text style={s.chevron}>{collapsed[item.id] ? '▶' : '▼'}</Text>
              </TouchableOpacity>
            );
          }
          if (item.type === 'MONTH') {
            return (
              <TouchableOpacity style={s.monthHeader} onPress={() => toggle(item.id)}>
                <View style={s.nestLineYear} />
                <Text style={s.monthTitle}>{item.title}</Text>
                <View style={s.badge}><Text style={s.badgeText}>{item.count}</Text></View>
                <Text style={s.chevron}>{collapsed[item.id] ? '▶' : '▼'}</Text>
              </TouchableOpacity>
            );
          }
          if (item.type === 'DAY') {
            return (
              <TouchableOpacity style={s.dayHeader} onPress={() => toggle(item.id)}>
                <View style={s.nestLineYear} />
                <View style={s.nestLineMonth} />
                <View style={s.dayLine} />
                <Text style={s.dayTitle}>{item.title}</Text>
                <Text style={s.dayCount}>{item.count}</Text>
                <Text style={s.chevronSmall}>{collapsed[item.id] ? '▶' : '▼'}</Text>
              </TouchableOpacity>
            );
          }
          return (
            <View style={s.entryWrapper}>
              <View style={s.nestLineYear} />
              <View style={s.nestLineMonth} />
              <View style={s.entryLine} />
              <EntryCard
                entry={item.data}
                onPress={() => router.push(`/entry/${item.data.id}`)}
                onLongPress={() => confirmDelete(item.data.id, item.data.title)}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>
              {query.trim() !== '' ? 'No results found' : 'No entries yet'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

// ─── EntryCard Component ──────────────────────────────────────────────────────

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
        if (isPlaying) { await sound.pauseAsync(); setIsPlaying(false); }
        else { await sound.playAsync(); setIsPlaying(true); }
        return;
      }
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: entry.audio_path }, { shouldPlay: true });
      setSound(newSound);
      setIsPlaying(true);
      newSound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
          newSound.setPositionAsync(0);
          newSound.pauseAsync();
        }
      });
    } catch (e) { Alert.alert('Error', 'Failed to play audio.'); }
  }

  useFocusEffect(useCallback(() => () => { if (sound) sound.unloadAsync(); }, [sound]));

  return (
    <TouchableOpacity style={s.card} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
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
      <Text style={[s.cardBody, !entry.body && { fontStyle: 'italic', color: '#999' }]} numberOfLines={collapsed ? 1 : 0}>
        {entry.body || '(Waiting for transcription...)'}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  yearHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#333', padding: 12, marginTop: 15, marginHorizontal: 8, borderRadius: 8 },
  yearTitle: { fontSize: 20, fontWeight: '900', color: '#fff', flex: 1 },
  badgeYear: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeTextYear: { fontSize: 12, color: '#fff', fontWeight: 'bold' },

  monthHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, marginTop: 4, borderBottomWidth: 1, borderColor: '#eee' },
  monthTitle: { fontSize: 17, fontWeight: '700', color: '#222', flex: 1 },
  nestLineYear: { width: 2, height: '100%', backgroundColor: '#ddd', marginLeft: 10, marginRight: 15 },
  
  badge: { backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: 11, color: '#888', fontWeight: 'bold' },
  chevron: { fontSize: 12, color: '#bbb', marginLeft: 10 },

  dayHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#fdfdfd' },
  nestLineMonth: { width: 2, height: '100%', backgroundColor: '#eee', marginRight: 15 },
  dayLine: { width: 3, height: '60%', backgroundColor: '#E53935', borderRadius: 2, marginRight: 8 },
  dayTitle: { fontSize: 14, fontWeight: '600', color: '#555', flex: 1 },
  dayCount: { fontSize: 11, color: '#aaa', marginRight: 6 },
  chevronSmall: { fontSize: 10, color: '#ccc' },

  entryWrapper: { flexDirection: 'row' },
  entryLine: { width: 1, backgroundColor: '#f0f0f0', marginRight: 5 },

  card: { flex: 1, padding: 14, backgroundColor: '#fff', marginRight: 10, marginVertical: 3, borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitleContainer: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontWeight: '700', fontSize: 14, flexShrink: 1, color: '#333' },
  collapseIcon: { fontSize: 10, color: '#bbb', marginLeft: 8 },
  playBtn: { padding: 5, backgroundColor: '#f8f8f8', borderRadius: 18, marginLeft: 8, borderWidth: 1, borderColor: '#eee' },
  playBtnIcon: { fontSize: 12 },
  cardBody: { fontSize: 13, color: '#666', marginTop: 1, lineHeight: 18 },

  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 16 },

  // Modal Styles
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 999, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 20, padding: 30, width: '100%', alignItems: 'center', elevation: 10 },
  modalEmoji: { fontSize: 50, marginBottom: 15 },
  modalTitle: { fontSize: 22, fontWeight: '800', marginBottom: 5 },
  modalHint: { fontSize: 15, color: '#888', marginBottom: 25 },
  modalBtn: { width: '100%', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  modalBtnPrimary: { backgroundColor: '#E53935' },
  modalBtnTextPrimary: { color: '#fff', fontWeight: '700', fontSize: 16 },
  modalBtnText: { color: '#666', fontWeight: '600', fontSize: 16 },
});
