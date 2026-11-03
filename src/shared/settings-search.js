const aliases = {
  workspace: 'space name address icon название пространство адрес значок',
  appearance: 'theme density font sidebar dark light тема плотность шрифт меню тёмная светлая',
  language: 'locale english russian русский английский язык',
  datetime: 'timezone time zone calendar week часовой пояс время календарь неделя',
  'data-transfer': 'backup restore import export files резервная копия восстановление импорт экспорт',
  help: 'guide documentation инструкция справка документация',
  members: 'invite people participants приглашение люди участники',
  teams: 'team группа команда',
  projects: 'project archive default view проекты архив вид',
  permissions: 'access roles security права роли доступ',
  'notif-mentions': 'mentions team workspace упоминания команда пространство',
  'notif-assign': 'assignment comments overdue назначение комментарии просроченные',
  'notif-email': 'gmail email digest почта письмо дайджест',
  'notif-push': 'push browser notification device diagnostics браузер пуш уведомления устройство диагностика',
  profile: 'name avatar title email профиль имя аватар должность почта',
  security: 'session device sign in account сессии устройства вход аккаунт безопасность',
  preferences: 'personal spelling motion animation личные орфография движение анимация',
  shortcuts: 'keyboard hotkeys клавиатура горячие клавиши',
};
const normalize = value => String(value).toLocaleLowerCase().replaceAll('ё', 'е');
export function searchSettings(navigation, query, translate = value => value) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return navigation
    .flatMap(([group, items]) => items.map(([key, name, icon]) => ({ key, name, icon, group })))
    .filter(item => words.every(word => normalize([item.name, translate(item.name), translate(item.group), aliases[item.key] || ''].join(' ')).includes(word)))
    .slice(0, 18);
}
