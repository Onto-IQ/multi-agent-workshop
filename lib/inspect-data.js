'use strict';

/**
 * Data quality rules and reference statistics for the workshop dataset:
 * "นิติบุคคลที่จดทะเบียนจัดตั้งใหม่" (กรมพัฒนาธุรกิจการค้า, พ.ศ. 2558)
 * downloaded from data.go.th and shipped as data/raw/dbd-2558.parquet.
 *
 * data/dataset.csv is the flat table the app reads. The starter copy is the
 * RAW export — titles, repeated headers, Buddhist-era dates, comma-formatted
 * numbers, province buried in the address — and every rule below fails on it.
 * Cleaning it (Workshop 3) is what turns data-quality green.
 */

const PROVINCE_REGION = {
  กรุงเทพมหานคร: 'กลาง', นนทบุรี: 'กลาง', ปทุมธานี: 'กลาง', พระนครศรีอยุธยา: 'กลาง',
  อ่างทอง: 'กลาง', ลพบุรี: 'กลาง', สิงห์บุรี: 'กลาง', ชัยนาท: 'กลาง', สระบุรี: 'กลาง',
  สุพรรณบุรี: 'กลาง', นครปฐม: 'กลาง', สมุทรปราการ: 'กลาง', สมุทรสาคร: 'กลาง',
  สมุทรสงคราม: 'กลาง', นครนายก: 'กลาง',
  ชลบุรี: 'ตะวันออก', ระยอง: 'ตะวันออก', จันทบุรี: 'ตะวันออก', ตราด: 'ตะวันออก',
  ฉะเชิงเทรา: 'ตะวันออก', ปราจีนบุรี: 'ตะวันออก', สระแก้ว: 'ตะวันออก',
  กาญจนบุรี: 'ตะวันตก', เพชรบุรี: 'ตะวันตก', ประจวบคีรีขันธ์: 'ตะวันตก', ราชบุรี: 'ตะวันตก',
  เชียงใหม่: 'เหนือ', ลำพูน: 'เหนือ', ลำปาง: 'เหนือ', อุตรดิตถ์: 'เหนือ', แพร่: 'เหนือ',
  น่าน: 'เหนือ', พะเยา: 'เหนือ', เชียงราย: 'เหนือ', แม่ฮ่องสอน: 'เหนือ',
  นครสวรรค์: 'เหนือ', อุทัยธานี: 'เหนือ', กำแพงเพชร: 'เหนือ', ตาก: 'เหนือ',
  สุโขทัย: 'เหนือ', พิษณุโลก: 'เหนือ', พิจิตร: 'เหนือ', เพชรบูรณ์: 'เหนือ',
  ขอนแก่น: 'อีสาน', อุดรธานี: 'อีสาน', หนองบัวลำภู: 'อีสาน', หนองคาย: 'อีสาน',
  บึงกาฬ: 'อีสาน', เลย: 'อีสาน', มหาสารคาม: 'อีสาน', ร้อยเอ็ด: 'อีสาน',
  กาฬสินธุ์: 'อีสาน', สกลนคร: 'อีสาน', นครพนม: 'อีสาน', มุกดาหาร: 'อีสาน',
  ชัยภูมิ: 'อีสาน', นครราชสีมา: 'อีสาน', บุรีรัมย์: 'อีสาน', สุรินทร์: 'อีสาน',
  ศรีสะเกษ: 'อีสาน', อุบลราชธานี: 'อีสาน', ยโสธร: 'อีสาน', อำนาจเจริญ: 'อีสาน',
  นครศรีธรรมราช: 'ใต้', กระบี่: 'ใต้', พังงา: 'ใต้', สุราษฎร์ธานี: 'ใต้', พัทลุง: 'ใต้',
  สงขลา: 'ใต้', สตูล: 'ใต้', ตรัง: 'ใต้', ภูเก็ต: 'ใต้', ปัตตานี: 'ใต้',
  ยะลา: 'ใต้', นราธิวาส: 'ใต้', ชุมพร: 'ใต้', ระนอง: 'ใต้',
};

const PROVINCE_NAMES = Object.keys(PROVINCE_REGION);

const COLUMNS = ['month', 'seq', 'reg_no', 'company_name', 'reg_date', 'capital', 'objective', 'address', 'province'];

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

// " 2,000,000,000 " -> 2000000000 ; anything else -> NaN
function parseCapital(raw) {
  const text = String(raw ?? '').replace(/[\s,\u00a0]/g, '');
  if (text === '') return NaN;
  return Number(text);
}

// The final table stores registration dates as ISO "2015-01-12" (ค.ศ.).
// Raw Buddhist-era dates like "12/1/2558" fail this rule — converting them
// is part of cleaning (Workshop 3).
function parseRegDate(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const probe = new Date(iso);
  return Number.isNaN(probe.getTime()) ? null : iso;
}

