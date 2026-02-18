const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "src")));

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

app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:3000`);
});
