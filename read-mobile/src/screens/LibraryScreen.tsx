import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';

import { fetchAllSeries } from '@/api/client';
import SeriesCard from '@/components/SeriesCard';
import type { Series, RootStackParamList } from '@/models/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

export default function LibraryScreen({ navigation }: any) {
  const [series, setSeries] = useState<Series[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();

  const numColumns = Math.max(2, Math.floor(width / 170));

  const loadSeries = useCallback(async () => {
    try {
      let page = 1;
      let allSeries: Series[] = [];
      while (true) {
        const res = await fetchAllSeries(page, 100);
        allSeries = [...allSeries, ...res.series];
        if (allSeries.length >= res.total) break;
        page++;
      }
      setSeries(allSeries);
    } catch (err) {
      console.error('Failed to load series:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadSeries();
  }, [loadSeries]);

  const filtered = search
    ? series.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()),
      )
    : series;

  function handleSeriesPress(item: Series) {
    navigation.navigate('SeriesDetail', {
      seriesId: item.id,
      seriesName: item.name,
    });
  }

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={18} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search library..."
          placeholderTextColor="#666"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search !== '' && (
          <Icon
            name="close-circle"
            size={18}
            color="#666"
            onPress={() => setSearch('')}
            style={styles.clearIcon}
          />
        )}
      </View>

      <FlatList
        data={filtered}
        key={numColumns}
        numColumns={numColumns}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ flex: 1 / numColumns }}>
            <SeriesCard
              series={item}
              onPress={() => handleSeriesPress(item)}
            />
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7c3aed"
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Icon name="library-outline" size={48} color="#444" />
              <Text style={styles.emptyText}>
                {search ? 'No matching series' : 'Library is empty'}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 16,
  },
  clearIcon: {
    marginLeft: 8,
    padding: 4,
  },
  list: {
    paddingHorizontal: 6,
    paddingBottom: 20,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    gap: 12,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
});
