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
    console.log("Найдено объектов:", result.rows.length);
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

app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:3000`);
});
