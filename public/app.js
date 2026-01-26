/* public/app.js */
(() => {
  const BUILD = "v1.4";
  const APP_TITLE = "Red Folder ATL";

  // Templates (served by Cloudflare Pages)
  const TEMPLATES = {
    dailyBrief: "./templates/daily-briefing.pdf",
  };

  // Paste your Plant Checks URL (your existing QR Plant Checks app)
  const PLANT_CHECKS_URL = ""; // e.g. "https://plant-checks.pages.dev/"

  // Storage keys
  const RECORDS_KEY = "RFATL_RECORDS_V1";
  const PROJECTS_KEY = "RFATL_PROJECTS_V1";

  // Session-only project selection (forces choose-project again when reopening)
  const CURRENT_PROJECT_KEY = "RFATL_CURRENT_PROJECT_V1";

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

  const CATEGORIES = [
    { key: "daily", title: "Daily Checks", desc: "Daily paperwork and compliance checks." },
    { key: "weekly", title: "Weekly Checks", desc: "Weekly inspections and records (one per WC)." },
    { key: "monthly", title: "Monthly Checks", desc: "Monthly compliance checks and records." },
  ];

  const FORMS = {
    daily: [
      { key: "daily-brief", title: "Daily Morning Briefing", desc: "Fill on the phone → generate PDF.", blankPdf: TEMPLATES.dailyBrief, type: "internal" },
      { key: "plant-checks", title: "Plant Checks", desc: "Opens your existing Plant Checks QR app.", type: "external" },
      { key: "ground-disturbance", title: "Ground Disturbance Permit", desc: "Next to build (same flow).", type: "placeholder" },
      { key: "hot-works", title: "Hot Works Permit", desc: "Next to build (same flow).", type: "placeholder" },
    ],
    weekly: [
      { key: "weekly-safety", title: "Weekly Safety Site Inspection", desc: "To build next.", type: "placeholder" },
      { key: "weekly-ladder", title: "Weekly Ladder Inspection", desc: "To build next.", type: "placeholder" },
      { key: "weekly-tw", title: "Weekly Temporary Works Inspection", desc: "To build next.", type: "placeholder" },
    ],
    monthly: [
      { key: "monthly-pat", title: "PAT Testing Check", desc: "To build next.", type: "placeholder" },
      { key: "monthly-lifting", title: "Monthly Lifting Equipment Check", desc: "To build next.", type: "placeholder" },
    ],
  };

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

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ---------- Projects ----------
  function loadProjects() {
    const arr = loadJSON(PROJECTS_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveProjects(arr) {
    saveJSON(PROJECTS_KEY, arr);
  }

  function getCurrentProjectId() {
    return sessionStorage.getItem(CURRENT_PROJECT_KEY) || "";
  }

  function setCurrentProjectId(id) {
    if (!id) sessionStorage.removeItem(CURRENT_PROJECT_KEY);
    else sessionStorage.setItem(CURRENT_PROJECT_KEY, id);
    updateProjectPill();
  }

  function clearCurrentProject() {
    setCurrentProjectId("");
  }

  function getProjectById(id) {
    return loadProjects().find((p) => p.id === id) || null;
  }

  function getCurrentProject() {
    const id = getCurrentProjectId();
    return id ? getProjectById(id) : null;
  }

  function updateProjectPill() {
    const pill = $("#projectPill");
    const p = getCurrentProject();
    if (!pill) return;
    pill.textContent = p ? p.name : "No project";
    pill.title = p ? `Current project: ${p.name}` : "No project selected";
  }

  function upsertProject(project) {
    const projects = loadProjects();
    const idx = projects.findIndex((p) => p.id === project.id);
    if (idx >= 0) projects[idx] = project;
    else projects.unshift(project);
    saveProjects(projects);
  }

  function deleteProject(projectId) {
    const projects = loadProjects().filter((p) => p.id !== projectId);
    saveProjects(projects);
    if (getCurrentProjectId() === projectId) clearCurrentProject();
  }

  function touchProjectLastUsed(projectId) {
    const p = getProjectById(projectId);
    if (!p) return;
    p.lastUsedAt = new Date().toISOString();
    p.updatedAt = p.updatedAt || p.lastUsedAt;
    upsertProject(p);
  }

  // ---------- Records ----------
  function loadRecords() {
    const arr = loadJSON(RECORDS_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveRecords(records) {
    saveJSON(RECORDS_KEY, records);
  }

  function addRecord(record) {
    const all = loadRecords();
    all.unshift(record);
    saveRecords(all.slice(0, 250));
  }

  function findLastRecordByProject(projectId, type) {
    const records = loadRecords();
    return records.find((r) => r.projectId === projectId && r.type === type) || null;
  }

  // ---------- Routing ----------
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
    updateProjectPill();
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

  function requireProjectOrRedirect(backRouteForMessage = "home") {
    const p = getCurrentProject();
    if (p) return p;
    location.hash = "#home";
    sessionStorage.setItem("RFATL_NEED_PROJECT", backRouteForMessage);
    return null;
  }

  function headerHomeButtonHtml() {
    return `<button class="btnGhost" id="homeBtn" type="button">Home</button>`;
  }

  function wireHomeBtn() {
    const btn = $("#homeBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      clearCurrentProject();
      location.hash = "#home";
    });
  }

  // ---------- Signature Pad (Modal) ----------
  function openSignaturePad({ initialDataUrl = "", onSave }) {
    // Remove any existing modal
    const old = document.getElementById("sigModal");
    if (old) old.remove();

    const modal = document.createElement("div");
    modal.id = "sigModal";
    modal.innerHTML = `
      <div style="
        position:fixed; inset:0; background:rgba(0,0,0,.45);
        display:flex; align-items:center; justify-content:center; padding:16px; z-index:9999;">
        <div style="
          width:min(720px, 100%); background:#fff; border-radius:16px;
          box-shadow:0 10px 30px rgba(0,0,0,.25); overflow:hidden;">
          <div style="padding:14px 16px; border-bottom:1px solid #e5e7eb; display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div style="min-width:0;">
              <div style="font-weight:700;">Draw signature</div>
              <div style="font-size:12px; color:#6b7280;">Use finger/mouse. Tap Clear to redo.</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button id="sigClear" class="btnAlt" type="button">Clear</button>
              <button id="sigCancel" class="btnGhost" type="button">Cancel</button>
              <button id="sigSave" class="btn" type="button">Save</button>
            </div>
          </div>

          <div style="padding:14px 16px;">
            <div style="border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; background:#fff;">
              <canvas id="sigCanvas" style="width:100%; height:220px; display:block; touch-action:none;"></canvas>
            </div>
            <div style="margin-top:10px; font-size:12px; color:#6b7280;">
              Tip: sign bigger than you think — it will scale nicely onto the PDF.
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const canvas = document.getElementById("sigCanvas");
    const ctx = canvas.getContext("2d");

    // Fit canvas to container with DPR
    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#111";
    }
    resizeCanvas();

    // Load existing signature if any
    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => {
        // draw image scaled to fit
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
        const iw = img.width;
        const ih = img.height;
        const scale = Math.min(rect.width / iw, rect.height / ih);
        const w = iw * scale;
        const h = ih * scale;
        const x = (rect.width - w) / 2;
        const y = (rect.height - h) / 2;
        ctx.drawImage(img, x, y, w, h);
      };
      img.src = initialDataUrl;
    }

    let drawing = false;
    let lastX = 0;
    let lastY = 0;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      return { x, y };
    }

    function startDraw(e) {
      drawing = true;
      const p = getPos(e);
      lastX = p.x;
      lastY = p.y;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
    }

    function moveDraw(e) {
      if (!drawing) return;
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x;
      lastY = p.y;
    }

    function endDraw() {
      drawing = false;
      ctx.closePath();
    }

    // Pointer events
    canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      startDraw(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      e.preventDefault();
      moveDraw(e);
    });
    canvas.addEventListener("pointerup", (e) => {
      e.preventDefault();
      endDraw();
      canvas.releasePointerCapture?.(e.pointerId);
    });
    canvas.addEventListener("pointercancel", (e) => {
      e.preventDefault();
      endDraw();
    });

    function close() {
      modal.remove();
    }

    document.getElementById("sigCancel").addEventListener("click", close);
    document.getElementById("sigClear").addEventListener("click", () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
    });

    document.getElementById("sigSave").addEventListener("click", () => {
      // Export at a sensible size to keep localStorage small
      const exportW = 520;
      const exportH = 180;
      const tmp = document.createElement("canvas");
      tmp.width = exportW;
      tmp.height = exportH;
      const tctx = tmp.getContext("2d");

      // Keep transparent background; draw current canvas scaled to tmp
      const img = new Image();
      img.onload = () => {
        tctx.clearRect(0, 0, exportW, exportH);
        tctx.drawImage(img, 0, 0, exportW, exportH);
        const dataUrl = tmp.toDataURL("image/png");
        onSave?.(dataUrl);
        close();
      };
      img.src = canvas.toDataURL("image/png");
    });

    // Handle responsive changes
    window.addEventListener("resize", resizeCanvas, { once: true });
  }

  // ---------- PDF: Daily Brief ----------
  function dailyBriefPdf(data) {
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
        ["Covered by RAMS / Work Instruction?", (data.coveredByRAMS || "").toUpperCase()],
        ["All control measures in place?", (data.controlsInPlace || "").toUpperCase()],
        ["PPE compliant?", (data.ppeCompliant || "").toUpperCase()],
      ],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [17, 24, 39], textColor: 255 },
      margin: { left, right: 40 },
      columnStyles: { 0: { cellWidth: 445 }, 1: { cellWidth: 70 } },
    });

    // Page 2: Sign-up
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("MORNING BRIEFING SIGN-UP SHEET", left, 46);
    doc.setDrawColor(255, 214, 0);
    doc.setLineWidth(3);
    doc.line(left, 58, 555, 58);

    const att = (data.attendees || []).filter((a) => a.name || a.signatureDataUrl);
    const attRows = att.length
      ? att.map((a) => [a.name || "", a.date || prettyDate(data.date), ""]) // signature cell drawn as image
      : [["", "", ""]];

    // Map signature data by row index (body rows)
    const sigByRow = att.map((a) => a.signatureDataUrl || "");

    doc.autoTable({
      startY: 78,
      head: [["Name", "Date", "Signature"]],
      body: attRows,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, minCellHeight: 36 },
      headStyles: { fillColor: [255, 214, 0], textColor: 17 },
      margin: { left, right: 40 },
      columnStyles: { 0: { cellWidth: 200 }, 1: { cellWidth: 110 }, 2: { cellWidth: 205 } },
      didDrawCell: (hookData) => {
        // Draw signature image into body cells of the Signature column
        if (hookData.section !== "body") return;
        if (hookData.column.index !== 2) return;

        const rowIndex = hookData.row.index;
        const dataUrl = sigByRow[rowIndex];
        if (!dataUrl) return;

        const x = hookData.cell.x + 4;
        const y = hookData.cell.y + 4;
        const w = hookData.cell.width - 8;
        const h = hookData.cell.height - 8;

        try {
          doc.addImage(dataUrl, "PNG", x, y, w, h, undefined, "FAST");
        } catch {
          // If addImage fails for any reason, just skip the image
        }
      },
    });

    const fileDate = sanitizeFileName(prettyDate(data.date));
    const fileProj = sanitizeFileName(data.projectTitle || "Project");
    doc.save(`Daily Morning Briefing - ${fileProj} - ${fileDate || "Record"}.pdf`);
  }

  // ---------- UI Tiles ----------
  function tileHtml({ title, desc, openHref, blankPdfHref, openText = "Open", blankText = "Blank PDF" }) {
    const blankBtn = blankPdfHref
      ? `<a class="linkBtn" href="${escapeHtml(blankPdfHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(blankText)}</a>`
      : "";

    return `
      <div class="tile">
        <div class="tileLeft">
          <p class="tileTitle">${escapeHtml(title)}</p>
          <p class="tileSub">${escapeHtml(desc || "")}</p>
        </div>
        <div class="tileRight">
          ${openHref ? `<a class="btn" href="${escapeHtml(openHref)}">${escapeHtml(openText)}</a>` : ""}
          ${blankBtn}
        </div>
      </div>
    `;
  }

  // ---------- Views ----------
  function renderHome() {
    const root = appRoot();

    const projects = loadProjects().slice().sort((a, b) => {
      const ta = a.lastUsedAt || a.updatedAt || a.createdAt || "";
      const tb = b.lastUsedAt || b.updatedAt || b.createdAt || "";
      return tb.localeCompare(ta);
    });

    setSubtitle("Choose a project");

    const need = sessionStorage.getItem("RFATL_NEED_PROJECT");
    sessionStorage.removeItem("RFATL_NEED_PROJECT");

    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">Choose a project</h1>
            <p class="sub">Pick the job you’re working on today. Projects are saved on this device, but you must choose each session.</p>
          </div>
          <div class="btnRow">
            <a class="btnGhost" href="#history">History</a>
            <a class="btnAlt" href="#projects">Manage projects</a>
          </div>
        </div>

        <div class="cardBody" id="homeBody"></div>
      </div>
    `;

    const body = $("#homeBody");

    if (need) {
      showMsg(body.parentElement, "Select a project first (so forms can prefill site / crew / details).", false);
    }

    body.innerHTML = `
      <div class="tiles" id="projTiles"></div>
      <div class="divider"></div>
      <button class="btn" id="createProjectBtn">Create new project</button>
      <p class="muted" style="margin-top:10px;">Tip: once a project is created, Daily Briefing will prefill site / location / lads automatically.</p>
    `;

    const tiles = $("#projTiles");
    tiles.innerHTML = projects.length
      ? projects.map((p) =>
          tileHtml({
            title: p.name,
            desc: `${p.projectNo ? `Project No: ${p.projectNo} • ` : ""}${p.siteLocation ? `Site: ${p.siteLocation}` : "No site set yet"}`,
            openHref: `#select-project:${encodeURIComponent(p.id)}`,
            openText: "Select",
          })
        ).join("")
      : `<p class="muted">No projects yet. Create one to get started.</p>`;

    $("#createProjectBtn").addEventListener("click", () => {
      location.hash = "#project-new";
    });
  }

  function renderProjectsManager() {
    const root = appRoot();
    const projects = loadProjects().slice().sort((a, b) => {
      const ta = a.lastUsedAt || a.updatedAt || a.createdAt || "";
      const tb = b.lastUsedAt || b.updatedAt || b.createdAt || "";
      return tb.localeCompare(ta);
    });

    setSubtitle("Manage projects");

    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">Projects</h1>
            <p class="sub">Create, edit, delete, or select a project.</p>
          </div>
          <div class="btnRow">
            ${headerHomeButtonHtml()}
            <a class="btnAlt" href="#project-new">Create</a>
          </div>
        </div>

        <div class="cardBody">
          <div class="tiles" id="projList"></div>
        </div>
      </div>
    `;
    wireHomeBtn();

    const list = $("#projList");
    if (!projects.length) {
      list.innerHTML = `<p class="muted">No projects yet.</p>`;
      return;
    }

    list.innerHTML = projects
      .map(
        (p) => `
      <div class="tile">
        <div class="tileLeft">
          <p class="tileTitle">${escapeHtml(p.name)}</p>
          <p class="tileSub">
            ${p.projectNo ? `Project No: ${escapeHtml(p.projectNo)} • ` : ""}
            ${p.siteLocation ? `Site: ${escapeHtml(p.siteLocation)}` : "No site set"}
          </p>
        </div>
        <div class="tileRight">
          <a class="btn" href="#select-project:${encodeURIComponent(p.id)}">Select</a>
          <a class="btnAlt" href="#project-edit:${encodeURIComponent(p.id)}">Edit</a>
          <button class="btnGhost" data-del="${escapeHtml(p.id)}">Delete</button>
        </div>
      </div>
    `
      )
      .join("");

    root.querySelectorAll("button[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-del");
        const p = getProjectById(id);
        if (!p) return;
        const ok = confirm(`Delete project "${p.name}"? This does not delete saved PDFs, only the project profile.`);
        if (!ok) return;
        deleteProject(id);
        renderProjectsManager();
      });
    });
  }

  function renderProjectForm(mode, projectId) {
    const root = appRoot();
    const isEdit = mode === "edit";
    const existing = isEdit ? getProjectById(projectId) : null;

    setSubtitle(isEdit ? "Edit project" : "Create project");

    const init = existing || {
      id: `p_${Date.now()}`,
      name: "",
      projectNo: "",
      siteLocation: "",
      workLocation: "",
      defaultBriefingBy: "",
      defaultJobTitle: "",
      crew: [],
      createdAt: new Date().toISOString(),
      updatedAt: "",
      lastUsedAt: "",
    };

    const crewText = (init.crew || []).join("\n");

    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">${isEdit ? "Edit project" : "Create project"}</h1>
            <p class="sub">Set this once. Forms will prefill automatically for this project.</p>
          </div>
          <div class="btnRow">
            ${headerHomeButtonHtml()}
            <a class="btnGhost" href="#projects">Back</a>
            <button class="btn" id="saveProjectBtn">Save</button>
          </div>
        </div>

        <div class="cardBody">
          <div class="grid2">
            <div>
              <label class="lbl">Project name (shown in list)</label>
              <input class="inp" id="p_name" value="${escapeHtml(init.name)}" placeholder="e.g. Job 836 • Sizewell C • Cofferdam">
            </div>
            <div>
              <label class="lbl">Project number</label>
              <input class="inp" id="p_projectNo" value="${escapeHtml(init.projectNo)}" placeholder="e.g. 836">
            </div>

            <div>
              <label class="lbl">Site location (default)</label>
              <input class="inp" id="p_siteLocation" value="${escapeHtml(init.siteLocation)}" placeholder="e.g. Sizewell">
            </div>
            <div>
              <label class="lbl">Work location (default)</label>
              <input class="inp" id="p_workLocation" value="${escapeHtml(init.workLocation)}" placeholder="e.g. Cofferdam / Pit W1.035">
            </div>

            <div>
              <label class="lbl">Default briefing by</label>
              <input class="inp" id="p_briefingBy" value="${escapeHtml(init.defaultBriefingBy)}" placeholder="e.g. Aureliu Nica">
            </div>
            <div>
              <label class="lbl">Default job title</label>
              <input class="inp" id="p_jobTitle" value="${escapeHtml(init.defaultJobTitle)}" placeholder="e.g. Site Manager">
            </div>
          </div>

          <div class="divider"></div>

          <label class="lbl">Crew / lads list (one name per line)</label>
          <textarea class="inp" rows="10" id="p_crew" placeholder="e.g.
Aureliu Nica
Alin Pop
John Smith">${escapeHtml(crewText)}</textarea>

          <p class="muted" style="margin-top:10px;">
            This list will auto-create the sign-up lines in the Daily Briefing.
          </p>
        </div>
      </div>
    `;
    wireHomeBtn();

    $("#saveProjectBtn").addEventListener("click", () => {
      const name = $("#p_name").value.trim();
      if (!name) {
        showMsg(root, "Project name is required.", false);
        return;
      }

      const crewLines = $("#p_crew").value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const saved = {
        ...init,
        name,
        projectNo: $("#p_projectNo").value.trim(),
        siteLocation: $("#p_siteLocation").value.trim(),
        workLocation: $("#p_workLocation").value.trim(),
        defaultBriefingBy: $("#p_briefingBy").value.trim(),
        defaultJobTitle: $("#p_jobTitle").value.trim(),
        crew: crewLines,
        updatedAt: new Date().toISOString(),
      };

      upsertProject(saved);
      showMsg(root, "Project saved.", true);

      setCurrentProjectId(saved.id);
      location.hash = "#dashboard";
    });
  }

  function renderDashboard() {
    const project = requireProjectOrRedirect("home");
    if (!project) return;

    setSubtitle(`Project: ${project.name}`);

    const root = appRoot();

    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">Current project</h1>
            <p class="sub">Now pick Daily / Weekly / Monthly.</p>
          </div>
          <div class="btnRow">
            ${headerHomeButtonHtml()}
            <a class="btnAlt" href="#projects">Change project</a>
            <a class="btnGhost" href="#history">History</a>
          </div>
        </div>

        <div class="cardBody">
          <div class="tiles" id="catTiles"></div>
          <div class="divider"></div>
          <p class="muted">Current project is saved only for this tab/session. If you close the tab and reopen the link, you’ll choose again.</p>
        </div>
      </div>
    `;
    wireHomeBtn();

    const catTiles = $("#catTiles");
    catTiles.innerHTML = CATEGORIES.map((c) =>
      tileHtml({
        title: c.title,
        desc: c.desc,
        openHref: `#${c.key}`,
        openText: "Open",
      })
    ).join("");
  }

  function renderCategory(catKey) {
    const project = requireProjectOrRedirect("dashboard");
    if (!project) return;

    const cat = CATEGORIES.find((c) => c.key === catKey);
    if (!cat) {
      location.hash = "#dashboard";
      return;
    }

    setSubtitle(`${cat.title} • ${project.name}`);
    const root = appRoot();

    const forms = FORMS[catKey] || [];

    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">${escapeHtml(cat.title)}</h1>
            <p class="sub">${escapeHtml(cat.desc)} Prefill is active for: <b>${escapeHtml(project.name)}</b></p>
          </div>
          <div class="btnRow">
            ${headerHomeButtonHtml()}
            <a class="btnGhost" href="#dashboard">Back</a>
            <a class="btnAlt" href="#projects">Change project</a>
          </div>
        </div>

        <div class="cardBody">
          <div class="tiles" id="formTiles"></div>
        </div>
      </div>
    `;
    wireHomeBtn();

    const formTiles = $("#formTiles");
    formTiles.innerHTML = forms
      .map((f) => {
        if (f.type === "external") {
          return `
            <div class="tile">
              <div class="tileLeft">
                <p class="tileTitle">${escapeHtml(f.title)}</p>
                <p class="tileSub">${escapeHtml(f.desc || "")}</p>
              </div>
              <div class="tileRight">
                <button class="btn" data-open-external="${escapeHtml(f.key)}">Open</button>
              </div>
            </div>
          `;
        }

        if (f.type === "internal") {
          return tileHtml({
            title: f.title,
            desc: f.desc,
            openHref: `#${f.key}`,
            blankPdfHref: f.blankPdf,
          });
        }

        return tileHtml({
          title: f.title,
          desc: f.desc,
          openHref: `#${f.key}`,
          openText: "Open",
        });
      })
      .join("");

    root.querySelectorAll("button[data-open-external]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-open-external");
        if (key === "plant-checks") {
          if (!PLANT_CHECKS_URL) {
            alert("Plant Checks URL is not set yet in app.js (PLANT_CHECKS_URL).");
            return;
          }
          window.open(PLANT_CHECKS_URL, "_blank", "noopener,noreferrer");
        }
      });
    });
  }

  function renderDailyBrief() {
    const project = requireProjectOrRedirect("daily-brief");
    if (!project) return;

    touchProjectLastUsed(project.id);

    setSubtitle(`Daily Briefing • ${project.name}`);
    const root = appRoot();

    const last = findLastRecordByProject(project.id, "daily-brief");
    const lastData = last?.data || {};

    const init = {
      projectTitle: project.name || "",
      projectNo: project.projectNo || "",
      siteLocation: project.siteLocation || "",
      workLocation: project.workLocation || "",
      briefingBy: lastData.briefingBy || project.defaultBriefingBy || "",
      jobTitle: lastData.jobTitle || project.defaultJobTitle || "",
      date: todayISO(),
      personsAttending: lastData.personsAttending || "",
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

    const crewNames =
      (project.crew && project.crew.length ? project.crew : null) ||
      (Array.isArray(lastData.attendees) ? lastData.attendees.map((a) => a.name).filter(Boolean) : []) ||
      [];

    const attendees = crewNames.map((name) => ({
      name,
      date: prettyDate(init.date),
      signatureDataUrl: "",
    }));

    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">Daily Morning Briefing</h1>
            <p class="sub">Project: <b>${escapeHtml(project.name)}</b> • Fields auto-filled from Project + last completion.</p>
          </div>
          <div class="btnRow">
            ${headerHomeButtonHtml()}
            <a class="btnGhost" href="#daily">Back</a>
            <a class="btnAlt" href="#projects">Change project</a>
            ${TEMPLATES.dailyBrief ? `<a class="linkBtn" href="${escapeHtml(TEMPLATES.dailyBrief)}" target="_blank" rel="noopener noreferrer">Blank PDF</a>` : ""}
            <button class="btnAlt" id="saveBtn">Save</button>
            <button class="btn" id="pdfBtn">Download PDF</button>
          </div>
        </div>

        <div class="cardBody" id="dbBody"></div>
      </div>
    `;
    wireHomeBtn();

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
      <textarea class="inp" rows="3" id="db_previousActivities"></textarea>

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
          <input class="inp" id="db_concerns" value="" placeholder="Short note (or leave blank)">
        </div>
      </div>

      <label class="lbl" style="margin-top:12px;">Today’s planned activities briefing</label>
      <textarea class="inp" rows="3" id="db_plannedActivities"></textarea>

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
      <p class="muted" style="margin:0 0 10px;">Auto-filled from the Project crew list. Remove/add as needed.</p>
      <div id="db_attendees"></div>
      <button class="btnAlt" type="button" id="addAttendee">Add attendee</button>
    `;

    const pointsWrap = $("#db_points");
    DAILY_BRIEF_POINTS.forEach((p, idx) => {
      const row = document.createElement("label");
      row.className = "tickRow";
      row.innerHTML = `<input type="checkbox" id="pt_${idx}"><span>${escapeHtml(p)}</span>`;
      pointsWrap.appendChild(row);
    });

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
        const hasSig = !!a.signatureDataUrl;

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
              <label class="lbl">Signature (draw)</label>
              <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                <button class="btnAlt" type="button" data-sig="${i}">${hasSig ? "Edit signature" : "Draw signature"}</button>
                ${hasSig ? `<button class="btnGhost" type="button" data-sig-clear="${i}">Clear</button>` : ""}
                <div style="display:flex; align-items:center; gap:8px;">
                  ${hasSig ? `<img src="${escapeHtml(a.signatureDataUrl)}" alt="signature" style="height:34px; width:auto; border:1px solid #e5e7eb; border-radius:8px; background:#fff; padding:2px;">`
                            : `<span style="font-size:12px; color:#6b7280;">No signature</span>`}
                </div>
              </div>
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
        });
      });

      wrap.querySelectorAll("button[data-sig]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-sig"));
          const current = attendees[i]?.signatureDataUrl || "";
          openSignaturePad({
            initialDataUrl: current,
            onSave: (dataUrl) => {
              attendees[i].signatureDataUrl = dataUrl;
              renderAttendees();
            },
          });
        });
      });

      wrap.querySelectorAll("button[data-sig-clear]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-sig-clear"));
          attendees[i].signatureDataUrl = "";
          renderAttendees();
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
      attendees.push({ name: "", date: prettyDate($("#db_date").value), signatureDataUrl: "" });
      renderAttendees();
    });

    $("#db_date").addEventListener("change", () => {
      const d = prettyDate($("#db_date").value);
      attendees.forEach((a) => (a.date = d));
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
          signatureDataUrl: a.signatureDataUrl || "",
        })),
      };

      DAILY_BRIEF_POINTS.forEach((p, idx) => {
        data.points[p] = !!$(`#pt_${idx}`).checked;
      });

      return data;
    }

    function persistProjectCrewFromBriefing(collected) {
      const p = getProjectById(project.id);
      if (!p) return;

      const names = (collected.attendees || [])
        .map((a) => (a.name || "").trim())
        .filter(Boolean);

      if (names.length) {
        p.crew = Array.from(new Set(names));
        p.updatedAt = new Date().toISOString();
        p.lastUsedAt = p.updatedAt;
        upsertProject(p);
      }
    }

    $("#saveBtn").addEventListener("click", () => {
      const data = collect();

      addRecord({
        id: `db_${Date.now()}`,
        type: "daily-brief",
        title: "Daily Morning Briefing",
        createdAt: new Date().toISOString(),
        projectId: project.id,
        projectName: project.name,
        data,
      });

      persistProjectCrewFromBriefing(data);
      touchProjectLastUsed(project.id);

      showMsg(root, "Saved. Next time this project will prefill from what you used today.", true);
    });

    $("#pdfBtn").addEventListener("click", () => {
      const data = collect();

      addRecord({
        id: `db_${Date.now()}`,
        type: "daily-brief",
        title: "Daily Morning Briefing",
        createdAt: new Date().toISOString(),
        projectId: project.id,
        projectName: project.name,
        data,
      });

      persistProjectCrewFromBriefing(data);
      touchProjectLastUsed(project.id);

      dailyBriefPdf(data);
      showMsg(root, "PDF downloaded and saved to History.", true);
    });
  }

  function renderPlaceholder(title, backHash) {
    const project = requireProjectOrRedirect(title);
    if (!project) return;

    setSubtitle(`${title} • ${project.name}`);
    const root = appRoot();

    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">${escapeHtml(title)}</h1>
            <p class="sub">Project: <b>${escapeHtml(project.name)}</b> • We will build this next with prefill + PDF output.</p>
          </div>
          <div class="btnRow">
            ${headerHomeButtonHtml()}
            <a class="btnGhost" href="${escapeHtml(backHash || "#dashboard")}">Back</a>
            <a class="btnAlt" href="#projects">Change project</a>
          </div>
        </div>
        <div class="cardBody">
          <p class="muted">Send me the exact permit template you want (PDF or Word) and we’ll replicate it as a phone-friendly form that generates a tidy PDF.</p>
        </div>
      </div>
    `;
    wireHomeBtn();
  }

  function renderHistory() {
    const root = appRoot();
    const records = loadRecords();

    const current = getCurrentProject();
    setSubtitle(current ? `History • ${current.name}` : "History");

    root.innerHTML = `
      <div class="card">
        <div class="cardHead">
          <div style="min-width:0;">
            <h1 class="h1">History</h1>
            <p class="sub">Saved records on this device/browser.</p>
          </div>
          <div class="btnRow">
            ${headerHomeButtonHtml()}
            <button class="btnAlt" id="clearBtn">Clear</button>
          </div>
        </div>
        <div class="cardBody">
          <div class="tiles" id="histList"></div>
        </div>
      </div>
    `;
    wireHomeBtn();

    const list = $("#histList");
    if (!records.length) {
      list.innerHTML = `<p class="muted">No records saved yet.</p>`;
    } else {
      const filtered = current ? records.filter((r) => r.projectId === current.id) : records;

      list.innerHTML = filtered
        .map((r) => {
          const when = r.createdAt ? new Date(r.createdAt).toLocaleString() : "";
          const proj = r.projectName ? ` • ${r.projectName}` : "";
          return `
            <div class="tile">
              <div class="tileLeft">
                <p class="tileTitle">${escapeHtml(r.title || r.type)}${escapeHtml(proj)}</p>
                <p class="tileSub">${escapeHtml(when)}</p>
              </div>
              <div class="tileRight">
                ${r.type === "daily-brief" ? `<button class="btn" data-dl="${escapeHtml(r.id)}">Download PDF</button>` : ""}
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
          if (rec.type === "daily-brief") dailyBriefPdf(rec.data);
        });
      });
    }

    $("#clearBtn").addEventListener("click", () => {
      const ok = confirm("Clear all saved records on this device?");
      if (!ok) return;
      localStorage.removeItem(RECORDS_KEY);
      renderHistory();
    });
  }

  // ---------- Router ----------
  function render() {
    updateProjectPill();
    const r = route();

    if (r.startsWith("select-project:")) {
      const id = decodeURIComponent(r.split(":")[1] || "");
      const p = getProjectById(id);
      if (p) {
        setCurrentProjectId(p.id);
        touchProjectLastUsed(p.id);
      }
      location.hash = "#dashboard";
      return;
    }

    if (r === "projects") return renderProjectsManager();
    if (r === "project-new") return renderProjectForm("new");
    if (r.startsWith("project-edit:")) {
      const id = decodeURIComponent(r.split(":")[1] || "");
      return renderProjectForm("edit", id);
    }

    if (r === "home") return renderHome();
    if (r === "dashboard") return renderDashboard();

    if (r === "daily") return renderCategory("daily");
    if (r === "weekly") return renderCategory("weekly");
    if (r === "monthly") return renderCategory("monthly");

    if (r === "daily-brief") return renderDailyBrief();
    if (r === "ground-disturbance") return renderPlaceholder("Ground Disturbance Permit", "#daily");
    if (r === "hot-works") return renderPlaceholder("Hot Works Permit", "#daily");

    if (r === "weekly-safety") return renderPlaceholder("Weekly Safety Site Inspection", "#weekly");
    if (r === "weekly-ladder") return renderPlaceholder("Weekly Ladder Inspection", "#weekly");
    if (r === "weekly-tw") return renderPlaceholder("Weekly Temporary Works Inspection", "#weekly");

    if (r === "monthly-pat") return renderPlaceholder("PAT Testing Check", "#monthly");
    if (r === "monthly-lifting") return renderPlaceholder("Monthly Lifting Equipment Check", "#monthly");

    if (r === "history") return renderHistory();

    location.hash = "#home";
  }

  function init() {
    setBuild();
    window.addEventListener("hashchange", render);
    if (!location.hash) location.hash = "#home";
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
