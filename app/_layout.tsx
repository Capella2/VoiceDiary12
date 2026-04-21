// app/_layout.tsx
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { initDatabase } from '../services/database';

// Prevent splash screen from hiding automatically
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    async function prepare() {
      try {
        console.log('[App] Starting initialization...');
        // Initialize DB
        initDatabase();
        console.log('[App] Database initialized successfully.');
        
        if (isMounted) {
          setAppIsReady(true);
          console.log('[App] Initialization finished. Hiding splash screen...');
          await SplashScreen.hideAsync().catch(() => {});
        }
      } catch (e) {
        console.error('[App] Initialization Error:', e);
        if (isMounted) setAppIsReady(true); // Still try to show UI
      }
    }

    prepare();
    return () => { isMounted = false; };
  }, []);

  if (!appIsReady) {
    return null; // Keep splash screen visible
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="entry/[id]"
          options={{ title: 'Запись', headerShown: true, headerBackTitle: 'Назад' }}
        />
      </Stack>
    </>
  );
}