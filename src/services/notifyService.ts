// Notificações locais. No iPhone só funcionam com o app instalado na Tela de Início (iOS 16.4+).

export const notificationsSupported = () =>
  typeof window !== "undefined" && "Notification" in window;

export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === "granted";
  } catch {
    return false;
  }
}

export async function showLocalNotification(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== "granted")
    return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, {
        body,
        icon: "/icon.svg",
        badge: "/icon.svg",
      });
      return;
    }
    new Notification(title, { body });
  } catch {
    // ignora: notificação é um extra, o alerta dentro do app sempre aparece
  }
}
