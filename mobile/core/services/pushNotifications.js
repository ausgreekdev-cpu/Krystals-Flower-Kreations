import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function registerPushToken(apiBase, token) {
  const res = await fetch(`${apiBase}/api/mobile/push-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ token: await getExpoPushToken(), platform: Platform.OS }),
  });
  return res.json();
}

async function getExpoPushToken() {
  const perms = await Notifications.getPermissionsAsync();
  if (!perms.granted) await Notifications.requestPermissionsAsync();
  const t = await Notifications.getExpoPushTokenAsync();
  return t.data;
}