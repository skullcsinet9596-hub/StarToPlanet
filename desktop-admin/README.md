# StarToPlanet Desktop Admin

Desktop-приложение админки на Electron для работы с текущими backend endpoint'ами `/api/admin/*`.

## 1) Установка

Из корня проекта:

```bash
npm --prefix desktop-admin install
```

## 2) Запуск (Windows)

```bash
npm run desktop-admin:start
```

или напрямую:

```bash
npm --prefix desktop-admin run start
```

## 3) Первичная настройка внутри приложения

1. Введите `BASE_URL` (например, `https://startoplanet.onrender.com`)
2. Введите `ADMIN_TOKEN`
3. Введите `ADMIN_TELEGRAM_ID`
4. Нажмите `Сохранить`
5. Нажмите `Проверить доступ`

## 4) Что умеет MVP

- Поиск игрока по Telegram ID и редактирование полей:
  - `coins`
  - `level`
  - `has_moon`
  - `has_earth`
  - `has_sun`
- Просмотр referral-дерева
- Просмотр платежей
- Чтение/обновление экономики (JSON patch)

## 5) Сборка .exe (NSIS)

```bash
npm run desktop-admin:build
```

Результат сборки появится в `desktop-admin/dist`.

## 6) Smoke test

1. Сохранить credentials и выполнить `Проверить доступ`
2. Вкладка `Игрок`: загрузить ID, изменить `coins`, нажать `Применить изменения`
3. Вкладка `Referrals`: загрузить дерево по тому же ID
4. Вкладка `Payments`: загрузить список
5. Вкладка `Economy`: прочитать конфиг, поменять тестовое значение, сохранить

## 7) Negative test

- Неверный `ADMIN_TOKEN` -> ошибка `401`
- Неверный `ADMIN_TELEGRAM_ID` -> ошибка `403`
- Неверный `BASE_URL`/недоступный сервер -> сетевое сообщение об ошибке
- Пустой Telegram ID игрока -> локальная валидация в UI
