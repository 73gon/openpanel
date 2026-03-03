import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';

import { useAppStore } from '@/store';
import {
  fetchProfiles,
  selectProfile,
  fetchGuestEnabled,
} from '@/api/client';
import {
  setProfileToken,
  setProfileId,
  setProfileName,
  clearAll,
} from '@/utils/storage';
import ProfileCard, { GuestCard } from '@/components/ProfileCard';
import type { Profile, RootStackParamList } from '@/models/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfilePicker'>;

export default function ProfilePickerScreen({ navigation }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [guestEnabled, setGuestEnabled] = useState(true);
  const store = useAppStore();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [profileRes, guest] = await Promise.all([
        fetchProfiles(),
        fetchGuestEnabled().catch(() => true),
      ]);
      setProfiles(profileRes.profiles);
      setGuestEnabled(guest);
    } catch (err) {
      Alert.alert('Error', 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectProfile(profile: Profile) {
    if (profile.has_pin) {
      promptPin(profile);
      return;
    }

    try {
      const res = await selectProfile(profile.id);
      await setProfileToken(res.token);
      await setProfileId(res.profile.id);
      await setProfileName(res.profile.name);
      store.setProfile(res.profile.id, res.profile.name, res.token);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch {
      Alert.alert('Error', 'Failed to select profile');
    }
  }

  function promptPin(profile: Profile) {
    Alert.prompt(
      'Enter PIN',
      `Enter PIN for ${profile.name}`,
      async (pin?: string) => {
        if (!pin) return;
        try {
          const res = await selectProfile(profile.id, pin);
          await setProfileToken(res.token);
          await setProfileId(res.profile.id);
          await setProfileName(res.profile.name);
          store.setProfile(res.profile.id, res.profile.name, res.token);
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        } catch {
          Alert.alert('Error', 'Incorrect PIN');
        }
      },
      'secure-text',
    );
  }

  function handleGuest() {
    store.setGuest();
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }

  async function handleDisconnect() {
    await clearAll();
    store.disconnect();
    navigation.reset({ index: 0, routes: [{ name: 'ServerConnect' }] });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7c3aed" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Who's reading?</Text>
        <Pressable onPress={handleDisconnect} style={styles.disconnectBtn}>
          <Icon name="log-out-outline" size={20} color="#888" />
          <Text style={styles.disconnectText}>Disconnect</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            isSelected={store.profileId === profile.id}
            onPress={() => handleSelectProfile(profile)}
          />
        ))}
        {guestEnabled && (
          <GuestCard
            isSelected={store.isGuest}
            onPress={handleGuest}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  disconnectText: {
    color: '#888',
    fontSize: 14,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignContent: 'center',
    padding: 8,
  },
});
