import { create } from 'zustand';

export interface AppState {
  // Connection
  serverUrl: string | null;
  deviceId: string | null;

  // Profile
  profileId: string | null;
  profileName: string | null;
  profileToken: string | null;
  isGuest: boolean;

  // Admin
  adminToken: string | null;

  // Actions
  setServerUrl: (url: string) => void;
  setDeviceId: (id: string) => void;
  setProfile: (id: string, name: string, token: string) => void;
  setGuest: () => void;
  setAdminToken: (token: string) => void;
  clearProfile: () => void;
  disconnect: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  serverUrl: null,
  deviceId: null,
  profileId: null,
  profileName: null,
  profileToken: null,
  isGuest: false,
  adminToken: null,

  setServerUrl: (url) => set({ serverUrl: url }),
  setDeviceId: (id) => set({ deviceId: id }),

  setProfile: (id, name, token) =>
    set({
      profileId: id,
      profileName: name,
      profileToken: token,
      isGuest: false,
    }),

  setGuest: () =>
    set({
      profileId: 'guest',
      profileName: 'Guest',
      profileToken: null,
      isGuest: true,
    }),

  setAdminToken: (token) => set({ adminToken: token }),

  clearProfile: () =>
    set({
      profileId: null,
      profileName: null,
      profileToken: null,
      isGuest: false,
      adminToken: null,
    }),

  disconnect: () =>
    set({
      serverUrl: null,
      profileId: null,
      profileName: null,
      profileToken: null,
      isGuest: false,
      adminToken: null,
    }),
}));
