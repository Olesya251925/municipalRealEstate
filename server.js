const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const fontkit = require("fontkit");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "src")));

const contractsDir = path.join(__dirname, "contracts");
if (!fs.existsSync(contractsDir)) {
  fs.mkdirSync(contractsDir);
}
app.use("/contracts", express.static(contractsDir));

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "immovables",
  password: "251925",
  port: 5433,
});

app.get("/api/coordinates", async (req, res) => {
  try {
    const query = `
      SELECT 
        obj.width, 
        obj.length, 
        obj.name, 
        obj.cadastral_number, 
        obj.address,
        obj.status_id,
        obj.objectestate_id,
        s.clsname,
        s.clspaint
      FROM data_public."справочник_объектов_недвижимости" obj
      LEFT JOIN data_public."статус" s ON obj.status_id = s.status_id
      WHERE obj.width IS NOT NULL AND obj.length IS NOT NULL
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Ошибка:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/contracts/:objectId", async (req, res) => {
  try {
    const { objectId } = req.params;
    const query = `
      SELECT 
        lease_id,
        contract_number,
        date_start,
        date_end,
        date_pay,
        rent,
        status_contract,
        rented_area,
        name
      FROM data_public."договор_аренды"
      WHERE object_id = $1
      ORDER BY date_start DESC
    `;
    const result = await pool.query(query, [objectId]);
    res.json(result.rows);
  } catch (error) {
    console.error("Ошибка:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/payments/:leaseId", async (req, res) => {
  try {
    const { leaseId } = req.params;
    const query = `
      SELECT 
        pay_id,
        sum,
        date_pay,
        status_pay
      FROM data_public."платежи"
      WHERE lease_id = $1
      ORDER BY date_pay DESC
    `;
    const result = await pool.query(query, [leaseId]);
    res.json(result.rows);
  } catch (error) {
    console.error("Ошибка:", error);
    res.status(500).json({ error: error.message });
  }
});

function formatDate(date) {
  if (!date) return "Не указана";
  return new Date(date).toLocaleDateString("ru-RU");
}

function formatSum(sum) {
  return new Intl.NumberFormat("ru-RU").format(sum) + " руб.";
}

app.get("/api/download-contract/:leaseId", async (req, res) => {
  try {
    const { leaseId } = req.params;

    const contractQuery = `
  SELECT 
    d.*,
    o.name as object_name,
    o.address,
    o.cadastral_number,
    r.name as renter_name
  FROM data_public."договор_аренды" d
  LEFT JOIN data_public."справочник_объектов_недвижимости" o ON d.object_id = o.objectestate_id
  LEFT JOIN data_public."арендаторы" r ON d.rentor_id = r.rentor_id
  WHERE d.lease_id = $1
`;
    const contractResult = await pool.query(contractQuery, [leaseId]);

    if (contractResult.rows.length === 0) {
      return res.status(404).json({ error: "Договор не найден" });
    }

    const contract = contractResult.rows[0];

    const paymentsQuery = `
      SELECT * FROM data_public."платежи" 
      WHERE lease_id = $1 
      ORDER BY date_pay DESC
    `;
    const paymentsResult = await pool.query(paymentsQuery, [leaseId]);
    const payments = paymentsResult.rows;

    res.setHeader("Content-Type", "application/pdf");
    const fileName = `contract_${leaseId}.pdf`;
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      bufferPages: true,
    });

    doc.registerFont("DejaVuSans", "fonts/DejaVuSans.ttf");
    doc.registerFont("DejaVuSans-Bold", "fonts/DejaVuSans.ttf");

    doc.pipe(res);

    doc
      .font("DejaVuSans-Bold")
      .fontSize(20)
      .fillColor("#1E3A8A")
      .text("ДОГОВОР АРЕНДЫ", { align: "center" })
      .moveDown(0.5);

    doc
      .font("DejaVuSans")
      .fontSize(16)
      .fillColor("#333333")
      .text(`№ ${contract.contract_number || "б/н"}`, { align: "center" })
      .moveDown(1);

    doc
      .strokeColor("#1E3A8A")
      .lineWidth(2)
      .moveTo(50, doc.y)
      .lineTo(550, doc.y)
      .stroke()
      .moveDown(1);

    doc
      .font("DejaVuSans")
      .fontSize(10)
      .fillColor("#666666")
      .text(`Дата формирования: ${new Date().toLocaleDateString("ru-RU")}`, {
        align: "right",
      })
      .moveDown(2);

    doc
      .font("DejaVuSans-Bold")
      .fontSize(14)
      .fillColor("#1E3A8A")
      .text("1. Информация об объекте недвижимости")
      .moveDown(0.5);

    doc
      .font("DejaVuSans")
      .fontSize(11)
      .fillColor("#333333")
      .text(`Название объекта: ${contract.object_name || "Не указано"}`)
      .text(`Кадастровый номер: ${contract.cadastral_number || "Не указан"}`)
      .text(`Адрес: ${contract.address || "Не указан"}`)
      .moveDown(1);

    doc
      .font("DejaVuSans-Bold")
      .fontSize(14)
      .fillColor("#1E3A8A")
      .text("2. Условия договора аренды")
      .moveDown(0.5);

    doc
      .font("DejaVuSans")
      .fontSize(11)
      .fillColor("#333333")
      .text(`Номер договора: ${contract.contract_number || "Не указан"}`)
      .text(
        `Срок действия: ${formatDate(contract.date_start)} - ${formatDate(contract.date_end)}`,
      )
      .text(`Арендуемая площадь: ${contract.rented_area || 0} м²`)
      .text(`Ежемесячный платеж: ${formatSum(contract.rent)}`)
      .text(`Дата оплаты: ${formatDate(contract.date_pay)}`)
      .text(`Статус договора: ${contract.status_contract || "Не указан"}`)
      .moveDown(1);

    if (payments.length > 0) {
      doc
        .font("DejaVuSans-Bold")
        .fontSize(14)
        .fillColor("#1E3A8A")
        .text("3. История платежей")
        .moveDown(0.5);

      let y = doc.y;

      doc.font("DejaVuSans-Bold").fontSize(10).fillColor("#FFFFFF");

      doc.rect(50, y - 5, 500, 20).fill("#1E3A8A");

      doc
        .fillColor("#FFFFFF")
        .text("Дата платежа", 60, y)
        .text("Сумма", 200, y)
        .text("Статус", 350, y);

      y += 20;

      payments.slice(0, 10).forEach((payment, index) => {
        if (index % 2 === 0) {
          doc.rect(50, y - 5, 500, 20).fill("#F5F5F5");
        }

        doc
          .font("DejaVuSans")
          .fontSize(10)
          .fillColor("#333333")
          .text(formatDate(payment.date_pay), 60, y)
          .text(formatSum(payment.sum), 200, y)
          .text(payment.status_pay || "Не указан", 350, y);

        y += 20;
      });

      doc.y = y + 10;
    }

    doc.moveDown(2);

    doc
      .font("DejaVuSans")
      .fontSize(11)
      .fillColor("#333333")
      .text("Арендатор:", 50, doc.y)
      .moveDown(1)
      .text(`${contract.renter_name || "Не указан"}`, 50, doc.y)
      .moveDown(1);

    doc
      .font("DejaVuSans")
      .fontSize(10)
      .fillColor("#666666")
      .text("(подпись)", 50, doc.y, { align: "left" })
      .moveDown(1);

    doc
      .font("DejaVuSans")
      .fontSize(10)
      .fillColor("#666666")
      .text(
        `Дата подписания: ${new Date().toLocaleDateString("ru-RU")}`,
        50,
        doc.y,
      );

    let sealX = 360;
    let sealY = doc.y - 70;

    doc.save();

    doc
      .circle(sealX + 60, sealY + 50, 65)
      .lineWidth(2)
      .strokeColor("#1E3A8A")
      .stroke();

    doc
      .circle(sealX + 60, sealY + 50, 55)
      .lineWidth(1)
      .strokeColor("#1E3A8A")
      .stroke();

    doc
      .fontSize(10)
      .fillColor("#1E3A8A")
      .text("ПОДПИСАНО", sealX + 15, sealY + 30, {
        align: "center",
        width: 90,
      });

    doc
      .fontSize(10)
      .fillColor("#1E3A8A")
      .text("ЭЛЕКТРОННОЙ", sealX + 15, sealY + 45, {
        align: "center",
        width: 90,
      });

    doc
      .fontSize(10)
      .fillColor("#1E3A8A")
      .text("ПОДПИСЬЮ", sealX + 15, sealY + 60, {
        align: "center",
        width: 90,
      });

    doc
      .fontSize(10)
      .fillColor("#1E3A8A")
      .text("✓", sealX + 65, sealY + 78, { align: "center" });

    doc.restore();

    doc.end();
  } catch (error) {
    console.error("Ошибка генерации PDF:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========== АНАЛИТИКА ==========

// Доходность по районам
app.get("/api/analytics/districts", async (req, res) => {
  try {
    const query = `
      WITH district_payments AS (
        SELECT 
          CASE 
            WHEN obj.address LIKE '%Рудничный%' THEN 'Рудничный'
            WHEN obj.address LIKE '%Центральный%' THEN 'Центральный'
            WHEN obj.address LIKE '%Ленинский%' THEN 'Ленинский'
            WHEN obj.address LIKE '%Кировский%' THEN 'Кировский'
            WHEN obj.address LIKE '%Заводский%' THEN 'Заводский'
            ELSE 'Другие'
          END as district,
          p.sum
        FROM data_public."справочник_объектов_недвижимости" obj
        LEFT JOIN data_public."договор_аренды" d ON obj.objectestate_id = d.object_id
        LEFT JOIN data_public."платежи" p ON d.lease_id = p.lease_id
        WHERE p.status_pay = 'Оплачен'
          AND p.date_pay >= NOW() - INTERVAL '6 months'
      )
      SELECT 
        district,
        COALESCE(SUM(sum), 0) as total_income
      FROM district_payments
      WHERE district IS NOT NULL
      GROUP BY district
      ORDER BY total_income DESC
    `;
    const result = await pool.query(query);

    if (result.rows.length === 0) {
      const fallbackQuery = `
        WITH district_payments AS (
          SELECT 
            CASE 
              WHEN obj.address LIKE '%Рудничный%' THEN 'Рудничный'
              WHEN obj.address LIKE '%Центральный%' THEN 'Центральный'
              WHEN obj.address LIKE '%Ленинский%' THEN 'Ленинский'
              WHEN obj.address LIKE '%Кировский%' THEN 'Кировский'
              WHEN obj.address LIKE '%Заводский%' THEN 'Заводский'
              ELSE 'Другие'
            END as district,
            p.sum
          FROM data_public."справочник_объектов_недвижимости" obj
          LEFT JOIN data_public."договор_аренды" d ON obj.objectestate_id = d.object_id
          LEFT JOIN data_public."платежи" p ON d.lease_id = p.lease_id
          WHERE p.status_pay = 'Оплачен'
        )
        SELECT 
          district,
          COALESCE(SUM(sum), 0) as total_income
        FROM district_payments
        WHERE district IS NOT NULL
        GROUP BY district
        ORDER BY total_income DESC
      `;
      const fallbackResult = await pool.query(fallbackQuery);
      return res.json(fallbackResult.rows);
    }

    res.json(result.rows);
  } catch (error) {
    console.error("Ошибка аналитики по районам:", error);
    res.status(500).json({ error: error.message });
  }
});

// Топ-10 объектов по доходу
app.get("/api/analytics/top-objects", async (req, res) => {
  try {
    const query = `
      SELECT 
        obj.name,
        COALESCE(SUM(p.sum), 0) as total_income
      FROM data_public."справочник_объектов_недвижимости" obj
      LEFT JOIN data_public."договор_аренды" d ON obj.objectestate_id = d.object_id
      LEFT JOIN data_public."платежи" p ON d.lease_id = p.lease_id
        AND p.status_pay = 'Оплачен'
        AND p.date_pay >= NOW() - INTERVAL '12 months'
      GROUP BY obj.objectestate_id, obj.name
      HAVING SUM(p.sum) > 0
      ORDER BY total_income DESC
      LIMIT 10
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Ошибка топа объектов:", error);
    res.status(500).json({ error: error.message });
  }
});

