# Используем официальный образ nginx на Alpine Linux (очень маленький размер)
FROM nginx:alpine

# Удаляем стандартную страницу приветствия nginx
RUN rm -rf /usr/share/nginx/html/*

# Копируем все файлы из текущей папки в папку, откуда nginx раздает сайты
COPY . /usr/share/nginx/html/

# Открываем порт 80 для веб-трафика
EXPOSE 80

# Запускаем nginx в фоновом режиме
CMD ["nginx", "-g", "daemon off;"]