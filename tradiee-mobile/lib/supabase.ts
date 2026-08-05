import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

// Expo SecureStore adapter for Supabase auth persistence.
//
// keychainAccessible: AFTER_FIRST_UNLOCK is load-bearing, not a nicety. iOS
// Keychain items default to WHEN_UNLOCKED, which is unreadable while the phone
// is locked — and the background location task (lib/location/tracking.ts) runs
// exactly then. That failure is what previously justified mirroring the session
// into AsyncStorage; AFTER_FIRST_UNLOCK removes the need, because the item
// becomes readable from the device's first unlock after boot onward while still
// being encrypted at rest and excluded from unencrypted backups.
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// One-shot cleanup for installs that ran the build which mirrored the access +
// refresh token into AsyncStorage under this key. AsyncStorage is a plain
// unencrypted SQLite file, readable from a device backup or on a rooted/
// jailbroken phone, so a long-lived refresh token sitting there was a standing
// account-takeover primitive. Removing the writer does not remove what is
// already on disk — this does. Safe to delete once no shipped build predates
// the SecureStore-only change.
AsyncStorage.removeItem('TRADIEE_SESSION').catch(() => {})
