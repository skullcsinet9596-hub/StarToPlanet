# 🚀 ПОЛНАЯ ИНСТРУКЦИЯ ЗАГРУЗКИ НА RENDER

## 📋 Подготовка перед загрузкой

### 1. Проверьте файлы проекта
Убедитесь, что у вас есть все необходимые файлы:

```
star-to-planet-bot/
├── bot.js                 # Основной файл бота
├── db.js                  # Файл базы данных PostgreSQL
├── package.json           # Зависимости проекта
├── frontend/
│   ├── index.html        # Главная страница игры
│   ├── app.js            # Логика игры
│   └── style.css         # Стили
└── .env                   # Переменные окружения (если есть)
```

### 2. Проверьте package.json
Убедитесь, что ваш package.json выглядит так:

```json
{
  "name": "star-to-planet-bot",
  "version": "1.0.0",
  "type": "module",
  "main": "bot.js",
  "scripts": {
    "start": "node bot.js"
  },
  "dependencies": {
    "telegraf": "^4.15.3",
    "express": "^4.18.2",
    "dotenv": "^16.3.1",
    "pg": "^8.11.3"
  },
  "engines": {
    "node": "24.x"
  }
}
```

## 🔧 Шаг 1: Настройка базы данных Neon.tech

### 1.1 Создайте аккаунт Neon.tech
1. Перейдите на https://neon.tech
2. Зарегистрируйтесь (можно через GitHub)
3. Создайте новый проект:
   - Нажмите "New Project"
   - Выберите регион (ближайший к вам)
   - Назовите проект `star-to-planet-db`
   - Выберите PostgreSQL 16
   - Нажмите "Create Project"

### 1.2 Получите строку подключения
1. В проекте Neon найдите "Connection string"
2. Скопируйте строку подключения (выглядит так):
   ```
   postgresql://username:password@ep-xxx.us-east-1.aws.neon.tech/dbname?sslmode=require
   ```
3. **ВАЖНО:** Замените `sslmode=require` на `sslmode=verify-full`

## 🌐 Шаг 2: Настройка Telegram Bot

### 2.1 Создайте бота в Telegram
1. Найдите в Telegram `@BotFather`
2. Отправьте команду `/newbot`
3. Введите имя бота: `Star to Planet Game`
4. Введите username бота: `star_to_planet_bot` (или другой уникальный)
5. Сохраните **BOT_TOKEN** (выглядит как `1234567890:ABCDEF...`)

### 2.2 Настройте Web App
1. Отправьте `/mybots` в @BotFather
2. Выберите вашего бота
3. Настройте "Menu Button" -> "Web App"
4. Укажите URL (пока оставьте пустым, добавим после развертывания)

## 📤 Шаг 3: Загрузка на Render

### 3.1 Создайте аккаунт Render
1. Перейдите на https://render.com
2. Зарегистрируйтесь (рекомендуется через GitHub)
3. Подтвердите email

### 3.2 Создайте Web Service
1. В панели Render нажмите "New +"
2. Выберите "Web Service"
3. Подключите ваш GitHub репозиторий
4. **Если у вас нет GitHub репозитория:**
   - Создайте репозиторий на GitHub
   - Загрузите все файлы проекта туда

### 3.3 Настройка Web Service

#### Basic Settings:
- **Name**: `star-to-planet-bot`
- **Branch**: `main` (или ваша основная ветка)
- **Root Directory**: `.` (если файлы в корне)
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `node bot.js`

#### Environment Variables:
Нажмите "Add Environment Variable" и добавьте:

1. **BOT_TOKEN**:
   - Key: `BOT_TOKEN`
   - Value: ваш токен от @BotFather

2. **DATABASE_URL**:
   - Key: `DATABASE_URL`
   - Value: ваша строка подключения от Neon.tech

3. **NODE_ENV**:
   - Key: `NODE_ENV`
   - Value: `production`

#### Advanced Settings:
- **Instance Type**: `Free` (для начала)
- **Region**: выберите ближайший к вам
- **Auto-Deploy**: включите (для автоматического обновления)

### 3.4 Нажмите "Create Web Service"

## ⏱️ Шаг 4: Ожидание развертывания

1. Render начнет сборку (обычно 2-5 минут)
2. Вы можете отслеживать процесс в "Logs"
3. После успешной сборки вы увидите зеленый статус "Live"

## 🔗 Шаг 5: Получение URL и настройка

### 5.1 Скопируйте URL вашего сервиса
1. В панели Render найдите ваш Web Service
2. Скопируйте URL (выглядит так: `https://star-to-planet-bot.onrender.com`)

### 5.2 Настройте Web App в Telegram
1. Вернитесь в @BotFather
2. Отправьте `/mybots` → выберите бота → "Menu Button" → "Web App"
3. Введите URL: `https://star-to-planet-bot.onrender.com`
4. Нажмите "Save"

## 🧪 Шаг 6: Тестирование

### 6.1 Проверка сервера
1. Откройте в браузере: `https://star-to-planet-bot.onrender.com`
2. Вы должны увидеть страницу игры

### 6.2 Проверка API
1. Проверьте: `https://star-to-planet-bot.onrender.com/api/leaderboard`
2. Должен вернуться JSON с пустым массивом `[]`

### 6.3 Проверка бота
1. Найдите вашего бота в Telegram
2. Отправьте команду `/start`
3. Вы должны получить приветственное сообщение

### 6.4 Проверка игры
1. Нажмите кнопку "✨ ИГРАТЬ ✨"
2. Игра должна открыться
3. Попробуйте сделать несколько кликов
4. Обновите страницу - данные должны сохраниться

## 🐛 Частые проблемы и решения

### Проблема: "Bot token is invalid"
**Решение:** Проверьте BOT_TOKEN в Environment Variables на Render

### Проблема: "Database connection failed"
**Решение:** 
- Проверьте DATABASE_URL
- Убедитесь что Neon.tech проект активен
- Проверьте что строка подключения содержит `sslmode=verify-full`

### Проблема: "Cannot find module"
**Решение:** Проверьте package.json и переразверните

### Проблема: "Web App не открывается"
**Решение:** 
- Проверьте что сервер работает (откройте URL в браузере)
- Проверьте настройку Web App в @BotFather
- Убедитесь что URL правильный

### Проблема: "Данные не сохраняются"
**Решение:** Проверьте консоль браузера на ошибки при сохранении

## 🔄 Обновление проекта

Для обновления кода:
1. Сделайте изменения в файлах
2. Запушьте в GitHub репозиторий
3. Render автоматически обновится (если включен Auto-Deploy)

## 📊 Мониторинг

1. **Render Logs**: В панели Render → Web Service → Logs
2. **Telegram**: Проверяйте сообщения об ошибках
3. **Браузер**: Откройте DevTools → Console для ошибок фронтенда

## 🎯 Следующие шаги

После успешного развертывания:
1. Протестируйте все функции
2. Проверьте синхронизацию между устройствами
3. Добавьте новые фичи по плану

---

## 🆘 Поддержка

Если что-то не работает:
1. Проверьте логи на Render
2. Проверьте переменные окружения
3. Убедитесь что все файлы загружены
4. Попробуйте переразвернуть (Manual Deploy → Deploy Latest Commit)

**Удачи! 🚀**
