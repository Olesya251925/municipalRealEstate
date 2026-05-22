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

async function generateSuccessfulPaymentNotifications(pool) {
  try {
    const result = await pool.query(`
      INSERT INTO data_public."уведомления" 
      (lease_id, object_id, notification_type, message, creation_date, status_notification, name)
      SELECT 
        p.lease_id,
        d.object_id,
        'success' as notification_type,
        '✅ Уважаемый(ая) ' || a.name || '! Платеж по договору ' || COALESCE(d.contract_number, '№' || d.lease_id) || ' в размере ' || p.sum || ' ₽ успешно зачислен. Спасибо за своевременную оплату!' as message,
        NOW()::date as creation_date,
        'new' as status_notification,
        obj.name as name
      FROM data_public."платежи" p
      JOIN data_public."договор_аренды" d ON p.lease_id = d.lease_id
      JOIN data_public."справочник_объектов_недвижимости" obj ON d.object_id = obj.objectestate_id
      JOIN data_public."арендаторы" a ON d.rentor_id = a.rentor_id
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

async function generateAndSendNotifications(pool) {
  if (!pool) {
    console.error("❌ Ошибка: pool не передан");
    return { created: 0, sent: 0 };
  }

  try {
    // 1. Создаем уведомления о просрочках и напоминания
    const generateResult = await pool.query(`
      INSERT INTO data_public."уведомления" 
      (lease_id, object_id, notification_type, message, creation_date, status_notification, name)
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
            '🚨 КРИТИЧЕСКАЯ ПРОСРОЧКА! Долг по договору ' || COALESCE(d.contract_number, '№' || d.lease_id) || ' составляет ' || ROUND(EXTRACT(DAY FROM (NOW() - p.date_pay))) || ' дней. Сумма: ' || p.sum || ' ₽'
          WHEN EXTRACT(DAY FROM (NOW() - p.date_pay)) > 0 THEN 
            '🔴 Просрочка платежа по договору ' || COALESCE(d.contract_number, '№' || d.lease_id) || ' составляет ' || ROUND(EXTRACT(DAY FROM (NOW() - p.date_pay))) || ' дней. Сумма долга: ' || p.sum || ' ₽'
          WHEN EXTRACT(DAY FROM (p.date_pay - NOW())) = 0 THEN 
            '⚠️ СЕГОДНЯ последний день оплаты по договору ' || COALESCE(d.contract_number, '№' || d.lease_id) || '. Сумма: ' || p.sum || ' ₽'
          ELSE 
            '⏰ Напоминание: через ' || ROUND(EXTRACT(DAY FROM (p.date_pay - NOW()))) || ' дн. срок оплаты по договору ' || COALESCE(d.contract_number, '№' || d.lease_id) || '. Сумма: ' || p.sum || ' ₽'
        END as message,
        NOW()::date as creation_date,
        'new' as status_notification,
        obj.name as name
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

    await generateSuccessfulPaymentNotifications(pool);

    const notificationsResult = await pool.query(`
      SELECT n.*, a.email as renter_email
      FROM data_public."уведомления" n
      JOIN data_public."договор_аренды" d ON n.lease_id = d.lease_id
      JOIN data_public."арендаторы" a ON d.rentor_id = a.rentor_id
      WHERE n.status_notification = 'new'
      ORDER BY n.creation_date ASC
    `);

    const transporter = await getTransporter();
    let sentCount = 0;

    for (const notification of notificationsResult.rows) {
      try {
        const info = await transporter.sendMail({
          from: '"Муниципальная недвижимость" <noreply@ethereal.email>',
          to: notification.renter_email,
          subject: getSubject(notification.notification_type),
          text: notification.message,
        });

        if (!USE_REAL_EMAIL) {
          const previewUrl = nodemailer.getTestMessageUrl(info);
          console.log(
            `🔗 Письмо для ${notification.renter_email}: ${previewUrl}`,
          );
        } else {
          console.log(`Отправлено на ${notification.renter_email}`);
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
          `Ошибка отправки на ${notification.renter_email}:`,
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

function getSubject(type) {
  switch (type) {
    case "today":
      return "⚠️ СЕГОДНЯ срок оплаты";
    case "overdue":
      return "🔴 Просрочка арендного платежа";
    case "critical":
      return "🚨 КРИТИЧЕСКАЯ ПРОСРОЧКА";
    case "success":
      return "✅ Платеж успешно зачислен";
    default:
      return "⏰ Напоминание о платеже";
  }
}

function scheduleNotifications(pool) {
  if (!pool) {
    console.error("Ошибка: pool не передан в scheduleNotifications");
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
    `Планировщик уведомлений запущен. Следующая отправка: ${nextRun.toLocaleString("ru-RU")}`,
  );
}

module.exports = { generateAndSendNotifications, scheduleNotifications };
