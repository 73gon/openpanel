import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';

import {
  fetchBooks,
  fetchBatchProgress,
  seriesThumbnailUrl,
  imageHeaders,
} from '@/api/client';
import BookCard from '@/components/BookCard';
import CachedImage from '@/components/CachedImage';
import type {
  Book,
  ReadingProgress,
  RootStackParamList,
} from '@/models/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SeriesDetail'>;

export default function SeriesDetailScreen({ route, navigation }: Props) {
  const { seriesId, seriesName } = route.params;
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);
  const [sortAsc, setSortAsc] = useState(true);
  const { width } = useWindowDimensions();

  const numColumns = Math.max(2, Math.floor(width / 170));

  const loadBooks = useCallback(async () => {
    try {
      const res = await fetchBooks(seriesId);
      const sorted = res.books.sort((a, b) => a.sort_order - b.sort_order);
      setBooks(sorted);

      // Fetch batch progress
      if (sorted.length > 0) {
        const ids = sorted.map((b) => b.id);
        const progressRes = await fetchBatchProgress(ids);
        setProgress(progressRes.progress);
      }
    } catch (err) {
      console.error('Failed to load books:', err);
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  // Re-fetch when coming back from reader
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (!loading) loadBooks();
    });
    return unsub;
  }, [navigation, loading, loadBooks]);

  const sortedBooks = sortAsc
    ? [...books]
    : [...books].sort((a, b) => b.sort_order - a.sort_order);

  // Find continue reading book (first non-completed in sort order)
  const continueBook = books.find((b) => {
    const p = progress[b.id];
    return !p || !p.is_completed;
  });

  function handleBookPress(book: Book) {
    navigation.navigate('Reader', {
      bookId: book.id,
      bookTitle: book.title,
      seriesId,
    });
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={sortedBooks}
      key={numColumns}
      numColumns={numColumns}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={{ flex: 1 / numColumns }}>
          <BookCard
            book={item}
            progress={progress[item.id]}
            onPress={() => handleBookPress(item)}
          />
        </View>
      )}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          {/* Cover + info */}
          <View style={styles.headerRow}>
            <CachedImage
              uri={seriesThumbnailUrl(seriesId)}
              headers={imageHeaders()}
              containerStyle={styles.headerCover}
              resizeMode="cover"
            />
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>{seriesName}</Text>
              <Text style={styles.headerCount}>
                {books.length} {books.length === 1 ? 'book' : 'books'}
              </Text>
            </View>
          </View>

          {/* Continue reading button */}
          {continueBook && (
            <Pressable
              style={({ pressed }) => [
                styles.continueBtn,
                pressed && styles.continueBtnPressed,
              ]}
              onPress={() => handleBookPress(continueBook)}>
              <Icon name="play" size={16} color="#fff" />
              <Text style={styles.continueBtnText}>
                Continue Reading
              </Text>
            </Pressable>
          )}

          {/* Sort toggle */}
          <Pressable
            style={styles.sortBtn}
            onPress={() => setSortAsc(!sortAsc)}>
            <Icon
              name={sortAsc ? 'arrow-up' : 'arrow-down'}
              size={16}
              color="#888"
            />
            <Text style={styles.sortText}>
              Sort: {sortAsc ? 'Ascending' : 'Descending'}
            </Text>
          </Pressable>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  headerCover: {
    width: 100,
    height: 140,
    borderRadius: 8,
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  headerCount: {
    color: '#888',
    fontSize: 14,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 12,
  },
  continueBtnPressed: {
    opacity: 0.8,
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  sortText: {
    color: '#888',
    fontSize: 14,
  },
  list: {
    paddingHorizontal: 6,
    paddingBottom: 20,
  },
});
