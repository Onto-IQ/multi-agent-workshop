# Registry Insight

แดชบอร์ดธุรกิจจดทะเบียนใหม่ในไทย สร้างจาก**ข้อมูลจริง** "นิติบุคคลที่จดทะเบียนจัดตั้งใหม่ พ.ศ. 2558" ของกรมพัฒนาธุรกิจการค้า จากพอร์ทัล [data.go.th](https://data.go.th) — โปรเจกต์หลักของ workshop **Build AI Multi-Agent Apps with Claude Code** ผู้เรียนรัน `claude` ที่โปรเจกต์นี้ตลอดทั้งคอร์ส และค่อย ๆ พาแอปจากข้อมูลดิบ ไปจนถึง deploy บน Vercel

## โครงสร้างโปรเจกต์

```
├── package.json            npm scripts (start / gate) — Node >= 18, ไม่มี dependency
├── server.js               เซิร์ฟเวอร์ HTTP (Node http ล้วน)
├── data/
│   ├── dataset.csv         ตารางแบนที่แอปอ่าน (ชุดเริ่มต้นยังไม่สะอาด — ตั้งใจให้งานแรกทำความสะอาด)
│   ├── raw/
│   │   └── dbd-2558.parquet  ข้อมูลดิบจริง 16,781 แถว (Parquet — แปลงจาก CSV ของ data.go.th)
│   └── warehouse.duckdb     ฐาน DuckDB ที่มี view businesses_raw (ใช้กับ MCP ใน Workshop 6)
│   └── README.md           พจนานุกรมคอลัมน์ + เกณฑ์ข้อมูลที่สะอาดแล้ว
├── lib/
│   ├── csv.js              ตัวอ่าน CSV รองรับ quote ครบ
│   └── inspect-data.js     กฎคุณภาพข้อมูล + ตัวคำนวณยอดอ้างอิง (ชุดเดียวกับ quality gate)
├── scripts/
│   ├── quality-gate.js     เกณฑ์ตรวจคุณภาพแอป 6 เคส (exit 2 = ยังไม่ผ่าน ตามดีไซน์)
│   └── verify-setup.mjs    ตรวจเครื่อง+แอปในโฟลเดอร์นี้ (รันที่ workshop ไม่ใช่ course)
├── web/                    หน้าเว็บ static (index.html / app.js / styles.css)
└── CLAUDE.md               ภาพรวมโปรเจกต์ แผนที่การเดินทาง และกติกาที่ Claude ต้องอ่านก่อนลงมือ
```

## วิธีรัน

```bash
npm run verify     # ตรวจเครื่อง + บูตแอป + starter gate แดง (exit 2) — รันที่โฟลเดอร์นี้
npm start          # เปิดเซิร์ฟเวอร์ที่ http://127.0.0.1:3000
npm run gate       # ตรวจคุณภาพแอปด้วย quality gate
```

> สคริปต์ `verify-setup` มีสองที่: **ที่นี่** ตรวจแอปในโฟลเดอร์นี้ · **ที่ course repo** (โฟลเดอร์ที่มี `Lessons/`) ตรวจครบสอง repo รวม path workshop — อย่ารันสลับโฟลเดอร์แล้วคาดผลชุดเดียวกัน

ตั้งค่าพอร์ตอื่นได้ด้วย `PORT` เช่น `PORT=3001 npm start` (Windows: `set PORT=3001`)

## สถานะเริ่มต้น (by design)

- `data/dataset.csv` ยังเป็นของดิบ — วันที่ยังเป็น พ.ศ., แถวหัวตารางปน, จังหวัดฝังในที่อยู่ เว็บจะไม่โชว์ยอดจริงจนกว่าจะทำความสะอาดใน Workshop 3
- `npm run gate` ออก **exit 2 (แดง 0/6)** — ข้อมูลยังไม่ผ่านกฎ, `POST /api/notes` พังเมื่อรับของแปลก, `/api/health` รั่วค่าตัวอย่าง และโน้ตไม่ถูกเก็บลงไฟล์ งานของผู้เรียนคือพา gate ไปให้ครบ **6/6** ภายใน Day 1
- ห้ามเพิ่ม dependency npm สำหรับแอป — ทุกอย่างใช้ Node http ล้วนตามที่ `CLAUDE.md` กำหนด (งานข้อมูลใช้ DuckDB ตามแล็บ)

## กติกาการทำงานกับ Claude

อ่าน `CLAUDE.md` ก่อน — สรุปสั้น ๆ: สำรวจได้แต่ห้ามแก้ไฟล์เองโดยไม่ได้รับมอบหมาย, ตอบเป็นภาษาของผู้ถาม, และก่อนประกาศว่าเสร็จต้องรัน `npm run gate` แล้วรายงาน exit code จริง
