import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { Profile } from '@/models/types';

interface ProfileCardProps {
  profile: Profile;
  isSelected: boolean;
  onPress: () => void;
}

const COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#d97706',
  '#dc2626', '#db2777', '#0891b2', '#4f46e5',
];

function getColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function ProfileCard({
  profile,
  isSelected,
  onPress,
}: ProfileCardProps) {
  const initial = profile.name.charAt(0).toUpperCase();
  const color = getColor(profile.name);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isSelected && styles.selected,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.avatar, { backgroundColor: color }]}>
        <Text style={styles.initial}>{initial}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {profile.name}
      </Text>
      {profile.has_pin && (
        <Icon name="lock-closed" size={12} color="#888" style={styles.lock} />
      )}
    </Pressable>
  );
}

interface GuestCardProps {
  isSelected: boolean;
  onPress: () => void;
}

export function GuestCard({ isSelected, onPress }: GuestCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.guestCard,
        isSelected && styles.selected,
        pressed && styles.pressed,
      ]}>
      <View style={styles.guestAvatar}>
        <Icon name="person-outline" size={28} color="#888" />
      </View>
      <Text style={styles.name}>Guest</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    width: 120,
    margin: 8,
  },
  guestCard: {
    borderStyle: 'dashed',
    borderColor: '#444',
  },
  selected: {
    borderColor: '#7c3aed',
    backgroundColor: '#1f1635',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  guestAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  initial: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  name: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  lock: {
    marginTop: 4,
  },
});
