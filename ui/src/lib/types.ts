// Shared type definitions used across the application

export interface AuthUser {
  id: string
  name: string
  is_admin: boolean
}

export interface SectionVisibility {
  continueReading: boolean
  recentlyAdded: boolean
  recentlyUpdated: boolean
}

export const defaultSections: SectionVisibility = {
  continueReading: true,
  recentlyAdded: true,
  recentlyUpdated: true,
}