// "234/4 อ.เมืองนราธิวาส จ.นราธิวาส 96000" -> "นราธิวาส"
// Addresses can mention several province names (ถนนบางนา-ตราด is in
// กรุงเทพมหานคร), so the winner is the one appearing closest to the end.
function extractProvince(address) {
  const text = String(address ?? '');
  let best = null;
  let bestPos = -1;
  for (const province of PROVINCE_NAMES) {
    const pos = text.lastIndexOf(province);
    if (pos > bestPos) {
      best = province;
      bestPos = pos;
    }
  }
  if (best) return best;
  const afterPrefix = /จ\.?\s*([\u0e00-\u0e7f]{2,20})/.exec(text);
  if (afterPrefix) {
    const candidate = afterPrefix[1].trim();
    for (const province of PROVINCE_NAMES) {
      if (candidate === province || candidate.startsWith(province) || province.startsWith(candidate.slice(0, 6))) {
        return province;
      }
    }
  }
  return null;
}

function parseSeq(raw) {
  const text = String(raw ?? '').replace(/[\s,]/g, '');
  if (text === '') return NaN;
  return Number(text);
}

// CSV with quoted fields (lib/csv.js shares this reader for the app).
function parseRows(text) {
  const src = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const table = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); table.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); table.push(row); }
  return table;
}

function analyze(csvText) {
  const violations = [];
  const counts = {};
  const valid = [];

  const violation = (line, code, detail) => {
    counts[code] = (counts[code] || 0) + 1;
    if (violations.length < 20) violations.push({ line, code, detail });
  };

  const table = parseRows(csvText);
  table.forEach((cells, index) => {
    const line = index + 1;
    if (index === 0) {
      const header = cells.map((c) => String(c).trim());
      if (header.join(',') !== COLUMNS.join(',')) {
        violation(line, 'bad-header', header.join(',').slice(0, 60));
      }
      return;
    }
    if (cells.length < COLUMNS.length) {
      violation(line, 'short-row', `${cells.length} columns`);
      return;
    }
    const row = {};
    COLUMNS.forEach((name, i) => { row[name] = String(cells[i] ?? '').trim(); });

    const seq = parseSeq(row.seq);
    if (!Number.isInteger(seq) || seq < 1) {
      violation(line, 'bad-seq', row.seq.slice(0, 30) || '(empty)');
      return;
    }
    if (!/^\d{13}$/.test(row.reg_no)) {
      violation(line, 'bad-reg-no', row.reg_no.slice(0, 30) || '(empty)');
      return;
    }
    if (!row.company_name) {
      violation(line, 'missing-company-name', `line ${line}`);
      return;
    }
    const iso = parseRegDate(row.reg_date);
    if (!iso) {
      violation(line, 'bad-reg-date', row.reg_date.slice(0, 30) || '(empty)');
      return;
    }
    const capital = parseCapital(row.capital);
    if (!Number.isFinite(capital) || capital < 0) {
      violation(line, 'bad-capital', row.capital.slice(0, 30) || '(empty)');
      return;
    }
    if (!row.objective) {
      violation(line, 'missing-objective', `line ${line}`);
      return;
    }
    const province = row.province;
    if (!province || !PROVINCE_REGION[province]) {
      violation(line, 'unknown-province', (province || '(empty)').slice(0, 40));
      return;
    }

    valid.push({
      line,
      month: row.month,
      seq,
      regNo: row.reg_no,
      companyName: row.company_name,
      regDate: iso,
      capital,
      objective: row.objective,
      address: row.address,
      province,
      region: PROVINCE_REGION[province],
    });
  });

  const seen = new Set();
  for (const row of valid) {
    if (seen.has(row.regNo)) violation(row.line, 'duplicate-reg-no', row.regNo);
    seen.add(row.regNo);
  }

  let totalCapital = 0;
  const byProvince = {};
  const byRegion = {};
  const byMonth = {};
  for (const row of valid) {
    totalCapital = roundMoney(totalCapital + row.capital);
    byProvince[row.province] = roundMoney((byProvince[row.province] || 0) + row.capital);
    byRegion[row.region] = roundMoney((byRegion[row.region] || 0) + row.capital);
    byMonth[row.month] = roundMoney((byMonth[row.month] || 0) + row.capital);
  }

  return {
    violations,
    counts,
    validRows: valid,
    stats: {
      companyCount: valid.length,
      totalCapital: roundMoney(totalCapital),
      byProvince,
      byRegion,
      byMonth,
    },
  };
}

module.exports = {
  PROVINCE_REGION,
  COLUMNS,
  analyze,
  parseCapital,
  parseRegDate,
  extractProvince,
  parseSeq,
  roundMoney,
};
