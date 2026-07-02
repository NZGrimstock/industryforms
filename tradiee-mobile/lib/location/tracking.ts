import * as TaskManager from 'expo-task-manager'
import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

export const LOCATION_TASK = 'TRADIEE_LOCATION_TRACKING'

const SPEED_START_MS   = 15 / 3.6   // 15 km/h — start a trip
const SPEED_STOP_MS    =  4 / 3.6   //  4 km/h — considered stopped
const STOP_DURATION_MS = 5 * 60 * 1000  // 5 min stationary → end trip (avoids traffic lights)

const STORAGE_KEY     = 'TRADIEE_ACTIVE_TRIP'
const SESSION_KEY     = 'TRADIEE_SESSION'          // mirrored by supabase.ts for BG task access
export const TRIP_FOLLOWUP_KEY = 'TRADIEE_TRIP_FOLLOWUP'  // consumed by timesheets tab

type TripState = {
  tripId: string
  startLat: number
  startLng: number
  startTime: string
  lastLat: number
  lastLng: number
  lastMovingAt: string
  distanceKm: number
}

export type TripFollowup = {
  tripId: string
  startTime: string
  endTime: string
  distanceKm: number
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

async function getState(): Promise<TripState | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

async function setState(state: TripState | null) {
  if (state) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  else await AsyncStorage.removeItem(STORAGE_KEY)
}

async function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  // Session is mirrored here by supabase.ts; SecureStore is unavailable in BG tasks
  const stored = await AsyncStorage.getItem(SESSION_KEY)
  const session = stored ? JSON.parse(stored) : null
  const client = createClient(url, key, { auth: { persistSession: false } })
  if (session?.access_token) {
    await client.auth.setSession(session)
  }
  return client
}

async function endTrip(state: TripState, endLat: number, endLng: number) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const finalDistance = Math.round(
    (state.distanceKm + haversineKm(state.lastLat, state.lastLng, endLat, endLng)) * 100
  ) / 100
  const endTime = new Date().toISOString()

  await supabase.from('travel_logs').insert({
    id:          state.tripId,
    company_id:  profile?.company_id,
    profile_id:  user.id,
    started_at:  state.startTime,
    ended_at:    endTime,
    start_lat:   state.startLat,
    start_lng:   state.startLng,
    end_lat:     endLat,
    end_lng:     endLng,
    distance_km: finalDistance,
    is_auto:     true,
  })

  // Signal the timesheets tab to prompt the user to start a job timer
  const followup: TripFollowup = {
    tripId:      state.tripId,
    startTime:   state.startTime,
    endTime,
    distanceKm:  finalDistance,
  }
  await AsyncStorage.setItem(TRIP_FOLLOWUP_KEY, JSON.stringify(followup))
}

// Must be defined at module scope — called before any component mounts
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error) { console.error('[tracking]', error); return }

  const locations: Location.LocationObject[] = data?.locations ?? []
  if (!locations.length) return

  const loc = locations[locations.length - 1]
  const { latitude: lat, longitude: lng, speed } = loc.coords
  const speedMs = speed ?? 0
  const now = new Date().toISOString()

  const state = await getState()

  if (speedMs >= SPEED_START_MS) {
    if (!state) {
      await setState({
        tripId:       uuid(),
        startLat:     lat,
        startLng:     lng,
        startTime:    now,
        lastLat:      lat,
        lastLng:      lng,
        lastMovingAt: now,
        distanceKm:   0,
      })
    } else {
      const added = haversineKm(state.lastLat, state.lastLng, lat, lng)
      await setState({ ...state, lastLat: lat, lastLng: lng, lastMovingAt: now, distanceKm: state.distanceKm + added })
    }
  } else if (speedMs < SPEED_STOP_MS && state) {
    const stoppedMs = Date.now() - new Date(state.lastMovingAt).getTime()
    if (stoppedMs >= STOP_DURATION_MS) {
      await endTrip(state, lat, lng)
      await setState(null)
    }
  }
})

// ── Public API ──────────────────────────────────────────────────────────────

export async function requestPermissions(): Promise<boolean> {
  const { status: fg } = await Location.requestForegroundPermissionsAsync()
  if (fg !== 'granted') return false
  const { status: bg } = await Location.requestBackgroundPermissionsAsync()
  return bg === 'granted'
}

export async function startTracking() {
  const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
  if (already) return
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,         // update every 50 m
    timeInterval: 30_000,         // or every 30 s
    foregroundService: {
      notificationTitle: 'IndustryForms',
      notificationBody:  'Auto-tracking travel for your logbook',
      notificationColor: '#f97316',
    },
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
  })
}

export async function stopTracking() {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
  if (!running) return
  const state = await getState()
  if (state) {
    const loc = await Location.getLastKnownPositionAsync()
    if (loc) await endTrip(state, loc.coords.latitude, loc.coords.longitude)
    await setState(null)
  }
  await Location.stopLocationUpdatesAsync(LOCATION_TASK)
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
}
