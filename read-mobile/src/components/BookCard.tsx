import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import CachedImage from './CachedImage';
import { bookThumbnailUrl, imageHeaders } from '@/api/client';
import type { Book, ReadingProgress } from '@/models/types';

interface BookCardProps {
  book: Book;
  progress?: ReadingProgress;
  onPress: () => void;
}

export default function BookCard({ book, progress, onPress }: BookCardProps) {
  const percentage = progress
    ? Math.round((progress.page / book.page_count) * 100)
    : 0;
  const isCompleted = progress?.is_completed ?? false;
  const hasProgress = percentage > 0 || isCompleted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.imageContainer}>
        <CachedImage
          uri={bookThumbnailUrl(book.id)}
          headers={imageHeaders()}
          style={styles.image}
          containerStyle={styles.imageWrapper}
          blurBackground
          resizeMode="contain"
        />
        {/* Progress bar */}
        {hasProgress && (
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${isCompleted ? 100 : percentage}%`,
                  backgroundColor: isCompleted ? '#22c55e' : '#7c3aed',
                },
              ]}
            />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.pages}>
          {book.page_count} pages
          {hasProgress && ` · ${isCompleted ? 'Done' : `${percentage}%`}`}
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
    position: 'relative',
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  progressBarBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressBarFill: {
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
  pages: {
    color: '#888',
    fontSize: 11,
  },
});
