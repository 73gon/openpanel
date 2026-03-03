import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';

import { useAppStore } from '@/store';
import type { RootStackParamList, MainTabParamList } from '@/models/types';

import ServerConnectScreen from '@/screens/ServerConnectScreen';
import ProfilePickerScreen from '@/screens/ProfilePickerScreen';
import LibraryScreen from '@/screens/LibraryScreen';
import SeriesDetailScreen from '@/screens/SeriesDetailScreen';
import ReaderScreen from '@/screens/ReaderScreen';
import SettingsScreen from '@/screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#7c3aed',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: { backgroundColor: '#111', borderTopColor: '#222' },
        headerStyle: { backgroundColor: '#111' },
        headerTintColor: '#fff',
      }}>
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="library-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const serverUrl = useAppStore((s) => s.serverUrl);
  const profileId = useAppStore((s) => s.profileId);

  const initialRoute: keyof RootStackParamList = !serverUrl
    ? 'ServerConnect'
    : !profileId
      ? 'ProfilePicker'
      : 'Main';

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: '#7c3aed',
          background: '#000',
          card: '#111',
          text: '#fff',
          border: '#222',
          notification: '#7c3aed',
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '900' },
        },
      }}>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: { backgroundColor: '#111' },
          headerTintColor: '#fff',
          animation: 'fade',
        }}>
        <Stack.Screen
          name="ServerConnect"
          component={ServerConnectScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ProfilePicker"
          component={ProfilePickerScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SeriesDetail"
          component={SeriesDetailScreen}
          options={({ route }) => ({
            title: route.params.seriesName,
            headerBackTitle: 'Library',
          })}
        />
        <Stack.Screen
          name="Reader"
          component={ReaderScreen}
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
