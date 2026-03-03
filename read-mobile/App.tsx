import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppNavigator from '@/navigation';
import { useAppStore } from '@/store';
import { getServerUrl, getDeviceId, getProfileToken, getProfileId, getProfileName } from '@/utils/storage';

export default function App() {
  const [ready, setReady] = useState(false);
  const store = useAppStore();

  useEffect(() => {
    restoreState();
  }, []);

  async function restoreState() {
    try {
      const [serverUrl, deviceId, profileToken, profileId, profileName] = await Promise.all([
        getServerUrl(),
        getDeviceId(),
        getProfileToken(),
        getProfileId(),
        getProfileName(),
      ]);

      if (serverUrl) store.setServerUrl(serverUrl);
      if (deviceId) store.setDeviceId(deviceId);

      if (profileId === 'guest') {
        store.setGuest();
      } else if (profileId && profileToken && profileName) {
        store.setProfile(profileId, profileName, profileToken);
      }
    } catch (err) {
      console.error('Failed to restore state:', err);
    } finally {
      setReady(true);
    }
  }

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size='large' color='#7c3aed' />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});
