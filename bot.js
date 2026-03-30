// Команда /start (первый заход)
bot.start(async (ctx) => {
    const user = ctx.from;
    const messageText = ctx.message.text;
    
    // Парсим реферальный ID
    let referrerId = null;
    const parts = messageText.split(' ');
    if (parts.length > 1 && parts[1].startsWith('ref_')) {
        referrerId = parseInt(parts[1].replace('ref_', ''));
        if (referrerId === user.id) referrerId = null;
    }
    
    // Проверяем, существует ли пользователь в базе
    const existingUser = await db.getUser(user.id);
    
    const webAppUrl = `${APP_URL}?startapp=ref_${user.id}`;
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.id}`;
    
    // Если пользователь НЕ зарегистрирован — показываем только кнопку регистрации
    if (!existingUser) {
        let message = `⭐ <b>Star to Planet</b> ⭐\n\n`;
        message += `Привет, ${user.first_name}!\n\n`;
        message += `Добро пожаловать в игру, где звезда превращается в планету!\n\n`;
        
        if (referrerId) {
            message += `🎉 Вас кто-то пригласил! После регистрации вы получите <b>+500 монет</b> бонусом!\n\n`;
        }
        
        message += `<b>Чтобы начать играть, нажми на кнопку ниже!</b>`;
        
        ctx.replyWithHTML(message, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Зарегистрироваться', callback_data: `register_${referrerId || ''}` }]
                ]
            }
        });
        return;
    }
    
    // Если пользователь уже зарегистрирован — показываем полное меню
    let message = `⭐ <b>Star to Planet</b> ⭐\n\n`;
    message += `С возвращением, ${user.first_name}!\n\n`;
    message += `<b>Как играть:</b>\n`;
    message += `• Нажимай на звезду, чтобы зарабатывать монеты\n`;
    message += `• Покупай улучшения для увеличения дохода\n`;
    message += `• Приглашай друзей и получай бонусы!\n\n`;
    
    message += `<b>💰 Реферальная программа:</b>\n`;
    message += `• За каждого приглашенного друга: <b>1000 монет</b>\n`;
    message += `• Друг получает: <b>500 монет</b>\n\n`;
    
    message += `<b>Ваша ссылка:</b>\n`;
    message += `<code>${referralLink}</code>\n\n`;
    
    message += `<i>Нажми на кнопку ниже, чтобы начать!</i>`;
    
    ctx.replyWithHTML(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 Открыть игру', web_app: { url: webAppUrl } }],
                [{ text: '👥 Пригласить друга', url: referralLink }]
            ]
        }
    });
});

// Обработчик кнопки регистрации
bot.action(/^register_(.*)$/, async (ctx) => {
    const user = ctx.from;
    const referrerId = ctx.match[1] ? parseInt(ctx.match[1]) : null;
    
    // Создаем пользователя в базе данных
    const newUser = await db.createUser(
        user.id,
        user.username || user.first_name,
        user.first_name,
        referrerId
    );
    
    const webAppUrl = `${APP_URL}?startapp=ref_${user.id}`;
    const referralLink = `https://t.me/${ctx.botInfo.username}?start=ref_${user.id}`;
    
    let message = `⭐ <b>Star to Planet</b> ⭐\n\n`;
    message += `✅ <b>Регистрация прошла успешно!</b>\n\n`;
    message += `Привет, ${user.first_name}!\n\n`;
    
    if (referrerId) {
        message += `🎉 Вас кто-то пригласил! Вы получили <b>+500 монет</b> бонусом!\n\n`;
    }
    
    message += `<b>Как играть:</b>\n`;
    message += `• Нажимай на звезду, чтобы зарабатывать монеты\n`;
    message += `• Покупай улучшения для увеличения дохода\n`;
    message += `• Приглашай друзей и получай бонусы!\n\n`;
    
    message += `<b>💰 Реферальная программа:</b>\n`;
    message += `• За каждого приглашенного друга: <b>1000 монет</b>\n`;
    message += `• Друг получает: <b>500 монет</b>\n\n`;
    
    message += `<b>Ваша ссылка:</b>\n`;
    message += `<code>${referralLink}</code>\n\n`;
    
    message += `<i>Нажми на кнопку ниже, чтобы начать!</i>`;
    
    await ctx.replyWithHTML(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 Открыть игру', web_app: { url: webAppUrl } }],
                [{ text: '👥 Пригласить друга', url: referralLink }]
            ]
        }
    });
    
    await ctx.answerCbQuery('🎉 Регистрация завершена!');
});