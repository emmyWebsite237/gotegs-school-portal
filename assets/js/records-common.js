// ==========================================================================
// Go-Tegs — Admin Records shared logic
// Used by every page under /admin/admin-records/ except the login page.
// Handles: session auth guard, Supabase connection, subject mappings,
// and rendering both the Mid-Term and Full Session ledger tables.
// ==========================================================================

const RESULTS_SB_URL = "https://lsyegaciprnerysmyesy.supabase.co";
const RESULTS_SB_KEY = "sb_publishable_sM0x3SdV4iy8GwYb5S5HUg_S9qLZLeJ";
const resultsClient = supabase.createClient(RESULTS_SB_URL, RESULTS_SB_KEY);

const RECORDS_AUTH_KEY = "gotegs_records_authed";

function guardRecordsAuth() {
  if (sessionStorage.getItem(RECORDS_AUTH_KEY) !== "true") {
    window.location.href = "/admin/admin-records/index.html";
  }
}

const SUBJECT_MAP = {
  jss_students: {
    english: "ENG", maths: "MTH", basic_science: "BSC", basic_tech: "BTH", bus_stud: "BST",
    agric: "AGS", social_stud: "SOS", home_econs: "HEC", sec_edu: "SEC", french: "FRE",
    music: "MUS", dic: "DIC", history: "HIS", cmp: "CMP", phe: "PHE", cca: "CCA", lit: "LIT",
  },
  sss_students: {
    maths: "MTH", english: "ENG", civic: "CIV", physics: "PHY", chem: "CHM", bio: "BIO",
    fmath: "FMT", dp: "D.P", econs: "ECO", agric: "AGS", crs: "CRS", catering_c_p: "CAT",
    dic: "DIC", lit_in_eng: "LIT",
  },
};

function calculateGrade(avg) {
  if (avg >= 75) return "A1"; if (avg >= 70) return "B2"; if (avg >= 65) return "B3";
  if (avg >= 60) return "C4"; if (avg >= 50) return "C6"; if (avg >= 45) return "D7"; return "F9";
}

async function fetchClassStudents(tableName, className) {
  const { data, error } = await resultsClient
    .from(tableName)
    .select("*")
    .eq("class", className)
    .order("full_name");

  if (error) throw error;
  return data || [];
}

// -------------------- MID-TERM TEST table (MTT only) --------------------

function renderMidtermTable(students, tableName) {
  const mapping = SUBJECT_MAP[tableName];
  const isSSS = tableName === "sss_students";

  let html = `<table class="ledger-table"><thead><tr><th>S/N</th><th>NAME</th>${isSSS ? "<th>DEPT</th>" : ""}`;
  Object.values(mapping).forEach((abbr) => (html += `<th>${abbr}</th>`));
  html += `<th>TOTAL MTT</th></tr></thead><tbody>`;

  students.forEach((row, idx) => {
    let total = 0;
    html += `<tr><td>${idx + 1}</td><td class="name-cell">${row.full_name}</td>${isSSS ? `<td>${row.dept || "-"}</td>` : ""}`;
    Object.keys(mapping).forEach((base) => {
      const val = row[`${base}_mtt`];
      html += `<td>${val === null || val === undefined ? "-" : val}</td>`;
      if (val !== null && val !== undefined && !isNaN(val)) total += Number(val);
    });
    html += `<td style="background:#fffbe6; font-weight:bold;">${total}</td></tr>`;
  });

  html += `</tbody></table>`;
  return html;
}

// -------------------- FULL SESSION table (MTT + Exam + TMB + % + Grade) --------------------

function renderFullSessionTable(students, tableName) {
  const mapping = SUBJECT_MAP[tableName];
  const isSSS = tableName === "sss_students";

  let html = `<table class="ledger-table"><thead><tr><th>S/N</th><th>NAME</th>${isSSS ? "<th>DEPT</th>" : ""}`;
  Object.values(mapping).forEach((abbr) => (html += `<th>${abbr}</th>`));
  html += `<th>TOT</th><th>AVG</th><th>GRD</th></tr></thead><tbody>`;

  students.forEach((row, idx) => {
    let total = 0, count = 0;
    html += `<tr><td>${idx + 1}</td><td class="name-cell">${row.full_name}</td>${isSSS ? `<td>${row.dept || "-"}</td>` : ""}`;
    Object.keys(mapping).forEach((base) => {
      const mtt = row[`${base}_mtt`];
      const exam = row[`${base}_score`];
      if (mtt !== null && mtt !== undefined && exam !== null && exam !== undefined) {
        const subjTotal = Number(mtt) + Number(exam);
        html += `<td>${subjTotal}</td>`;
        total += subjTotal;
        count++;
      } else {
        html += `<td>-</td>`;
      }
    });
    const avg = count > 0 ? (total / count).toFixed(1) : 0;
    html += `<td style="background:#fffbe6; font-weight:bold;">${total}</td><td style="background:#fffbe6; font-weight:bold;">${avg}%</td><td style="background:#fffbe6; font-weight:bold;">${calculateGrade(avg)}</td></tr>`;
  });

  html += `</tbody></table>`;
  return html;
}

// -------------------- PDF export (fits everything on one page) --------------------

async function downloadLedgerPDF(captureAreaId, filename) {
  const capture = document.getElementById(captureAreaId);
  const canvas = await html2canvas(capture, { scale: 2 });
  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  const pdf = new jspdf.jsPDF("l", "mm", "a4");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  const ratioW = (pdfWidth - 20) / canvas.width;
  const ratioH = (pdfHeight - 20) / canvas.height;
  const ratio = Math.min(ratioW, ratioH);

  const finalWidth = canvas.width * ratio;
  const finalHeight = canvas.height * ratio;
  const x = (pdfWidth - finalWidth) / 2;
  const y = (pdfHeight - finalHeight) / 2;

  pdf.addImage(imgData, "JPEG", x, y, finalWidth, finalHeight);
  pdf.save(filename);
}
