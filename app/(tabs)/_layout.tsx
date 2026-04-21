// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function TabIcon({ symbol, size }: { symbol: string; size: number }) {
  return <Text style={{ fontSize: size - 4 }}>{symbol}</Text>;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  // Делаем отступ чуть меньше для баланса
  const androidBottomPadding = insets.bottom > 0 ? insets.bottom + 2 : 12;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#E53935',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#eee',
          // Оптимизируем высоту
          height: Platform.OS === 'ios' 
            ? 60 + insets.bottom 
            : 60 + (insets.bottom > 0 ? insets.bottom : 10),
          paddingBottom: Platform.OS === 'ios' 
            ? insets.bottom 
            : androidBottomPadding,
          paddingTop: 8,
          elevation: 4, 
        },
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Дневник',
          tabBarLabel: 'Дневник',
          tabBarIcon: ({ size }) => <TabIcon symbol="📓" size={size} />,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: 'Запись',
          tabBarLabel: 'Запись',
          tabBarIcon: ({ size }) => <TabIcon symbol="🎙" size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Настройки',
          tabBarLabel: 'Настройки',
          tabBarIcon: ({ size }) => <TabIcon symbol="⚙️" size={size} />,
        }}
      />
    </Tabs>
  );
}