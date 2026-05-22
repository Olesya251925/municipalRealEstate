const nodemailer = require("nodemailer");

const USE_REAL_EMAIL = false;

let testAccount = null;

async function getTransporter() {
  if (USE_REAL_EMAIL) {
    return nodemailer.createTransport({
      host: "smtp.mail.ru",
      port: 465,
      secure: true,
      auth: {
        user: "ваша_почта@mail.ru",
        pass: "ваш_пароль",
      },
    });
  }

  if (!testAccount) {
    testAccount = await nodemailer.createTestAccount();
    console.log("\n📧 ТЕСТОВЫЙ EMAIL АККАУНТ СОЗДАН:");
    console.log(`   Логин: ${testAccount.user}`);
    console.log(`   Пароль: ${testAccount.pass}`);
    console.log(`   Просмотр писем: ${testAccount.web}\n`);
  }

  return nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}

// ========== УВЕДОМЛЕНИЯ ОБ УСПЕШНЫХ ПЛАТЕЖАХ ==========
async function generateSuccessfulPaymentNotifications(pool) {
  try {
    const result = await pool.query(`
      INSERT INTO data_public."уведомления" 
      (lease_id, object_id, notification_type, message, creation_date, status_notification, name, days_relative)
      SELECT 
        p.lease_id,
        d.object_id,
        'success' as notification_type,
        'Платеж по договору ' || COALESCE(d.contract_number, '№' || d.lease_id) || ' в размере ' || p.sum || ' ₽ успешно зачислен' as message,
        NOW()::date as creation_date,
        'new' as status_notification,
        obj.name as name,
        0 as days_relative
      FROM data_public."платежи" p
      JOIN data_public."договор_аренды" d ON p.lease_id = d.lease_id
      JOIN data_public."справочник_объектов_недвижимости" obj ON d.object_id = obj.objectestate_id
      WHERE p.status_pay = 'Оплачен'
        AND p.zipdate >= NOW() - INTERVAL '1 day'
        AND NOT EXISTS (
          SELECT 1 FROM data_public."уведомления" u 
          WHERE u.lease_id = p.lease_id 
            AND u.notification_type = 'success'
            AND u.creation_date = CURRENT_DATE
        )
    `);
    console.log(
      `📝 Создано уведомлений об успешных платежах: ${result.rowCount}`,
    );
    return result.rowCount;
  } catch (error) {
    console.error("Ошибка создания уведомлений об успешных платежах:", error);
    return 0;
  }
}

