import crypto from 'node:crypto';
import { deliverEmailNotifications } from './email-notifications.js';
import { deliverPushNotifications } from './push-subscriptions.js';

// Explicit diagnostics only: never enqueue jobs or alter the user's saved preferences.
export async function sendOwnTestNotification(data, member, channel, options = {}) {
  if (!['email', 'push'].includes(channel)) throw Object.assign(new Error('Invalid notification channel.'), { statusCode: 400 });
  if (!member?.id || !member.email) throw Object.assign(new Error('Your profile is not linked to a workspace member.'), { statusCode: 403 });
  const locale = member.locale === 'en' ? 'en' : 'ru';
  const at = new Date().toISOString();
  const notification = {
    id: `test-${crypto.randomUUID()}`,
    type: 'system',
    recipient: member.id,
    text: locale === 'ru' ? 'Тестовое уведомление Smena Manager' : 'Smena Manager test notification',
    snippet: locale === 'ru' ? `Проверка доставки, запрошенная вами. ${at}` : `Delivery check requested by you. ${at}`,
  };
  const isolated = {
    ...data,
    members: [{ ...member, locale }],
    notifPrefs: { [member.id]: { email_security: true, push_security: true } },
  };
  const send = options[channel] || (channel === 'email' ? deliverEmailNotifications : deliverPushNotifications);
  const result = await send(isolated, [notification], { locale });
  return { channel, at, recipient: member.email, ...result };
}