// Просрочки
app.get("/api/analytics/overdue", async (req, res) => {
  try {
    const query = `
      SELECT 
        COALESCE(obj.name, 'Неизвестный объект') as object_name,
        CASE 
          WHEN obj.address LIKE '%Рудничный%' THEN 'Рудничный'
          WHEN obj.address LIKE '%Центральный%' THEN 'Центральный'
          WHEN obj.address LIKE '%Ленинский%' THEN 'Ленинский'
          WHEN obj.address LIKE '%Кировский%' THEN 'Кировский'
          WHEN obj.address LIKE '%Заводский%' THEN 'Заводский'
          ELSE 'Другие'
        END as district,
        p.sum as overdue_sum,
        EXTRACT(DAY FROM NOW() - p.date_pay) as days_overdue
      FROM data_public."платежи" p
      LEFT JOIN data_public."договор_аренды" d ON p.lease_id = d.lease_id
      LEFT JOIN data_public."справочник_объектов_недвижимости" obj ON d.object_id = obj.objectestate_id
      WHERE p.status_pay = 'Просрочен'
        AND p.date_pay >= NOW() - INTERVAL '180 days'
        AND d.lease_id IS NOT NULL
      ORDER BY days_overdue DESC
      LIMIT 10
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Ошибка просрочек:", error);
    res.status(500).json({ error: error.message });
  }
});

// Статистика для верхних карточек
app.get("/api/analytics/stats", async (req, res) => {
  try {
    const totalQuery = `SELECT COUNT(*) as count FROM data_public."справочник_объектов_недвижимости"`;
    const total = await pool.query(totalQuery);

    const rentedQuery = `
      SELECT COUNT(DISTINCT d.object_id) as count 
      FROM data_public."договор_аренды" d
      WHERE d.status_contract = 'Активный'
    `;
    const rented = await pool.query(rentedQuery);

    const rateQuery = `
      SELECT COALESCE(AVG(d.rent / NULLIF(d.rented_area, 0)), 0) as avg_rate
      FROM data_public."договор_аренды" d
      WHERE d.status_contract = 'Активный'
    `;
    const rate = await pool.query(rateQuery);

    const overdueQuery = `
      SELECT 
        COALESCE(SUM(p.sum), 0) as total_overdue,
        COUNT(DISTINCT p.lease_id) as overdue_count
      FROM data_public."платежи" p
      WHERE p.status_pay = 'Просрочен'
        AND p.date_pay >= NOW() - INTERVAL '90 days'
    `;
    const overdue = await pool.query(overdueQuery);

    const occupancyQuery = `
      SELECT 
        COALESCE(
          (COUNT(CASE WHEN d.status_contract = 'Активный' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(*), 0)), 0
        ) as occupancy_rate
      FROM data_public."договор_аренды" d
    `;
    const occupancy = await pool.query(occupancyQuery);

    res.json({
      totalObjects: parseInt(total.rows[0].count) || 0,
      rentedObjects: parseInt(rented.rows[0].count) || 0,
      avgRate: Math.round(rate.rows[0].avg_rate) || 0,
      overdueAmount: parseFloat(overdue.rows[0].total_overdue) || 0,
      overdueCount: parseInt(overdue.rows[0].overdue_count) || 0,
      occupancyRate: Math.round(occupancy.rows[0].occupancy_rate) || 0,
    });
  } catch (error) {
    console.error("Ошибка статистики:", error);
    res.status(500).json({ error: error.message });
  }
});

// Типы объектов
app.get("/api/analytics/object-types", async (req, res) => {
  try {
    const query = `
      WITH object_income AS (
        SELECT 
          obj.objectestate_id,
          CASE 
            WHEN obj.name ILIKE '%детский сад%' THEN 'Детские сады'
            WHEN obj.name ILIKE '%школ%' THEN 'Школы'
            WHEN obj.name ILIKE '%административ%' THEN 'Офисы'
            WHEN obj.name ILIKE '%помещение%' THEN 'Помещения'
            WHEN obj.name ILIKE '%сооружение%' THEN 'Сооружения'
            WHEN obj.name ILIKE '%жилое%' THEN 'Жилые помещения'
            ELSE 'Другое'
          END as object_type,
          COALESCE(SUM(p.sum), 0) as total_income
        FROM data_public."справочник_объектов_недвижимости" obj
        LEFT JOIN data_public."договор_аренды" d ON obj.objectestate_id = d.object_id
        LEFT JOIN data_public."платежи" p ON d.lease_id = p.lease_id
          AND p.status_pay = 'Оплачен'
        GROUP BY obj.objectestate_id, object_type
      )
      SELECT 
        object_type,
        COUNT(*) as count,
        SUM(total_income) as total_income
      FROM object_income
      GROUP BY object_type
      ORDER BY total_income DESC
    `;
    const result = await pool.query(query);

    console.log("Типы объектов:", result.rows);
    res.json(result.rows);
  } catch (error) {
    console.error("Ошибка типов объектов:", error);
    res.status(500).json({ error: error.message });
  }
});

// Надежность арендаторов
app.get("/api/analytics/renter-reliability", async (req, res) => {
  try {
    const query = `
      SELECT 
        a.name as renter_name,
        COUNT(p.pay_id) as total_payments,
        COALESCE(SUM(CASE WHEN p.status_pay = 'Просрочен' THEN 1 ELSE 0 END), 0) as overdue_payments,
        COALESCE(SUM(CASE WHEN p.status_pay = 'Оплачен' THEN 1 ELSE 0 END), 0) as paid_payments,
        CASE 
          WHEN COUNT(p.pay_id) = 0 THEN 0
          ELSE ROUND(
            (COALESCE(SUM(CASE WHEN p.status_pay = 'Оплачен' THEN 1 ELSE 0 END), 0) * 100.0 / 
            COUNT(p.pay_id)), 1
          )
        END as reliability_percent
      FROM data_public."арендаторы" a
      LEFT JOIN data_public."договор_аренды" d ON a.rentor_id = d.rentor_id
      LEFT JOIN data_public."платежи" p ON d.lease_id = p.lease_id
      GROUP BY a.rentor_id, a.name
      ORDER BY reliability_percent DESC
    `;
    const result = await pool.query(query);

    // Для отладки - посмотрим в консоль
    console.log("Данные по арендаторам:", result.rows);

    res.json(result.rows);
  } catch (error) {
    console.error("Ошибка надежности арендаторов:", error);
    res.status(500).json({ error: error.message });
  }
});

// Прогноз доходов
app.get("/api/analytics/forecast", async (req, res) => {
  try {
    // Получаем данные за последние 3 месяца
    const actualQuery = `
      SELECT 
        TO_CHAR(date_pay, 'YYYY-MM') as month,
        SUM(sum) as total
      FROM data_public."платежи"
      WHERE status_pay = 'Оплачен'
        AND date_pay >= NOW() - INTERVAL '3 months'
      GROUP BY month
      ORDER BY month
      LIMIT 3
    `;
    const actualResult = await pool.query(actualQuery);

    // Получаем средний платеж за последние 3 месяца
    const avgQuery = `
      SELECT COALESCE(AVG(sum), 0) as avg_payment
      FROM data_public."платежи"
      WHERE status_pay = 'Оплачен'
        AND date_pay >= NOW() - INTERVAL '3 months'
    `;
    const avgResult = await pool.query(avgQuery);
    const avgPayment = parseFloat(avgResult.rows[0].avg_payment) || 0;

    const months = [
      "Янв",
      "Фев",
      "Мар",
      "Апр",
      "Май",
      "Июн",
      "Июл",
      "Авг",
      "Сен",
      "Окт",
      "Ноя",
      "Дек",
    ];
    const now = new Date();

    const forecast = [];

    // Последние 3 месяца (факт)
    for (let i = 2; i >= 0; i--) {
      const date = new Date();
      date.setMonth(now.getMonth() - i);
      const monthName = months[date.getMonth()];
      const monthStr = date.toISOString().slice(0, 7);

      const actualData = actualResult.rows.find((r) => r.month === monthStr);

      forecast.push({
        month: monthName,
        actual: actualData ? Math.round(actualData.total / 1000) : 0,
        forecast: null,
      });
    }

    // Следующие 3 месяца (прогноз)
    const avgMonthlyTotal = avgPayment * 5; // среднее количество платежей в месяц
    for (let i = 1; i <= 3; i++) {
      const date = new Date();
      date.setMonth(now.getMonth() + i);
      const monthName = months[date.getMonth()];

      forecast.push({
        month: monthName,
        actual: null,
        forecast: Math.round(avgMonthlyTotal / 1000),
      });
    }

    res.json(forecast);
  } catch (error) {
    console.error("Ошибка прогноза:", error);
    res.status(500).json({ error: error.message });
  }
});

// Сезонность просрочек
app.get("/api/analytics/seasonality", async (req, res) => {
  try {
    const query = `
      SELECT 
        TO_CHAR(date_pay, 'MM') as month_num,
        TO_CHAR(date_pay, 'Mon') as month,
        COUNT(CASE WHEN status_pay = 'Просрочен' THEN 1 END) as overdue_count,
        COUNT(CASE WHEN status_pay = 'Оплачен' THEN 1 END) as paid_count
      FROM data_public."платежи" p
      WHERE date_pay >= NOW() - INTERVAL '12 months'
        AND EXISTS (SELECT 1 FROM data_public."договор_аренды" d WHERE d.lease_id = p.lease_id)
      GROUP BY month_num, month
      ORDER BY month_num
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Ошибка сезонности:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:3000`);
});