// ========== ОСНОВНАЯ ФУНКЦИЯ ==========
async function generateAndSendNotifications(pool) {
  if (!pool) {
    console.error("❌ Ошибка: pool не передан");
    return { created: 0, sent: 0 };
  }

  try {
    // 1. Создаем уведомления о просрочках и напоминания
    const generateResult = await pool.query(`
      INSERT INTO data_public."уведомления" 
      (lease_id, object_id, notification_type, message, creation_date, status_notification, name, days_relative)
      SELECT 
        d.lease_id,
        d.object_id,
        CASE 
          WHEN EXTRACT(DAY FROM (NOW() - p.date_pay)) > 30 THEN 'critical'
          WHEN EXTRACT(DAY FROM (NOW() - p.date_pay)) > 0 THEN 'overdue'
          WHEN EXTRACT(DAY FROM (p.date_pay - NOW())) = 0 THEN 'today'
          WHEN EXTRACT(DAY FROM (p.date_pay - NOW())) <= 3 THEN 'upcoming'
        END as notification_type,
        CASE 
          WHEN EXTRACT(DAY FROM (NOW() - p.date_pay)) > 30 THEN 
            'КРИТИЧЕСКАЯ ПРОСРОЧКА! Долг по договору ' || COALESCE(d.contract_number, '№' || d.lease_id) || ' составляет ' || ROUND(EXTRACT(DAY FROM (NOW() - p.date_pay))) || ' дней. Сумма: ' || p.sum || ' ₽'
          WHEN EXTRACT(DAY FROM (NOW() - p.date_pay)) > 0 THEN 
            'Просрочка платежа по договору ' || COALESCE(d.contract_number, '№' || d.lease_id) || ' составляет ' || ROUND(EXTRACT(DAY FROM (NOW() - p.date_pay))) || ' дней. Сумма долга: ' || p.sum || ' ₽'
          WHEN EXTRACT(DAY FROM (p.date_pay - NOW())) = 0 THEN 
            'СЕГОДНЯ последний день оплаты по договору ' || COALESCE(d.contract_number, '№' || d.lease_id) || '. Сумма: ' || p.sum || ' ₽'
          ELSE 
            'Через ' || ROUND(EXTRACT(DAY FROM (p.date_pay - NOW()))) || ' дня(ей) срок оплаты по договору ' || COALESCE(d.contract_number, '№' || d.lease_id) || '. Сумма: ' || p.sum || ' ₽'
        END as message,
        NOW()::date as creation_date,
        'new' as status_notification,
        obj.name as name,
        CASE 
          WHEN EXTRACT(DAY FROM (NOW() - p.date_pay)) > 0 THEN ROUND(EXTRACT(DAY FROM (NOW() - p.date_pay)))
          ELSE ROUND(EXTRACT(DAY FROM (p.date_pay - NOW())))
        END as days_relative
      FROM data_public."платежи" p
      JOIN data_public."договор_аренды" d ON p.lease_id = d.lease_id
      JOIN data_public."справочник_объектов_недвижимости" obj ON d.object_id = obj.objectestate_id
      WHERE (p.status_pay = 'Просрочен' OR (p.status_pay = 'Ожидается' AND p.date_pay <= NOW() + INTERVAL '3 days'))
        AND NOT EXISTS (
          SELECT 1 FROM data_public."уведомления" u 
          WHERE u.lease_id = p.lease_id 
            AND u.creation_date = CURRENT_DATE
        )
    `);

    console.log(
      `📝 Создано уведомлений о просрочках/напоминаниях: ${generateResult.rowCount}`,
    );

    // 2. Создаем уведомления об успешных платежах
    await generateSuccessfulPaymentNotifications(pool);

    // 3. Получаем все неотправленные уведомления с дополнительными данными через JOIN
    const notificationsResult = await pool.query(`
      SELECT 
        n.*, 
        a.email as renter_email, 
        a.name as renter_name,
        d.contract_number,
        obj.cadastral_number,
        p.sum,
        p.date_pay as due_date
      FROM data_public."уведомления" n
      JOIN data_public."договор_аренды" d ON n.lease_id = d.lease_id
      JOIN data_public."арендаторы" a ON d.rentor_id = a.rentor_id
      JOIN data_public."платежи" p ON d.lease_id = p.lease_id
      JOIN data_public."справочник_объектов_недвижимости" obj ON d.object_id = obj.objectestate_id
      WHERE n.status_notification = 'new'
      ORDER BY n.creation_date ASC
    `);

    const transporter = await getTransporter();
    let sentCount = 0;

    for (const notification of notificationsResult.rows) {
      try {
        const htmlContent = buildBeautifulHtmlEmail(notification);
        const info = await transporter.sendMail({
          from: '"Муниципальная недвижимость" <noreply@ethereal.email>',
          to: notification.renter_email,
          subject: getSubject(
            notification.notification_type,
            notification.days_relative,
          ),
          html: htmlContent,
        });

        if (!USE_REAL_EMAIL) {
          const previewUrl = nodemailer.getTestMessageUrl(info);
        } else {
          console.log(`✅ Отправлено на ${notification.renter_email}`);
        }

        await pool.query(
          `UPDATE data_public."уведомления" 
           SET status_notification = 'sent', ziplastdate = NOW() 
           WHERE notification_id = $1`,
          [notification.notification_id],
        );
        sentCount++;
      } catch (emailError) {
        console.error(
          `❌ Ошибка отправки на ${notification.renter_email}:`,
          emailError.message,
        );
      }
    }

    console.log(`📧 Отправлено уведомлений: ${sentCount}`);
    return { created: generateResult.rowCount, sent: sentCount };
  } catch (error) {
    console.error("Ошибка в уведомлениях:", error);
    return { created: 0, sent: 0 };
  }
}

