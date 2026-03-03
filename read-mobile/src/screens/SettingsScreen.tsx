import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';

import { useAppStore } from '@/store';
import {
  logout,
  adminStatus,
  adminUnlock,
  triggerScan,
  scanStatus,
} from '@/api/client';
import {
  clearProfile,
  clearAll,
  setAdminToken as saveAdminToken,
} from '@/utils/storage';

export default function SettingsScreen({ navigation }: any) {
  const store = useAppStore();
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  async function checkAdminStatus() {
    try {
      const status = await adminStatus();
      setAdminUnlocked(status.is_unlocked);
    } catch {}
  }

  async function handleSwitchProfile() {
    await logout();
    await clearProfile();
    store.clearProfile();
    navigation.reset({ index: 0, routes: [{ name: 'ProfilePicker' }] });
  }

  async function handleDisconnect() {
    await logout();
    await clearAll();
    store.disconnect();
    navigation.reset({ index: 0, routes: [{ name: 'ServerConnect' }] });
  }

  function handleAdminUnlock() {
    Alert.prompt(
      'Admin Access',
      'Enter admin password',
      async (password?: string) => {
        if (!password) return;
        try {
          const res = await adminUnlock(password);
          store.setAdminToken(res.token);
          await saveAdminToken(res.token);
          setAdminUnlocked(true);
        } catch {
          Alert.alert('Error', 'Incorrect password');
        }
      },
      'secure-text',
    );
  }

  async function handleScan() {
    if (scanning) return;
    setScanning(true);
    setScanProgress(null);

    try {
      await triggerScan();

      // Poll scan status
      const interval = setInterval(async () => {
        try {
          const status = await scanStatus();
          setScanProgress(status.progress ?? null);
          if (!status.scanning) {
            clearInterval(interval);
            setScanning(false);
            setScanProgress(null);
          }
        } catch {
          clearInterval(interval);
          setScanning(false);
        }
      }, 1000);
    } catch {
      setScanning(false);
      Alert.alert('Error', 'Failed to trigger scan');
    }
  }

  return (
    <ScrollView style={styles.container}>
      <SafeAreaView edges={['bottom']}>
        {/* Profile section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Icon name="person" size={20} color="#7c3aed" />
              <Text style={styles.rowText}>
                {store.isGuest ? 'Guest' : store.profileName ?? 'Unknown'}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.rowBtn,
                pressed && styles.rowBtnPressed,
              ]}
              onPress={handleSwitchProfile}>
              <Icon name="swap-horizontal" size={18} color="#888" />
              <Text style={styles.rowBtnText}>Switch Profile</Text>
            </Pressable>
          </View>
        </View>

        {/* Admin section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin</Text>
          <View style={styles.card}>
            {adminUnlocked ? (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.rowBtn,
                    pressed && styles.rowBtnPressed,
                    scanning && styles.rowBtnDisabled,
                  ]}
                  onPress={handleScan}
                  disabled={scanning}>
                  {scanning ? (
                    <View style={styles.scanRow}>
                      <ActivityIndicator size="small" color="#7c3aed" />
                      <Text style={styles.rowBtnText}>
                        Scanning{scanProgress != null ? ` (${Math.round(scanProgress * 100)}%)` : '...'}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Icon name="refresh" size={18} color="#7c3aed" />
                      <Text style={styles.rowBtnText}>Scan Library</Text>
                    </>
                  )}
                </Pressable>
              </>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.rowBtn,
                  pressed && styles.rowBtnPressed,
                ]}
                onPress={handleAdminUnlock}>
                <Icon name="lock-closed" size={18} color="#888" />
                <Text style={styles.rowBtnText}>Unlock Admin</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Server section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Server</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Icon name="server-outline" size={20} color="#888" />
              <Text style={styles.rowText} numberOfLines={1}>
                {store.serverUrl}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.rowBtn,
                styles.dangerBtn,
                pressed && styles.rowBtnPressed,
              ]}
              onPress={handleDisconnect}>
              <Icon name="log-out-outline" size={18} color="#ef4444" />
              <Text style={[styles.rowBtnText, styles.dangerText]}>
                Disconnect
              </Text>
            </Pressable>
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Icon name="book-outline" size={20} color="#7c3aed" />
              <Text style={styles.rowText}>OpenPanel Mobile</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  rowText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBtnPressed: {
    backgroundColor: '#222',
  },
  rowBtnDisabled: {
    opacity: 0.5,
  },
  rowBtnText: {
    color: '#fff',
    fontSize: 16,
  },
  dangerBtn: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  dangerText: {
    color: '#ef4444',
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
