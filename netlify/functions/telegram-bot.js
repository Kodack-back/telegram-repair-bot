// netlify/functions/telegram-bot.js

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// Временное хранилище состояний пользователей
const userStates = new Map();

// Состояния бота
const STATES = {
  WAITING_PROBLEM: 'waiting_problem',
  WAITING_ADDRESS: 'waiting_address', 
  WAITING_DATETIME: 'waiting_datetime',
  WAITING_PHONE: 'waiting_phone'
};

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const message = body.message;

    if (!message) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    const chatId = message.chat.id;
    const text = message.text;
    const userName = message.from.first_name || 'пользователь';

    // Обработка команды /start
    if (text === '/start') {
      userStates.set(chatId, { 
        state: STATES.WAITING_PROBLEM,
        data: {},
        userName: userName
      });
      
      await sendMessage(chatId, 'Здравствуйте! Опишите пожалуйста проблему 🔧');
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // Обработка кнопки "Назад"
    if (text === '⬅️ Назад') {
      await handleBackButton(chatId);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // Получаем состояние пользователя
    const userState = userStates.get(chatId);
    
    if (!userState) {
      await sendMessage(chatId, 'Нажмите /start чтобы начать 😊');
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // Обработка состояний
    switch (userState.state) {
      case STATES.WAITING_PROBLEM:
        await handleProblemInput(chatId, text, userState);
        break;
        
      case STATES.WAITING_ADDRESS:
        await handleAddressInput(chatId, text, userState);
        break;
        
      case STATES.WAITING_DATETIME:
        await handleDateTimeInput(chatId, text, userState);
        break;
        
      case STATES.WAITING_PHONE:
        await handlePhoneInput(chatId, text, userState);
        break;
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

// Обработка ввода описания проблемы
async function handleProblemInput(chatId, text, userState) {
  if (text.length < 10) {
    await sendMessage(chatId, 'Пожалуйста, опишите проблему более подробно (минимум 10 символов) 📝');
    return;
  }

  userState.data.problem = text;
  userState.state = STATES.WAITING_ADDRESS;
  userStates.set(chatId, userState);

  await sendMessage(chatId, 'Укажите пожалуйста адрес где можно забрать технику 📍', true);
}

// Обработка ввода адреса
async function handleAddressInput(chatId, text, userState) {
  if (text.length < 5) {
    await sendMessage(chatId, 'Пожалуйста, укажите полный адрес 🏠', true);
    return;
  }

  userState.data.address = text;
  userState.state = STATES.WAITING_DATETIME;
  userStates.set(chatId, userState);

  await sendMessage(chatId, 'Укажите число, время для приезда специалиста\n\nПример: 25.06.2025 14:30 ⏰', true);
}

// Обработка ввода даты и времени
async function handleDateTimeInput(chatId, text, userState) {
  if (!isValidDateTime(text)) {
    await sendMessage(chatId, 'Неверный формат даты и времени ❌\n\nИспользуйте формат: ДД.ММ.ГГГГ ЧЧ:ММ\nПример: 25.06.2025 14:30', true);
    return;
  }

  userState.data.datetime = text;
  userState.state = STATES.WAITING_PHONE;
  userStates.set(chatId, userState);

  await sendMessage(chatId, 'Укажите мобильный телефон для связи 📱\n\nПример: +7 123 456 78 90', true);
}

// Обработка ввода телефона
async function handlePhoneInput(chatId, text, userState) {
  if (!isValidPhone(text)) {
    await sendMessage(chatId, 'Неверный формат телефона ❌\n\nПример: +7 123 456 78 90\nили: 8 123 456 78 90', true);
    return;
  }

  userState.data.phone = text;

  // Отправляем подтверждение пользователю
  await sendMessage(chatId, 'Спасибо! В ближайшее время свяжется специалист для подтверждения ✅');

  // Отправляем заявку администратору
  await sendRequestToAdmin(userState);

  // Очищаем состояние пользователя
  userStates.delete(chatId);
}

// Обработка кнопки "Назад"
async function handleBackButton(chatId) {
  const userState = userStates.get(chatId);
  
  if (!userState) {
    await sendMessage(chatId, 'Нажмите /start чтобы начать 😊');
    return;
  }

  switch (userState.state) {
    case STATES.WAITING_PROBLEM:
      await sendMessage(chatId, 'Вы в начале. Опишите проблему 🔧');
      break;
      
    case STATES.WAITING_ADDRESS:
      userState.state = STATES.WAITING_PROBLEM;
      userStates.set(chatId, userState);
      await sendMessage(chatId, 'Опишите пожалуйста проблему 🔧');
      break;
      
    case STATES.WAITING_DATETIME:
      userState.state = STATES.WAITING_ADDRESS;
      userStates.set(chatId, userState);
      await sendMessage(chatId, 'Укажите пожалуйста адрес где можно забрать технику 📍', true);
      break;
      
    case STATES.WAITING_PHONE:
      userState.state = STATES.WAITING_DATETIME;
      userStates.set(chatId, userState);
      await sendMessage(chatId, 'Укажите число, время для приезда специалиста\n\nПример: 25.06.2025 14:30 ⏰', true);
      break;
  }
}

// Отправка заявки администратору
async function sendRequestToAdmin(userState) {
  const message = `🔧 НОВАЯ ЗАЯВКА\n\n` +
    `👤 От: ${userState.userName}\n\n` +
    `📝 Описание проблемы:\n${userState.data.problem}\n\n` +
    `📍 Адрес:\n${userState.data.address}\n\n` +
    `⏰ Время:\n${userState.data.datetime}\n\n` +
    `📱 Телефон:\n${userState.data.phone}`;

  await sendMessage(ADMIN_CHAT_ID, message);
}

// Функция отправки сообщения
async function sendMessage(chatId, text, showBackButton = false) {
  const url = `${TELEGRAM_API}/sendMessage`;
  
  let keyboard = null;
  if (showBackButton) {
    keyboard = {
      keyboard: [['⬅️ Назад']],
      resize_keyboard: true,
      one_time_keyboard: false
    };
  } else {
    keyboard = { remove_keyboard: true };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      reply_markup: keyboard
    })
  });

  return response.json();
}

// Валидация даты и времени
function isValidDateTime(dateTimeStr) {
  const regex = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/;
  const match = dateTimeStr.match(regex);
  
  if (!match) return false;
  
  const [, day, month, year, hour, minute] = match;
  const date = new Date(year, month - 1, day, hour, minute);
  
  return date.getDate() == day && 
         date.getMonth() == month - 1 && 
         date.getFullYear() == year &&
         hour >= 0 && hour <= 23 &&
         minute >= 0 && minute <= 59;
}

// Валидация телефона
function isValidPhone(phone) {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  const regex = /^(\+7|8|7)[\d]{10}$/;
  return regex.test(cleaned);
}