function buildBeautifulHtmlEmail(notification) {
  const type = notification.notification_type;
  let mainColor = "#3b82f6";
  let bgColor = "#eff6ff";
  let icon = "ℹ️";
  let title = "Уведомление";

  switch (type) {
    case "upcoming":
      mainColor = "#f59e0b";
      bgColor = "#fffbeb";
      icon = "⏰";
      title = "НАПОМИНАНИЕ О ПЛАТЕЖЕ";
      break;
    case "today":
      mainColor = "#f97316";
      bgColor = "#fff7ed";
      icon = "⚠️";
      title = "СРОК ОПЛАТЫ СЕГОДНЯ";
      break;
    case "overdue":
      mainColor = "#ef4444";
      bgColor = "#fef2f2";
      icon = "🔴";
      title = "ПРОСРОЧКА ПЛАТЕЖА";
      break;
    case "critical":
      mainColor = "#dc2626";
      bgColor = "#fef2f2";
      icon = "🚨";
      title = "КРИТИЧЕСКАЯ ПРОСРОЧКА";
      break;
    case "success":
      mainColor = "#10b981";
      bgColor = "#ecfdf5";
      icon = "✅";
      title = "ПЛАТЕЖ УСПЕШНО ЗАЧИСЛЕН";
      break;
  }

  const days = notification.days_relative;
  let daysBlock = "";
  if (days && type !== "success") {
    let daysText = "";
    if (type === "upcoming") daysText = `${days} ДНЯ(ЕЙ) ОСТАЛОСЬ`;
    else if (type === "overdue" || type === "critical")
      daysText = `ПРОСРОЧКА ${days} ДНЯ(ЕЙ)`;
    else if (type === "today") daysText = "СЕГОДНЯ ПОСЛЕДНИЙ ДЕНЬ";

    daysBlock = `
      <div style="background: ${mainColor}15; border-radius: 60px; padding: 16px 24px; margin: 16px 0; text-align: center; border: 1px solid ${mainColor}30;">
        <div style="font-size: 36px; font-weight: 800; color: ${mainColor}; letter-spacing: 2px;">${daysText}</div>
      </div>
    `;
  }

  const contractDisplay = notification.contract_number
    ? `Договор № ${notification.contract_number}`
    : `Договор № ${notification.lease_id}`;

  const cadastralDisplay = notification.cadastral_number || "не указан";
  const sumDisplay = notification.sum
    ? new Intl.NumberFormat("ru-RU").format(notification.sum) + " ₽"
    : "не указана";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
        .container { max-width: 560px; margin: 0 auto; background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 35px -10px rgba(0,0,0,0.1); }
        .header { background: ${mainColor}; padding: 32px 24px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 800; }
        .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px; }
        .content { padding: 32px 28px; }
        .badge { display: inline-block; background: ${mainColor}15; color: ${mainColor}; padding: 6px 14px; border-radius: 30px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
        .object-card { background: ${bgColor}; border-radius: 20px; padding: 20px; margin-bottom: 24px; border-left: 4px solid ${mainColor}; }
        .object-name { font-size: 18px; font-weight: 700; color: #1f2937; margin-bottom: 8px; }
        .object-detail { font-size: 13px; color: #6b7280; margin-top: 6px; }
        .message-box { background: ${bgColor}; border-radius: 20px; padding: 20px; margin: 24px 0; text-align: center; }
        .message-text { font-size: 16px; font-weight: 500; color: #1f2937; line-height: 1.5; }
        .info-table { background: #f9fafb; border-radius: 16px; padding: 16px; margin: 24px 0; }
        .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
        .info-row:last-child { border-bottom: none; }
        .info-label { font-weight: 600; color: #374151; }
        .info-value { color: #4b5563; font-weight: 500; }
        .footer { background: #f9fafb; padding: 20px 24px; text-align: center; border-top: 1px solid #e5e7eb; }
        .footer p { margin: 0; color: #9ca3af; font-size: 12px; }
        .button { display: inline-block; background: ${mainColor}; color: white; padding: 10px 20px; border-radius: 30px; text-decoration: none; font-size: 14px; font-weight: 500; margin-top: 8px; }
      </style>
    </head>
    <body style="margin: 0; padding: 20px;">
      <div class="container">
        <div class="header">
          <div style="font-size: 48px; margin-bottom: 8px;">${icon}</div>
          <h1>${title}</h1>
          <p>Муниципальная недвижимость Кемерово</p>
        </div>
        <div class="content">
          <div class="badge">${contractDisplay}</div>
          
          <div class="object-card">
            <div class="object-name">🏢 ${notification.name || "Объект недвижимости"}</div>
            <div class="object-detail">Кадастровый номер: ${cadastralDisplay}</div>
          </div>
          
          ${daysBlock}
          
          <div class="message-box">
            <div class="message-text">${notification.message}</div>
          </div>
          
          <div class="info-table">
            <div class="info-row">
              <span class="info-label">📅 Срок платежа:</span>
              <span class="info-value">${new Date(notification.due_date).toLocaleDateString("ru-RU")}</span>
            </div>
            <div class="info-row">
              <span class="info-label">💰 Сумма:</span>
              <span class="info-value">${sumDisplay}</span>
            </div>
          </div>
          
          <div style="text-align: center;">
            <div class="button" style="display: inline-block;">📊 Перейти в личный кабинет</div>
          </div>
        </div>
        <div class="footer">
          <p>Это автоматическое сообщение от системы управления муниципальной недвижимостью.</p>
          <p>© 2026 Администрация города Кемерово</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function getSubject(type, days) {
  switch (type) {
    case "today":
      return "⚠️ СРОК ОПЛАТЫ СЕГОДНЯ — требуется оплата";
    case "overdue":
      return `🔴 ПРОСРОЧКА ${days} ДНЯ(ЕЙ) — требуется оплата`;
    case "critical":
      return `🚨 КРИТИЧЕСКАЯ ПРОСРОЧКА ${days} ДНЯ(ЕЙ) — срочно оплатите!`;
    case "success":
      return "✅ Платеж успешно зачислен. Спасибо!";
    default:
      return `⏰ Напоминание: оплатите до ${new Date().toLocaleDateString("ru-RU")}`;
  }
}

function scheduleNotifications(pool) {
  if (!pool) {
    console.error("❌ Ошибка: pool не передан в scheduleNotifications");
    return;
  }
  generateAndSendNotifications(pool);
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(9, 0, 0, 0);
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  const timeToNext = nextRun - now;
  setTimeout(() => {
    generateAndSendNotifications(pool);
    setInterval(() => generateAndSendNotifications(pool), 24 * 60 * 60 * 1000);
  }, timeToNext);
  console.log(
    `🕐 Планировщик уведомлений запущен. Следующая отправка: ${nextRun.toLocaleString("ru-RU")}`,
  );
}

module.exports = { generateAndSendNotifications, scheduleNotifications };
