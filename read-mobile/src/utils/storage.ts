import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  SERVER_URL: 'openpanel_server_url',
  DEVICE_ID: 'openpanel_device_id',
  PROFILE_TOKEN: 'openpanel_profile_token',
  PROFILE_ID: 'openpanel_profile_id',
  PROFILE_NAME: 'openpanel_profile_name',
  ADMIN_TOKEN: 'openpanel_admin_token',
} as const;

export async function getServerUrl(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.SERVER_URL);
}

export async function setServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.SERVER_URL, url);
}

export async function clearServerUrl(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.SERVER_URL);
}

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(KEYS.DEVICE_ID);
  if (!id) {
    id = generateUUID();
    await AsyncStorage.setItem(KEYS.DEVICE_ID, id);
  }
  return id;
}

export async function getProfileToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.PROFILE_TOKEN);
}

export async function setProfileToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROFILE_TOKEN, token);
}

export async function getProfileId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.PROFILE_ID);
}

export async function setProfileId(id: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROFILE_ID, id);
}

export async function getProfileName(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.PROFILE_NAME);
}

export async function setProfileName(name: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.PROFILE_NAME, name);
}

export async function getAdminToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.ADMIN_TOKEN);
}

export async function setAdminToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.ADMIN_TOKEN, token);
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.multiRemove([
    KEYS.PROFILE_TOKEN,
    KEYS.PROFILE_ID,
    KEYS.PROFILE_NAME,
    KEYS.ADMIN_TOKEN,
  ]);
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
