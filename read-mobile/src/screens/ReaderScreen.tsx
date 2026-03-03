import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
  useWindowDimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Slider from '@react-native-community/slider';
import Icon from 'react-native-vector-icons/Ionicons';
import FastImage from 'react-native-fast-image';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';

import { fetchBooks, fetchProgress, updateProgress, pageImageUrl, imageHeaders } from '@/api/client';
import type { Book, RootStackParamList } from '@/models/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Reader'>;

type ReadingMode = 'scroll' | 'single';
type ReadingDirection = 'ltr' | 'rtl';

export default function ReaderScreen({ route, navigation }: Props) {
  const { bookId, bookTitle, seriesId } = route.params;
  const { width, height } = useWindowDimensions();

  // State
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [mode, setMode] = useState<ReadingMode>('scroll');
  const [direction, setDirection] = useState<ReadingDirection>('ltr');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [currentBookIndex, setCurrentBookIndex] = useState(-1);

  const scrollRef = useRef<FlatList>(null);
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load book data ───

  useEffect(() => {
    loadBook();
    return () => {
      if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
    };
  }, [bookId]);

  async function loadBook() {
    setLoading(true);
    try {
      // Fetch book detail to get page count + series books for chapter navigation
      const [booksRes, savedProgress] = await Promise.all([fetchBooks(seriesId), fetchProgress(bookId)]);

      const sorted = booksRes.books.sort((a, b) => a.sort_order - b.sort_order);
      setAllBooks(sorted);
      const idx = sorted.findIndex((b) => b.id === bookId);
      setCurrentBookIndex(idx);

      const book = sorted.find((b) => b.id === bookId);
      if (book) setPageCount(book.page_count);

      // Restore progress
      if (savedProgress && !savedProgress.is_completed && savedProgress.page > 1) {
        setCurrentPage(savedProgress.page);
      } else {
        setCurrentPage(1);
      }

      // Prefetch first pages
      if (book) {
        const headers = imageHeaders();
        const urls = Array.from({ length: Math.min(5, book.page_count) }, (_, i) => ({
          uri: pageImageUrl(bookId, i + 1),
          headers,
        }));
        FastImage.preload(urls);
      }
    } catch (err) {
      console.error('Failed to load book:', err);
    } finally {
      setLoading(false);
    }
  }

  // ─── Progress saving (debounced) ───

  const saveProgress = useCallback(
    (page: number) => {
      if (progressSaveTimer.current) clearTimeout(progressSaveTimer.current);
      progressSaveTimer.current = setTimeout(async () => {
        const isCompleted = page >= pageCount;
        try {
          await updateProgress(bookId, page, isCompleted);
        } catch (err) {
          console.error('Failed to save progress:', err);
        }
      }, 300);
    },
    [bookId, pageCount],
  );

  // ─── Page change handler ───

  const handlePageChange = useCallback(
    (page: number) => {
      if (page < 1 || page > pageCount) return;
      setCurrentPage(page);
      saveProgress(page);

      // Prefetch neighbouring pages
      const headers = imageHeaders();
      const prefetchPages = [page - 1, page + 1, page + 2, page + 3].filter((p) => p >= 1 && p <= pageCount);
      FastImage.preload(
        prefetchPages.map((p) => ({
          uri: pageImageUrl(bookId, p),
          headers,
        })),
      );
    },
    [bookId, pageCount, saveProgress],
  );

  // ─── Chapter navigation ───

  const prevBook = currentBookIndex > 0 ? allBooks[currentBookIndex - 1] : null;
  const nextBook = currentBookIndex < allBooks.length - 1 ? allBooks[currentBookIndex + 1] : null;

  function navigateToBook(book: Book) {
    navigation.replace('Reader', {
      bookId: book.id,
      bookTitle: book.title,
      seriesId,
    });
  }

  // ─── Toggle overlay ───

  function toggleOverlay() {
    setOverlayVisible((v) => !v);
  }

  // ─── Pages array ───

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);

  // ─── Scroll mode: handle scroll position to track current page ───

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (mode !== 'scroll') return;
    const offsetY = event.nativeEvent.contentOffset.y;
    const pageHeight = height;
    const page = Math.floor(offsetY / pageHeight) + 1;
    if (page !== currentPage && page >= 1 && page <= pageCount) {
      handlePageChange(page);
    }
  }

  // ─── Scroll mode: scroll to page ───

  function scrollToPage(page: number) {
    scrollRef.current?.scrollToIndex({ index: page - 1, animated: false });
    handlePageChange(page);
  }

  // ─── Initial scroll to saved progress ───

  useEffect(() => {
    if (!loading && mode === 'scroll' && currentPage > 1) {
      setTimeout(() => {
        scrollRef.current?.scrollToIndex({
          index: currentPage - 1,
          animated: false,
        });
      }, 100);
    }
  }, [loading]);

  // ─── Single page: tap zones ───

  function handleSinglePageTap(x: number) {
    const third = width / 3;
    if (x < third) {
      // Left zone
      if (direction === 'rtl') {
        if (currentPage < pageCount) handlePageChange(currentPage + 1);
      } else {
        if (currentPage > 1) handlePageChange(currentPage - 1);
      }
    } else if (x > third * 2) {
      // Right zone
      if (direction === 'rtl') {
        if (currentPage > 1) handlePageChange(currentPage - 1);
      } else {
        if (currentPage < pageCount) handlePageChange(currentPage + 1);
      }
    } else {
      // Center zone
      toggleOverlay();
    }
  }

  // ─── Loading state ───

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar hidden />
        <ActivityIndicator size='large' color='#7c3aed' />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar hidden />

      {/* Content */}
      {mode === 'scroll' ? (
        <FlatList
          ref={scrollRef}
          data={pages}
          keyExtractor={(item) => item.toString()}
          renderItem={({ item: pageNum }) => (
            <Pressable onPress={toggleOverlay} style={{ height, width }}>
              <PageImage bookId={bookId} page={pageNum} width={width} height={height} />
            </Pressable>
          )}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: height,
            offset: height * index,
            index,
          })}
          initialScrollIndex={currentPage - 1}
          windowSize={5}
          maxToRenderPerBatch={3}
          removeClippedSubviews
        />
      ) : (
        <Pressable style={styles.singlePageContainer} onPress={(e) => handleSinglePageTap(e.nativeEvent.locationX)}>
          <PageImage bookId={bookId} page={currentPage} width={width} height={height} />
        </Pressable>
      )}

      {/* Overlay */}
      {overlayVisible && (
        <View style={StyleSheet.absoluteFill} pointerEvents='box-none'>
          {/* Top bar */}
          <SafeAreaView edges={['top']} style={styles.overlayTop}>
            <View style={styles.topBar}>
              <Pressable onPress={() => navigation.goBack()} style={styles.overlayBtn}>
                <Icon name='close' size={24} color='#fff' />
              </Pressable>
              <Text style={styles.topTitle} numberOfLines={1}>
                {bookTitle}
              </Text>
              <Pressable onPress={() => setSettingsVisible(!settingsVisible)} style={styles.overlayBtn}>
                <Icon name='settings-outline' size={22} color='#fff' />
              </Pressable>
            </View>
          </SafeAreaView>

          {/* Bottom bar */}
          <SafeAreaView edges={['bottom']} style={styles.overlayBottom}>
            <View style={styles.bottomBar}>
              {/* Chapter nav */}
              <View style={styles.chapterNav}>
                {prevBook ? (
                  <Pressable onPress={() => navigateToBook(prevBook)} style={styles.chapterBtn}>
                    <Icon name='chevron-back' size={16} color='#7c3aed' />
                    <Text style={styles.chapterBtnText}>Prev</Text>
                  </Pressable>
                ) : (
                  <View style={styles.chapterBtnPlaceholder} />
                )}

                <Text style={styles.pageLabel}>
                  {currentPage} / {pageCount}
                </Text>

                {nextBook ? (
                  <Pressable onPress={() => navigateToBook(nextBook)} style={styles.chapterBtn}>
                    <Text style={styles.chapterBtnText}>Next</Text>
                    <Icon name='chevron-forward' size={16} color='#7c3aed' />
                  </Pressable>
                ) : (
                  <View style={styles.chapterBtnPlaceholder} />
                )}
              </View>

              {/* Page slider */}
              <View style={styles.sliderRow}>
                <Text style={styles.sliderLabel}>1</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={pageCount}
                  step={1}
                  value={currentPage}
                  onSlidingComplete={(val) => {
                    const page = Math.round(val);
                    if (mode === 'scroll') {
                      scrollToPage(page);
                    } else {
                      handlePageChange(page);
                    }
                  }}
                  minimumTrackTintColor='#7c3aed'
                  maximumTrackTintColor='#444'
                  thumbTintColor='#7c3aed'
                />
                <Text style={styles.sliderLabel}>{pageCount}</Text>
              </View>
            </View>
          </SafeAreaView>

          {/* Settings sheet */}
          {settingsVisible && (
            <View style={styles.settingsSheet}>
              <Text style={styles.settingsTitle}>Reader Settings</Text>

              <View style={styles.settingsRow}>
                <Text style={styles.settingsLabel}>Mode</Text>
                <View style={styles.segmented}>
                  <Pressable style={[styles.segmentedBtn, mode === 'scroll' && styles.segmentedBtnActive]} onPress={() => setMode('scroll')}>
                    <Text style={[styles.segmentedText, mode === 'scroll' && styles.segmentedTextActive]}>Scroll</Text>
                  </Pressable>
                  <Pressable style={[styles.segmentedBtn, mode === 'single' && styles.segmentedBtnActive]} onPress={() => setMode('single')}>
                    <Text style={[styles.segmentedText, mode === 'single' && styles.segmentedTextActive]}>Single Page</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingsRow}>
                <Text style={styles.settingsLabel}>Direction</Text>
                <View style={styles.segmented}>
                  <Pressable style={[styles.segmentedBtn, direction === 'ltr' && styles.segmentedBtnActive]} onPress={() => setDirection('ltr')}>
                    <Text style={[styles.segmentedText, direction === 'ltr' && styles.segmentedTextActive]}>LTR →</Text>
                  </Pressable>
                  <Pressable style={[styles.segmentedBtn, direction === 'rtl' && styles.segmentedBtnActive]} onPress={() => setDirection('rtl')}>
                    <Text style={[styles.segmentedText, direction === 'rtl' && styles.segmentedTextActive]}>← RTL</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </GestureHandlerRootView>
  );
}

// ─── Page Image Component with pinch-to-zoom ───

interface PageImageProps {
  bookId: string;
  page: number;
  width: number;
  height: number;
}

function PageImage({ bookId, page, width: w, height: h }: PageImageProps) {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1.2) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = Math.min(scale.value, 5);
        scale.value = withTiming(Math.min(scale.value, 5));
      }
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      if (scale.value > 1.2) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.2) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  const uri = pageImageUrl(bookId, page);
  const headers = imageHeaders();

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ width: w, height: h }, animatedStyle]}>
        <FastImage
          source={{ uri, headers, priority: FastImage.priority.high }}
          style={{ width: w, height: h }}
          resizeMode={FastImage.resizeMode.contain}
          onLoadStart={() => setImageLoading(true)}
          onLoad={() => setImageLoading(false)}
          onError={() => {
            setImageLoading(false);
            setImageError(true);
          }}
        />
        {imageLoading && (
          <View style={[StyleSheet.absoluteFill, styles.pageLoader]}>
            <ActivityIndicator size='large' color='#7c3aed' />
          </View>
        )}
        {imageError && (
          <View style={[StyleSheet.absoluteFill, styles.pageLoader]}>
            <Icon name='alert-circle-outline' size={48} color='#666' />
            <Text style={styles.errorText}>Failed to load page</Text>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Styles ───

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
  singlePageContainer: {
    flex: 1,
  },
  // Overlay
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  overlayBtn: {
    padding: 8,
  },
  topTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBar: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  chapterNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chapterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderRadius: 8,
  },
  chapterBtnText: {
    color: '#7c3aed',
    fontSize: 14,
    fontWeight: '600',
  },
  chapterBtnPlaceholder: {
    width: 80,
  },
  pageLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderLabel: {
    color: '#888',
    fontSize: 12,
    width: 30,
    textAlign: 'center',
  },
  // Settings sheet
  settingsSheet: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  settingsTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  settingsRow: {
    marginBottom: 16,
  },
  settingsLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 8,
    overflow: 'hidden',
  },
  segmentedBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentedBtnActive: {
    backgroundColor: '#7c3aed',
  },
  segmentedText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  segmentedTextActive: {
    color: '#fff',
  },
  // Page loader
  pageLoader: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorText: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
});
