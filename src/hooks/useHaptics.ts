import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const isNative = Capacitor.isNativePlatform();

/** Light tap — for button presses, toggles */
export function hapticTap() {
  if (isNative) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

/** Medium impact — for completing items, drag drops */
export function hapticMedium() {
  if (isNative) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
}

/** Success notification — for completing all tasks, saving events */
export function hapticSuccess() {
  if (isNative) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}

/** Warning notification — for delete confirmations */
export function hapticWarning() {
  if (isNative) Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
}
