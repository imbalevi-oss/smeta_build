const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5001;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

let db;
const DB_PATH = path.join(__dirname, 'reference_data.db');

async function initDatabase() {
  const SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  db.run('PRAGMA journal_mode=WAL');
  
  db.run(`
    CREATE TABLE IF NOT EXISTS work_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      norm_code TEXT,
      resource_code TEXT,
      resource_name TEXT,
      unit TEXT,
      quantity REAL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS coefficients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      condition_text TEXT,
      applies_to TEXT,
      labor_coeff REAL,
      wage_coeff REAL,
      machine_coeff REAL
    )
  `);
  
  saveDatabase();
  console.log('✅ База данных инициализирована (ресурсы + коэффициенты)');
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Только PDF файлы'));
  }
});

app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(dataBuffer);
    const text = data.text;
    fs.unlinkSync(req.file.path);

    const type = detectPDFType(text);
    if (type === 'work_norms_v2') {
      const { resources, coefficients } = parseWorkNormsV2(text);
      saveResourcesAndCoefficients(resources, coefficients);
      
      res.json({ 
        success: true, 
        type: 'work_norms_v2', 
        resources: resources.length,
        coefficients: coefficients.length
      });
    } else {
      return res.status(400).json({ error: 'Неизвестный формат PDF' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

function detectPDFType(text) {
  const firstPage = text.split('\f')[0] || text;
  if (firstPage.includes('Сборник стоимостных нормативов') ||
      firstPage.includes('Глава 1') ||
      (firstPage.includes('Отдел') && firstPage.includes('Таблица 1-'))) {
    return 'work_norms_v2';
  }
  return 'unknown';
}

function parseWorkNormsV2(text) {
  const clean = text.replace(/\f/g, '\n');
  const lines = clean.split('\n').map(l => l.trim());

  const resources = [];
  const coefficients = [];

  const normCodePattern = /^\d+-\d+-\d+-\d+\/\d+$/;
  const resourceCodePattern = /^\d+\.\d+-\d+-\d+$/;
  const unitQtyPattern = /^(м3|т|маш\.-ч|чел\.-ч|шт|кг|м2|м|компл\.?|100\s*м2|100\s*м3)\s+([\d,]+(?:\.\d+)?)$/i;

  let currentNormCode = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('Таблица') || line.startsWith('Отдел') || line.startsWith('Раздел')) {
      i++;
      continue;
    }

    if (normCodePattern.test(line)) {
      currentNormCode = line;
      i++;
      continue;
    }

    if (currentNormCode && resourceCodePattern.test(line)) {
      const resCode = line;
      i++;
      if (i >= lines.length) break;

      let resName = '';
      while (i < lines.length && !unitQtyPattern.test(lines[i]) && !normCodePattern.test(lines[i]) && !resourceCodePattern.test(lines[i])) {
        resName += (resName ? ' ' : '') + lines[i];
        i++;
      }

      if (i < lines.length) {
        const m = lines[i].match(unitQtyPattern);
        if (m) {
          const unit = m[1];
          const qty = parseFloat(m[2].replace(',', '.'));
          resources.push({
            norm_code: currentNormCode,
            resource_code: resCode,
            resource_name: resName.trim(),
            unit: unit,
            quantity: qty
          });
          i++;
          continue;
        }
      }
      continue;
    }

    if (line.startsWith('3. Коэффициенты')) {
      while (i < lines.length && !lines[i].startsWith('4.') && !lines[i].startsWith('Отдел')) {
        const coeffLine = lines[i];
        const match = coeffLine.match(/^(\d+\.\d+\.)\s+(.+?)\s{2,}(.+)/);
        if (match) {
          const condition = match[2].trim();
          const rest = match[3].trim();
          const parts = rest.split(/\s{2,}/);
          if (parts.length >= 3) {
            const applies = parts[0].trim();
            const labor = parseFloat((parts[1] || '1').replace(',', '.'));
            const wage = parseFloat((parts[2] || '1').replace(',', '.'));
            const machine = parts[3] ? parseFloat(parts[3].replace(',', '.')) : 0;
            coefficients.push({
              condition_text: condition,
              applies_to: applies,
              labor_coeff: labor || 1,
              wage_coeff: wage || 1,
              machine_coeff: machine || 0
            });
          }
        }
        i++;
      }
      continue;
    }

    i++;
  }

  console.log(`📦 Ресурсов: ${resources.length}, Коэффициентов: ${coefficients.length}`);
  return { resources, coefficients };
}

function saveResourcesAndCoefficients(resources, coefficients) {
  db.run('BEGIN TRANSACTION');
  db.run('DELETE FROM work_resources');
  db.run('DELETE FROM coefficients');

  const resStmt = db.prepare(`
    INSERT INTO work_resources (norm_code, resource_code, resource_name, unit, quantity)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const r of resources) {
    resStmt.run([r.norm_code, r.resource_code, r.resource_name, r.unit, r.quantity]);
  }
  resStmt.free();

  if (coefficients.length > 0) {
    const coeffStmt = db.prepare(`
      INSERT INTO coefficients (condition_text, applies_to, labor_coeff, wage_coeff, machine_coeff)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const c of coefficients) {
      coeffStmt.run([c.condition_text, c.applies_to, c.labor_coeff, c.wage_coeff, c.machine_coeff]);
    }
    coeffStmt.free();
  }

  db.run('COMMIT');
  saveDatabase();
}

app.get('/api/search', (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.json({ results: [] });

  const results = [];
  
  const rows = db.exec(
    `SELECT * FROM work_resources WHERE norm_code LIKE ? OR resource_code LIKE ? OR resource_name LIKE ? LIMIT 30`,
    [`%${query}%`, `%${query}%`, `%${query}%`]
  );
  
  if (rows.length > 0 && rows[0].values.length > 0) {
    const grouped = {};
    for (const row of rows[0].values) {
      const norm = row[1];
      if (!grouped[norm]) grouped[norm] = [];
      grouped[norm].push({
        resource_code: row[2],
        resource_name: row[3],
        unit: row[4],
        quantity: row[5]
      });
    }
    for (const [norm, resList] of Object.entries(grouped)) {
      results.push({
        type: 'resource_group',
        norm_code: norm,
        resources: resList
      });
    }
  }
  
  const coeffRows = db.exec(
    `SELECT * FROM coefficients WHERE condition_text LIKE ? OR applies_to LIKE ? LIMIT 5`,
    [`%${query}%`, `%${query}%`]
  );
  if (coeffRows.length > 0 && coeffRows[0].values.length > 0) {
    for (const row of coeffRows[0].values) {
      results.push({
        type: 'coefficient',
        condition_text: row[1],
        applies_to: row[2],
        labor_coeff: row[3],
        wage_coeff: row[4],
        machine_coeff: row[5]
      });
    }
  }

  res.json({ results });
});

app.get('/api/work-resources', (req, res) => {
  const rows = db.exec('SELECT * FROM work_resources ORDER BY norm_code, resource_code');
  const result = rows.length > 0 ? rows[0].values.map(v => ({
    id: v[0],
    norm_code: v[1],
    resource_code: v[2],
    resource_name: v[3],
    unit: v[4],
    quantity: v[5]
  })) : [];
  res.json(result);
});

async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`🔍 Сервер запущен: http://localhost:${PORT}`);
    console.log(`📋 Режим: только состав работ (ресурсы)`);
  });
}
start();