// Thin wrapper so call sites don't each need a try/catch — haptics silently
// no-op on devices/platforms without a vibration motor (e.g. web, some Android).
import * as Haptics from 'expo-haptics'

export function tap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
}

export function success() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}

export function warn() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
}
