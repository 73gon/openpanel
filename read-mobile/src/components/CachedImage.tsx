import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  ImageStyle,
  ViewStyle,
} from 'react-native';
import FastImage, { Source } from 'react-native-fast-image';

interface CachedImageProps {
  uri: string;
  headers?: Record<string, string>;
  style?: ImageStyle;
  containerStyle?: ViewStyle;
  blurBackground?: boolean;
  resizeMode?: 'cover' | 'contain' | 'stretch';
}

export default function CachedImage({
  uri,
  headers,
  style,
  containerStyle,
  blurBackground = false,
  resizeMode = 'cover',
}: CachedImageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const source: Source = {
    uri,
    headers,
    priority: FastImage.priority.normal,
    cache: FastImage.cacheControl.immutable,
  };

  const rnResizeMode =
    resizeMode === 'cover'
      ? FastImage.resizeMode.cover
      : resizeMode === 'contain'
        ? FastImage.resizeMode.contain
        : FastImage.resizeMode.stretch;

  return (
    <View style={[styles.container, containerStyle]}>
      {blurBackground && !error && (
        <FastImage
          source={source}
          style={StyleSheet.absoluteFill}
          resizeMode={FastImage.resizeMode.cover}
          blurRadius={20}
        />
      )}
      {blurBackground && !error && (
        <View style={[StyleSheet.absoluteFill, styles.overlay]} />
      )}
      <FastImage
        source={source}
        style={[styles.image, style]}
        resizeMode={rnResizeMode}
        onLoadStart={() => setLoading(true)}
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
      />
      {loading && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="small" color="#7c3aed" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
