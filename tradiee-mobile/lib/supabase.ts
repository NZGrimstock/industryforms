import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

// Expo SecureStore adapter for Supabase auth persistence
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
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

// Mirror session to AsyncStorage so the background location task can authenticate.
// SecureStore is unavailable in background task contexts; AsyncStorage is not.
supabase.auth.onAuthStateChange(async (_event, session) => {
  try {
    if (session?.access_token) {
      await AsyncStorage.setItem('TRADIEE_SESSION', JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }))
    } else {
      await AsyncStorage.removeItem('TRADIEE_SESSION')
    }
  } catch {
    // Non-fatal — background task will just skip the DB write
  }
})
