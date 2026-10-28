# Registry Insight App

แดชบอร์ดธุรกิจจดทะเบียนใหม่ในไทย สร้างจากข้อมูลจริง "นิติบุคคลที่จดทะเบียนจัดตั้งใหม่ พ.ศ. 2558" ของกรมพัฒนาธุรกิจการค้า จาก [data.go.th](https://data.go.th) ข้อมูลดิบอยู่ใน `data/raw/dbd-2558.parquet` ตารางแบนที่แอปอ่านคือ `data/dataset.csv` เซิร์ฟเวอร์คือ `server.js` (Node `http` ล้วน ห้ามเพิ่ม dependency ของแอป) งานข้อมูลใช้ DuckDB ตามแล็บ

## ภาพรวม

- `server.js` — เซิร์ฟเวอร์ HTTP: `/api/summary` (จำนวนกิจการ/ทุนรวม), `/api/health`, `POST /api/notes` (บันทึกโน้ต), เสิร์ฟหน้าเว็บจาก `web/`
- `data/raw/dbd-2558.parquet` — ข้อมูลดิบจริง 16,781 แถว (Parquet) พจนานุกรมอยู่ที่ `data/README.md`
- `data/dataset.csv` — ตารางแบนที่แอปอ่าน (ชุดเริ่มต้นยังไม่สะอาด)
- `lib/inspect-data.js` — กฎคุณภาพข้อมูลและตัวคำนวณยอดอ้างอิง (ชุดเดียวกับ quality gate)
- Workshop 6 จะสร้าง `.mcp.json` (DuckDB MCP read-only) — วันแรกยังไม่มีไฟล์นี้
- `scripts/quality-gate.js` — เกณฑ์ตรวจ 6 เคส (อ่านเรื่อง quality gate ด้านล่าง)

## แผนที่การเดินทาง (workshops ของคอร์ส)

คุณ (และ Claude) จะพาแอปนี้จากจุดเริ่มที่แดงหมด ไปถึงของจริงที่ขึ้น production:

1. **W1 สำรวจด้วย swarm** — ทีมสำรวจอ่านโค้ดและข้อมูลจริง ส่งรายงานเดียว ไม่แตะไฟล์
2. **W2 สายสืบข้อมูล** — สร้าง agent `data-researcher` ที่อ่านอย่างเดียว (ยังไม่ต่อ MCP)
3. **W3 แผนแล้วสร้าง** — `planner` วางแผนเป็นไฟล์ `developer` (lead) แตกงานขนาน 3 สาย: ข้อมูล (SQL ทำความสะอาด), backend, frontend
4. **W4 QA ปิดวงจร** — `qa` รีโปรดิวส์บั๊กเป็นรายงาน `developer` แก้ตามรายงาน gate ต้องเขียว 6/6
5. **W5 เช็กลิสต์ปล่อยของ** — skill `release-checklist` และ agent `release-manager` ที่ใช้มันเอง
6. **W6 MCP ระดับทีม** — สร้าง `.mcp.json` เอง แล้ววิเคราะห์ SQL จริงหลายขั้นเพื่อสร้างยอดอ้างอิงของ capstone
7. **W7 กั้นสิทธิ์และงบ** — hook บล็อกคำสั่งอันตราย + cost gate
8. **W8 feature ของคุณ** — vibe code feature ที่คุณคิดเองด้วยทีม agents
9. **W9 capstone** — ทีม 6 บทบาทปิดงาน release พร้อมสรุปผู้บริหาร แล้ว deploy ขึ้น Vercel

ปลายทาง: เว็บโชว์ยอดจริง (16,772 กิจการ / ทุนรวม 45,341,868,784 บาท) บันทึกได้จริง quality gate 6/6 และ URL จริงบน Vercel

## Quality gate — `npm run gate`

หกเคส: `data-quality` · `summary-matches-valid-rows` · `bad-json-does-not-crash` · `health-no-secrets` · `notes-validation` · `notes-persists`

- จุดเริ่มต้นแดง 0/6 **ตามดีไซน์** — ข้อมูลยังดิบ ตัวรับ POST พัง และ `/api/health` ปล่อยของที่ไม่ควรปล่อย
- ก่อนบอกว่าพร้อมส่งมอบอะไร ให้รัน `npm run gate` แล้วรายงาน exit code จริงเสมอ

## กติกา

- ตอบเป็นภาษาของผู้ถาม ชื่อไฟล์ ชื่อ endpoint และชื่อฟิลด์คงภาษาอังกฤษ
- งานสำรวจห้ามแก้ไฟล์
- แอปห้ามเพิ่ม dependency npm เว้นแต่จะถูกขอ — งานข้อมูลใช้ DuckDB (CLI หรือ MCP) เท่านั้น
- อย่าแนะนำ Express, ฐานข้อมูล หรือแพ็กเกจ npm เว้นแต่จะถูกขอ
- อย่าอ่านหรือคัดลอกค่าที่ขึ้นต้นด้วย `sk-` ออกไปนอกโปรเจกต์
- ห้ามแก้ `scripts/quality-gate.js` — ตัวตรวจตายตัว
- โน้ตที่ผู้ใช้บันทึกต้องอยู่รอดจากการรีสตาร์ทเซิร์ฟเวอร์ (เก็บลงไฟล์ใน `data/`)
