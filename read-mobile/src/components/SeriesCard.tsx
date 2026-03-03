import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import CachedImage from './CachedImage';
import { seriesThumbnailUrl, imageHeaders } from '@/api/client';
import type { Series } from '@/models/types';

interface SeriesCardProps {
  series: Series;
  onPress: () => void;
}

export default function SeriesCard({ series, onPress }: SeriesCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <CachedImage
        uri={seriesThumbnailUrl(series.id)}
        headers={imageHeaders()}
        style={styles.image}
        containerStyle={styles.imageContainer}
        blurBackground
        resizeMode="contain"
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {series.name}
        </Text>
        <Text style={styles.count}>
          {series.book_count} {series.book_count === 1 ? 'book' : 'books'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    margin: 6,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 0.7,
    borderRadius: 10,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  info: {
    padding: 8,
  },
  title: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  count: {
    color: '#888',
    fontSize: 11,
  },
});
