import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';

import { useAppStore } from '@/store';
import { healthCheckUrl } from '@/api/client';
import { setServerUrl as saveServerUrl, getDeviceId } from '@/utils/storage';
import type { RootStackParamList } from '@/models/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ServerConnect'>;

export default function ServerConnectScreen({ navigation }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const store = useAppStore();

  async function handleConnect() {
    let trimmed = url.trim();
    if (!trimmed) {
      setError('Please enter a server URL');
      return;
    }

    // Add protocol if missing
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `http://${trimmed}`;
    }

    setLoading(true);
    setError('');

    try {
      const ok = await healthCheckUrl(trimmed);
      if (!ok) {
        setError('Could not connect to server');
        return;
      }

      // Save and set
      await saveServerUrl(trimmed);
      const deviceId = await getDeviceId();
      store.setServerUrl(trimmed);
      store.setDeviceId(deviceId);

      navigation.reset({ index: 0, routes: [{ name: 'ProfilePicker' }] });
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}>
        <Icon name="book-outline" size={64} color="#7c3aed" />
        <Text style={styles.title}>OpenPanel</Text>
        <Text style={styles.subtitle}>Connect to your server</Text>

        <TextInput
          style={styles.input}
          placeholder="https://your-server.com"
          placeholderTextColor="#666"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={handleConnect}
        />

        {error !== '' && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
          onPress={handleConnect}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Connect</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 12,
  },
  subtitle: {
    color: '#888',
    fontSize: 16,
    marginTop: 4,
    marginBottom: 32,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    backgroundColor: '#111',
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 8,
  },
  button: {
    width: '100%',
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
