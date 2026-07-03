// Register background location task at module scope (required by expo-task-manager)
import '@/lib/location/tracking'
import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { Stack, router } from 'expo-router'
import { PowerSyncContext } from '@powersync/react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import * as Linking from 'expo-linking'
import { db } from '@/lib/powersync/database'
import { SupabaseConnector } from '@/lib/powersync/connector'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')


Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

async function registerPushToken(userId: string) {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    let finalStatus = existing
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') return

    const token = (await Notifications.getExpoPushTokenAsync()).data
    await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId)
  } catch (e) {
    console.warn('[push]', e)
  }
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const notificationListener = useRef<Notifications.EventSubscription | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) router.replace('/login')
    })
    return () => subscription.unsubscribe()
  }, [])

  function handleDeepLink(url: string) {
    const { path } = Linking.parse(url)
    if (path?.startsWith('invite/')) {
      const token = path.replace('invite/', '')
      router.push(`/invite/${token}`)
    }
  }

  useEffect(() => {
    if (!session) return
    const connector = new SupabaseConnector()
    db.connect(connector).catch(console.error)

    // Register push token
    if (Platform.OS !== 'web') {
      registerPushToken(session.user.id)
    }

    // Handle notification taps — navigate to the relevant screen
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any
      if (data?.screen === 'job' && data?.jobId) router.push(`/jobs/${data.jobId}`)
      if (data?.screen === 'invite' && data?.token) router.push(`/invite/${data.token}`)
    })

    // Handle deep links (industryforms://invite/[token])
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink(url)
    })
    const linkingSub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url))

    return () => {
      db.disconnect().catch(console.error)
      responseListener.current?.remove()
      linkingSub.remove()
    }
  }, [session])

  if (session === undefined) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
        <PowerSyncContext.Provider value={db}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="signup" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="jobs/[id]" options={{ headerShown: true, title: 'Job', headerTintColor: '#f97316' }} />
            <Stack.Screen name="quotes/[id]" options={{ headerShown: true, title: 'Quote', headerTintColor: '#f97316' }} />
            <Stack.Screen name="invoices/[id]" options={{ headerShown: true, title: 'Invoice', headerTintColor: '#f97316' }} />
            <Stack.Screen name="customers/[id]" options={{ headerShown: true, title: 'Customer', headerTintColor: '#f97316' }} />
            <Stack.Screen name="customers/index" options={{ headerShown: true, title: 'Customers', headerTintColor: '#f97316' }} />
            <Stack.Screen name="invoices/index" options={{ headerShown: true, title: 'Invoices', headerTintColor: '#f97316' }} />
            <Stack.Screen name="timesheets" options={{ headerShown: true, title: 'Time Logs', headerTintColor: '#f97316' }} />
            <Stack.Screen name="job-map" options={{ headerShown: true, title: 'Job Map', headerTintColor: '#f97316' }} />
            <Stack.Screen name="invitations" options={{ headerShown: true, title: 'Invitations', headerTintColor: '#f97316' }} />
            <Stack.Screen name="invite/[token]" options={{ headerShown: true, title: 'Job Invitation', headerTintColor: '#f97316' }} />
            <Stack.Screen name="pay-now" options={{ headerShown: true, title: 'Pay Now', headerTintColor: '#f97316' }} />
            <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications', headerTintColor: '#f97316' }} />
          </Stack>
        </PowerSyncContext.Provider>
    </GestureHandlerRootView>
  )
}
