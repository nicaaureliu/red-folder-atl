/* public/app.js */
(() => {
  const BUILD = "v1.0";
  const APP_TITLE = "Red Folder ATL";

  // Put your blank template here in the repo:
  // public/templates/daily-briefing.pdf
  const TEMPLATES = {
    dailyBrief: "./templates/daily-briefing.pdf",
  };

  // Paste your existing Plant Checks URL here (your QR app)
  const PLANT_CHECKS_URL = ""; // e.g. "https://plant-checks.pages.dev/"

  const RECORDS_KEY = "RFATL_RECORDS_V1";

  const DAILY_BRIEF_POINTS = [
    "Confined Spaces / Access",
    "Emergency Procedures",
    "Lifting Equipment (Crane / Slings)",
    "Permits to Work",
    "Plant & Equipment",
    "Safety Planning",
    "Barriers / Edge Protection",
    "Clear Access Ways",
    "Method Statement / Risk Assessments",
    "Suitable PPE",
    "Trench Collapse",
    "Welfare Facilities",
    "COSHH Assessments",
    "Fire Precautions",
    "Materials",
    "Operative Experience / Competence",
    "Overhead / Underground Cable Strike",
    "Trips / Falls",
  ];

  const $ = (sel, root = document) => root.querySelector(sel);

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function todayISO() {
    const d = new Date();
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }

  function prettyDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }

  function sanitizeFileName(s) {
    return String(s || "")
      .replaceAll(/[\/\\:*?"<>|]/g, "-")
      .replaceAll(/\s+/g, " ")
      .trim();
  }

  function ensurePdf() {
    const jspdfNS = window.jspdf;
    if (!jspdfNS?.jsPDF) {
      alert("PDF library not loaded. Refresh the page.");
      return null;
    }
    return jspdfNS.jsPDF;
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(RECORDS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveRecords(records) {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  }

  function addRecord(record) {
    const all = loadRecords();
    all.unshift(record);
    saveRecords(all.slice(0, 200));
  }

  function route() {
    const h = (location.hash || "").replace("#", "").trim();
    return h || "home";
  }

  function setSubtitle(text) {
    const el = $("#subTitle");
    if (el) el.textContent = text;
  }

  function setBuild() {
    const b = $("#buildTag");
    const f = $("#footTag");
    if (b) b.textContent = `BUILD ${BUILD}`;
    if (f) f.textContent = `${APP_TITLE} • BUILD ${BUILD}`;
  }

  function appRoot() {
    return $("#app");
  }

  function showMsg(root, text, ok = true) {
    const box = document.createElement("div");
    box.className = `msg ${ok ? "msgOk" : "msgErr"}`;
    box.textContent = text;
    root.prepend(box);
    setTimeout(() => box.remove(), 4500);
  }

  // ---------------- PDF: Daily Brief ----------------
  function dailyBriefPdf(data, mode = "download") {
    const jsPDF = ensurePdf();
    if (!jsPDF) return;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const left = 40;
    let y = 46;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("HEALTH & SAFETY • MORNING BRIEFING", left, y);

    doc.setDrawColor(255, 214, 0);
    doc.setLineWidth(3);
    doc.line(left, y + 12, 555, y + 12);

    y += 28;

    const metaRows = [
      ["Project Title", data.projectTitle || ""],
      ["Site Location", data.siteLocation || ""],
      ["Work Location", data.workLocation || ""],
      ["Project No", data.projectNo || ""],
      ["Briefing by", data.briefingBy || ""],
      ["Job title", data.jobTitle || ""],
      ["Date", prettyDate(data.date) || ""],
      ["No. persons attending", data.personsAttending || ""],
      ["Went as planned?", (data.wentAsPlanned || "").toUpperCase()],
    ];

    doc.autoTable({
      startY: y,
      head: [["Field", "Value"]],
      body: metaRows,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [255, 214, 0], textColor: 17 },
      margin: { left, right: 40 },
      columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 375 } },
    });

    y = doc.lastAutoTable.finalY + 10;

    doc.autoTable({
      startY: y,
      head: [["Section", "Notes"]],
      body: [
        ["Previous day’s activities", data.previousActivities || ""],
        ["Concerns from previous day", data.concerns || ""],
        ["Today’s planned activities briefing", data.plannedActivities || ""],
      ],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, valign: "top" },
      headStyles: { fillColor: [17, 24, 39], textColor: 255 },
      margin: { left, right: 40 },
      columnStyles: { 0: { cellWidth: 180 }, 1: { cellWidth: 335 } },
    });

    y = doc.lastAutoTable.finalY + 10;

    const pointsRows = DAILY_BRIEF_POINTS.map((p) => [p, data.points?.[p] ? "✓" : ""]);
    doc.autoTable({
      startY: y,
      head: [["Points discussed", ""]],
      body: pointsRows,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [255, 214, 0], textColor: 17 },
      margin: { left, right: 40 },
      columnStyles: { 0: { cellWidth: 445 }, 1: { cellWidth: 70 } },
    });

    y = doc.lastAutoTable.finalY + 10;

    doc.autoTable({
      startY: y,
      head: [["Compliance confirmations", "Answer"]],
      body: [
        ["Activities covered by RAMS / Work Instruction?", (data.coveredByRAMS || "").toUpperCase()],
        ["All control measures in place?", (data.controlsInPlace || "").toUpperCase()],
        ["Operatives compliant with PPE?", (data.ppeCompliant || "").toUpperCase()],
      ],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [17, 24, 39], textColor: 255 },
      margin: { left, right: 40 },
      columnStyles: { 0: { cellWidth: 445 }, 1: { cellWidth: 70 } },
    });

    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("MORNING BRIEFING SIGN-UP SHEET", left, 46);
    doc.setDrawColor(255, 214, 0);
    doc.setLineWidth(3);
    doc.line(left, 58, 555, 58);

    const att = (data.attendees || []).filter((a) => a.name || a.signature);
    const attRows = att.length
      ? att.map((a) => [a.name || "", a.date || prettyDate(data.date), a.signature || ""])
      : [["", "", ""]];

    doc.autoTable({
      startY: 78,
      head: [["Name", "Date", "Signature"]],
      body: attRows,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [255, 214, 0], textColor: 17 },
      margin: { left, right: 40 },
      columnStyles: { 0: { cellWidth: 200 }, 1: { cellWidth: 110 }, 2: { cellWidth: 205 } },
    });

    const fileDate = sanitizeFileName(prettyDate(data.date));
    const name = `Daily Morning Briefing - ${fileDate || "Record"}.pdf`;

    if (mode === "download") {
      doc.save(name);
      return;
    }

    // mode === "open" (preview in browser)
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  // ---------------- Views ----------------
  function renderHome() {
    setSubtitle("Choose a form (QR-friendly)");
    const root = appRoot();
    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">Forms</h1>
            <p class="sub">Tap a form to start immediately. Each link can become its own QR code.</p>
          </div>
          <div class="btnRow">
            <a class="btnGhost" href="#history">History</a>
          </div>
        </div>

        <div class="cardBody">
          <div class="tiles">
            <div class="tile">
              <div class="tileLeft">
                <p class="tileTitle">Daily Morning Briefing</p>
                <p class="tileSub">Fill on the phone → generate PDF.</p>
              </div>
              <div class="tileRight">
                <a class="btn" href="#daily-brief">Open</a>
                <a class="linkBtn" href="${TEMPLATES.dailyBrief}" target="_blank" rel="noopener noreferrer">Blank PDF</a>
              </div>
            </div>

            <div class="tile">
              <div class="tileLeft">
                <p class="tileTitle">Plant Checks</p>
                <p class="tileSub">Opens your existing Plant Checks QR app.</p>
              </div>
              <div class="tileRight">
                <button class="btn" id="openPlantChecks">Open</button>
              </div>
            </div>

            <div class="tile">
              <div class="tileLeft">
                <p class="tileTitle">Ground Disturbance Permit</p>
                <p class="tileSub">Next to build (same flow as Plant Checks).</p>
              </div>
              <div class="tileRight">
                <a class="btnAlt" href="#ground-disturbance">Open</a>
              </div>
            </div>

            <div class="tile">
              <div class="tileLeft">
                <p class="tileTitle">Hot Works Permit</p>
                <p class="tileSub">Next to build (same flow as Plant Checks).</p>
              </div>
              <div class="tileRight">
                <a class="btnAlt" href="#hot-works">Open</a>
              </div>
            </div>
          </div>

          <div class="divider"></div>
          <p class="muted">
            Tip: QR codes can point straight to a form, e.g. <b>#daily-brief</b> so the user opens the exact page.
          </p>
        </div>
      </div>
    `;

    $("#openPlantChecks")?.addEventListener("click", () => {
      if (!PLANT_CHECKS_URL) {
        alert("Plant Checks URL is not set yet in app.js (PLANT_CHECKS_URL).");
        return;
      }
      window.open(PLANT_CHECKS_URL, "_blank", "noopener,noreferrer");
    });
  }

  function renderDailyBrief() {
    setSubtitle("Daily Morning Briefing");
    const root = appRoot();

    const init = {
      projectTitle: "",
      workLocation: "",
      siteLocation: "",
      projectNo: "",
      briefingBy: "",
      jobTitle: "",
      date: todayISO(),
      personsAttending: "",
      previousActivities: "",
      wentAsPlanned: "yes",
      concerns: "",
      plannedActivities: "",
      points: DAILY_BRIEF_POINTS.reduce((acc, p) => ((acc[p] = false), acc), {}),
      coveredByRAMS: "yes",
      controlsInPlace: "yes",
      ppeCompliant: "yes",
      attendees: [],
    };

    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">Daily Morning Briefing</h1>
            <p class="sub">Fill the form, then generate a PDF. You can also open the blank template in the browser.</p>
          </div>
          <div class="btnRow">
            <a class="btnGhost" href="#home">Back</a>
            <a class="linkBtn" href="${TEMPLATES.dailyBrief}" target="_blank" rel="noopener noreferrer">Open blank PDF</a>
            <button class="btnAlt" id="saveBtn">Save</button>
            <button class="btn" id="pdfBtn">Download PDF</button>
          </div>
        </div>

        <div class="cardBody" id="dbBody"></div>
      </div>
    `;

    const body = $("#dbBody");
    body.innerHTML = `
      <div class="grid2">
        <div><label class="lbl">Project title</label><input class="inp" id="db_projectTitle" value="${escapeHtml(init.projectTitle)}"></div>
        <div><label class="lbl">Site location</label><input class="inp" id="db_siteLocation" value="${escapeHtml(init.siteLocation)}"></div>

        <div><label class="lbl">Work location</label><input class="inp" id="db_workLocation" value="${escapeHtml(init.workLocation)}"></div>
        <div><label class="lbl">Project no</label><input class="inp" id="db_projectNo" value="${escapeHtml(init.projectNo)}"></div>

        <div><label class="lbl">Briefing by</label><input class="inp" id="db_briefingBy" value="${escapeHtml(init.briefingBy)}"></div>
        <div><label class="lbl">Job title</label><input class="inp" id="db_jobTitle" value="${escapeHtml(init.jobTitle)}"></div>

        <div><label class="lbl">Date</label><input class="inp" type="date" id="db_date" value="${escapeHtml(init.date)}"></div>
        <div><label class="lbl">No. persons attending</label><input class="inp" id="db_personsAttending" value="${escapeHtml(init.personsAttending)}"></div>
      </div>

      <div class="divider"></div>

      <label class="lbl">Previous day’s activities</label>
      <textarea class="inp" rows="3" id="db_previousActivities">${escapeHtml(init.previousActivities)}</textarea>

      <div class="grid2" style="margin-top:12px;">
        <div>
          <label class="lbl">Did they go as planned?</label>
          <select class="inp" id="db_wentAsPlanned">
            <option value="yes" selected>Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label class="lbl">Any concerns from the previous day?</label>
          <input class="inp" id="db_concerns" value="${escapeHtml(init.concerns)}" placeholder="Short note (or leave blank)">
        </div>
      </div>

      <label class="lbl" style="margin-top:12px;">Today’s planned activities briefing</label>
      <textarea class="inp" rows="3" id="db_plannedActivities">${escapeHtml(init.plannedActivities)}</textarea>

      <div class="divider"></div>

      <h3 class="h1" style="font-size:16px; margin:0 0 10px;">Points discussed</h3>
      <div class="checkGrid" id="db_points"></div>

      <div class="divider"></div>

      <div class="grid3">
        <div>
          <label class="lbl">Covered by RAMS / Work Instruction?</label>
          <select class="inp" id="db_coveredByRAMS">
            <option value="yes" selected>Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label class="lbl">All control measures in place?</label>
          <select class="inp" id="db_controlsInPlace">
            <option value="yes" selected>Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label class="lbl">PPE compliant?</label>
          <select class="inp" id="db_ppeCompliant">
            <option value="yes" selected>Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>

      <div class="divider"></div>

      <h3 class="h1" style="font-size:16px; margin:0 0 10px;">Attendees (sign-up)</h3>
      <div id="db_attendees"></div>
      <button class="btnAlt" type="button" id="addAttendee">Add attendee</button>
    `;

    // points
    const pointsWrap = $("#db_points");
    DAILY_BRIEF_POINTS.forEach((p, idx) => {
      const row = document.createElement("label");
      row.className = "tickRow";
      row.innerHTML = `
        <input type="checkbox" id="pt_${idx}">
        <span>${escapeHtml(p)}</span>
      `;
      pointsWrap.appendChild(row);
    });

    const attendees = [];

    function renderAttendees() {
      const wrap = $("#db_attendees");
      wrap.innerHTML = "";

      if (!attendees.length) {
        const d = document.createElement("div");
        d.className = "muted";
        d.textContent = "No attendees added yet.";
        wrap.appendChild(d);
        return;
      }

      attendees.forEach((a, i) => {
        const block = document.createElement("div");
        block.innerHTML = `
          <div class="grid3">
            <div>
              <label class="lbl">Name</label>
              <input class="inp" data-i="${i}" data-f="name" value="${escapeHtml(a.name || "")}">
            </div>
            <div>
              <label class="lbl">Date</label>
              <input class="inp" data-i="${i}" data-f="date" value="${escapeHtml(a.date || "")}">
            </div>
            <div>
              <label class="lbl">Signature (type)</label>
              <input class="inp" data-i="${i}" data-f="sig" value="${escapeHtml(a.signature || "")}">
            </div>
          </div>
          <div style="margin-top:10px;">
            <button class="btnGhost" type="button" data-del="${i}">Remove</button>
          </div>
          <div class="divider"></div>
        `;
        wrap.appendChild(block);
      });

      wrap.querySelectorAll("input[data-i]").forEach((inp) => {
        inp.addEventListener("input", (e) => {
          const i = Number(e.target.dataset.i);
          const f = e.target.dataset.f;
          attendees[i] = attendees[i] || {};
          if (f === "name") attendees[i].name = e.target.value;
          if (f === "date") attendees[i].date = e.target.value;
          if (f === "sig") attendees[i].signature = e.target.value;
        });
      });

      wrap.querySelectorAll("button[data-del]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = Number(btn.dataset.del);
          attendees.splice(i, 1);
          renderAttendees();
        });
      });
    }

    $("#addAttendee").addEventListener("click", () => {
      attendees.push({ name: "", date: prettyDate($("#db_date").value), signature: "" });
      renderAttendees();
    });

    renderAttendees();

    function collect() {
      const data = {
        projectTitle: $("#db_projectTitle").value.trim(),
        siteLocation: $("#db_siteLocation").value.trim(),
        workLocation: $("#db_workLocation").value.trim(),
        projectNo: $("#db_projectNo").value.trim(),
        briefingBy: $("#db_briefingBy").value.trim(),
        jobTitle: $("#db_jobTitle").value.trim(),
        date: $("#db_date").value,
        personsAttending: $("#db_personsAttending").value.trim(),
        previousActivities: $("#db_previousActivities").value.trim(),
        wentAsPlanned: $("#db_wentAsPlanned").value,
        concerns: $("#db_concerns").value.trim(),
        plannedActivities: $("#db_plannedActivities").value.trim(),
        points: {},
        coveredByRAMS: $("#db_coveredByRAMS").value,
        controlsInPlace: $("#db_controlsInPlace").value,
        ppeCompliant: $("#db_ppeCompliant").value,
        attendees: attendees.map((a) => ({
          name: (a.name || "").trim(),
          date: (a.date || "").trim(),
          signature: (a.signature || "").trim(),
        })),
      };

      DAILY_BRIEF_POINTS.forEach((p, idx) => {
        data.points[p] = !!$(`#pt_${idx}`).checked;
      });

      return data;
    }

    $("#saveBtn").addEventListener("click", () => {
      const data = collect();
      addRecord({
        id: `db_${Date.now()}`,
        type: "daily-brief",
        title: "Daily Morning Briefing",
        createdAt: new Date().toISOString(),
        data,
      });
      showMsg(root, "Saved to History.", true);
    });

    $("#pdfBtn").addEventListener("click", () => {
      const data = collect();
      addRecord({
        id: `db_${Date.now()}`,
        type: "daily-brief",
        title: "Daily Morning Briefing",
        createdAt: new Date().toISOString(),
        data,
      });
      dailyBriefPdf(data, "download");
      showMsg(root, "PDF downloaded and saved to History.", true);
    });
  }

  function renderPlaceholder(formKey, title) {
    setSubtitle(title);
    const root = appRoot();
    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">${escapeHtml(title)}</h1>
            <p class="sub">We’ll build this next using the exact same “fill → PDF” flow.</p>
          </div>
          <div class="btnRow">
            <a class="btnGhost" href="#home">Back</a>
          </div>
        </div>
        <div class="cardBody">
          <p class="muted">
            When you’re ready, we’ll convert your permit template into a clean on-phone form and generate a PDF record.
          </p>
        </div>
      </div>
    `;
  }

  function renderHistory() {
    setSubtitle("Saved records");
    const root = appRoot();
    const records = loadRecords();

    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">History</h1>
            <p class="sub">Saved records on this device/browser.</p>
          </div>
          <div class="btnRow">
            <a class="btnGhost" href="#home">Back</a>
            <button class="btnAlt" id="clearBtn">Clear</button>
          </div>
        </div>
        <div class="cardBody">
          <div id="histList"></div>
        </div>
      </div>
    `;

    const list = $("#histList");
    if (!records.length) {
      list.innerHTML = `<p class="muted">No records saved yet.</p>`;
    } else {
      list.innerHTML = records
        .map((r) => {
          const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : "";
          return `
            <div class="tile" style="margin-bottom:10px;">
              <div class="tileLeft">
                <p class="tileTitle">${escapeHtml(r.title || r.type)}</p>
                <p class="tileSub">${escapeHtml(when)}</p>
              </div>
              <div class="tileRight">
                ${
                  r.type === "daily-brief"
                    ? `<button class="btn" data-dl="${escapeHtml(r.id)}">Download PDF</button>`
                    : ``
                }
              </div>
            </div>
          `;
        })
        .join("");

      list.querySelectorAll("button[data-dl]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.dl;
          const rec = records.find((x) => x.id === id);
          if (!rec) return;
          if (rec.type === "daily-brief") dailyBriefPdf(rec.data, "download");
        });
      });
    }

    $("#clearBtn").addEventListener("click", () => {
      localStorage.removeItem(RECORDS_KEY);
      renderHistory();
    });
  }

  function render() {
    const r = route();

    if (r === "home") return renderHome();
    if (r === "daily-brief") return renderDailyBrief();
    if (r === "ground-disturbance") return renderPlaceholder("ground-disturbance", "Ground Disturbance Permit");
    if (r === "hot-works") return renderPlaceholder("hot-works", "Hot Works Permit");
    if (r === "history") return renderHistory();

    // fallback
    location.hash = "#home";
  }

  function init() {
    setBuild();
    window.addEventListener("hashchange", render);
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
