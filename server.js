const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "src")));

// Создаем папку для PDF если её нет
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

// Получение объектов с координатами
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

// Получение договоров для объекта
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

// Получение платежей для договора
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

app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:3000`);
});
