/* public/app.js */
(() => {
  const BUILD = "v0.2";
  const STORAGE_KEY = "RFATL_SUBMISSIONS_V1";

  const $ = (id) => document.getElementById(id);

  const CAT_LABELS = {
    daily: "Daily Checks",
    weekly: "Weekly Checks",
    monthly: "Monthly Checks",
  };

  const CAT_HINTS = {
    daily: "Complete the daily checklist and download the PDF record for today.",
    weekly: "Complete once per Week Commencing (WC) and download the PDF record.",
    monthly: "Complete once per calendar month and download the PDF record.",
  };

  // Starter checklists based on your Excel screenshot (we can expand any time)
  const CHECKLISTS = [
    {
      id: "sm_daily_pack",
      category: "daily",
      title: "Site Manager Daily Pack",
      description: "Daily compliance and paperwork checks (single PDF record).",
      items: [
        { key: "daily_brief", label: "Daily brief completed" },
        { key: "plant_check_sheet", label: "Plant operative check sheet completed" },
        { key: "ground_disturbance_permit", label: "Ground disturbance permit (if required)" },
        { key: "hot_work_permit", label: "Hot work permit (if required)" },
        { key: "confined_space_permit", label: "Confined space permit (if required)" },
        { key: "excavation_inspection", label: "Excavation inspection checks completed" },
        { key: "daily_diary", label: "Daily diary completed" },
        { key: "photos", label: "Photos recorded (if required)" },
        { key: "permit_to_pump", label: "Permit to pump (if required)" },
        { key: "havs", label: "HAVS assessment checked (if applicable)" },
        { key: "safety_equipment_daily", label: "Safety equipment daily inspection completed" },
        { key: "sinking_records", label: "Sinking records updated (if applicable)" },
        { key: "auger_bore_record", label: "Auger bore record updated (if applicable)" },
        { key: "pipe_jacking_record", label: "Pipe jacking record updated (if applicable)" },
      ],
    },
    {
      id: "sm_weekly_pack",
      category: "weekly",
      title: "Site Manager Weekly Pack",
      description: "Weekly checks (one PDF per WC).",
      items: [
        { key: "safety_site_inspection", label: "Safety site inspection completed" },
        { key: "toolbox_talk", label: "Toolbox talk delivered and recorded" },
        { key: "loler", label: "LOLER checks up to date" },
        { key: "puwer", label: "PUWER checks up to date" },
        { key: "ladder_inspection", label: "Ladder inspection completed" },
        { key: "tw_inspection", label: "Temporary Works inspection completed" },
        { key: "fire_extinguishers", label: "Fire extinguisher inspection completed" },
        { key: "survey_calibration", label: "Survey calibration equipment checked" },
      ],
    },
    {
      id: "sm_monthly_pack",
      category: "monthly",
      title: "Site Manager Monthly Pack",
      description: "Monthly checks (one PDF per calendar month).",
      items: [
        { key: "lifting_equipment", label: "Lifting equipment checks up to date" },
        { key: "pat_testing", label: "PAT testing of electrical tools up to date" },
      ],
    },
  ];

  const STATUS = [
    { key: "done", label: "Done" },
    { key: "not_done", label: "Not Done" },
    { key: "na", label: "N/A" },
  ];

  function getParam(name) {
    const u = new URL(window.location.href);
    return u.searchParams.get(name) || "";
  }

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

  function mondayOf(dateISO) {
    const d = new Date(dateISO + "T00:00:00");
    const day = d.getDay(); // 0 Sun ... 6 Sat
    const diff = (day === 0 ? -6 : 1) - day; // move to Monday
    d.setDate(d.getDate() + diff);
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }

  function monthISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  }

  function prettyDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
  }

  function uid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now();
  }

  function loadSubmissions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveSubmissions(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }

  function addSubmission(sub) {
    const all = loadSubmissions();
    all.unshift(sub);
    const trimmed = all.slice(0, 100);
    saveSubmissions(trimmed);
  }

  function deleteSubmission(id) {
    const all = loadSubmissions().filter((x) => x.uid !== id);
    saveSubmissions(all);
  }

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function getChecklistById(id) {
    return CHECKLISTS.find((c) => c.id === id) || null;
  }

  function sanitizeFileName(s) {
    return String(s || "")
      .replaceAll(/[\/\\:*?"<>|]/g, "-")
      .replaceAll(/\s+/g, " ")
      .trim();
  }

  // ---------------- PDF ----------------
  function generatePDF(submission) {
    const jspdfNS = window.jspdf;
    if (!jspdfNS?.jsPDF) {
      alert("PDF library not loaded. Please refresh the page.");
      return;
    }

    const doc = new jspdfNS.jsPDF({ unit: "pt", format: "a4" });

    const title = "RED FOLDER ATL";
    const checklistTitle = submission.title || "Checklist";
    const meta = submission.meta || {};
    const createdAt = submission.createdAt ? new Date(submission.createdAt) : new Date();

    const left = 40;
    let y = 46;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, left, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${createdAt.toLocaleString()}`, left, y + 16);

    doc.setDrawColor(255, 214, 0);
    doc.setLineWidth(3);
    doc.line(left, y + 28, 555, y + 28);

    y += 52;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(checklistTitle, left, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(submission.category ? `Frequency: ${submission.category.toUpperCase()}` : "", left, y);
    y += 18;

    const periodLabel = submission.periodLabel || "Date";
    const metaRows = [
      ["Project", meta.project || ""],
      ["Project No.", meta.projectNo || ""],
      ["Site", meta.site || ""],
      ["Supervisor", meta.supervisor || ""],
      [periodLabel, meta.periodPretty || meta.period || ""],
      ["Completed by", meta.completedBy || ""],
    ];

    doc.autoTable({
      startY: y,
      head: [["Field", "Value"]],
      body: metaRows,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [255, 214, 0], textColor: 17 },
      columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 405 } },
      margin: { left, right: 40 },
    });

    y = doc.lastAutoTable.finalY + 14;

    const body = (submission.items || []).map((it) => [
      it.label || "",
      (it.statusLabel || "").toUpperCase(),
      it.note || "",
    ]);

    doc.autoTable({
      startY: y,
      head: [["Item", "Status", "Notes"]],
      body,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, valign: "top" },
      headStyles: { fillColor: [17, 24, 39], textColor: 255 },
      columnStyles: { 0: { cellWidth: 260 }, 1: { cellWidth: 90 }, 2: { cellWidth: 165 } },
      margin: { left, right: 40 },
    });

    const filePeriod = sanitizeFileName(meta.periodPretty || meta.period || "");
    const fileTitle = sanitizeFileName(checklistTitle);
    const filename = `RedFolderATL - ${fileTitle} - ${filePeriod || "Record"}.pdf`;

    doc.save(filename);
  }

  // -------------- RENDER: HOME --------------
  function renderHome() {
    const buildTag = $("buildTag");
    if (buildTag) buildTag.textContent = `BUILD ${BUILD} • by Aureliu Nica`;

    const recentList = $("recentList");
    const recentEmpty = $("recentEmpty");
    if (!recentList || !recentEmpty) return;

    const subs = loadSubmissions().slice(0, 5);
    recentList.innerHTML = "";

    if (!subs.length) {
      recentEmpty.style.display = "block";
      return;
    }

    recentEmpty.style.display = "none";

    for (const s of subs) {
      const when = s.createdAt ? new Date(s.createdAt).toLocaleString() : "";
      const period = s?.meta?.periodPretty || s?.meta?.period || "";
      const card = document.createElement("div");
      card.className = "itemCard";
      card.innerHTML = `
        <div style="min-width:0;">
          <div class="itemTitle">${escapeHtml(s.title || "Checklist")}</div>
          <div class="itemSub">${escapeHtml((s.category || "").toUpperCase())} • ${escapeHtml(period)} • ${escapeHtml(when)}</div>
        </div>
        <div class="itemRight">
          <a class="linkBtn" href="./history.html">Open</a>
        </div>
      `;
      recentList.appendChild(card);
    }
  }

  // -------------- RENDER: LIST --------------
  function renderList() {
    const buildTag = $("buildTag");
    if (buildTag) buildTag.textContent = `BUILD ${BUILD} • by Aureliu Nica`;

    const cat = (getParam("cat") || "").toLowerCase();
    const listTitle = $("listTitle");
    const listSubtitle = $("listSubtitle");
    const listHint = $("listHint");
    const listEmpty = $("listEmpty");
    const checklistList = $("checklistList");

    const label = CAT_LABELS[cat] || "Checklists";
    if (listTitle) listTitle.textContent = label;
    if (listSubtitle) listSubtitle.textContent = label;
    if (listHint) listHint.textContent = CAT_HINTS[cat] || "";

    if (!checklistList || !listEmpty) return;

    const items = CHECKLISTS.filter((c) => c.category === cat);
    checklistList.innerHTML = "";

    if (!items.length) {
      listEmpty.style.display = "block";
      return;
    }
    listEmpty.style.display = "none";

    for (const c of items) {
      const card = document.createElement("div");
      card.className = "itemCard";
      card.innerHTML = `
        <div style="min-width:0;">
          <div class="itemTitle">${escapeHtml(c.title)}</div>
          <div class="itemSub">${escapeHtml(c.description || "")}</div>
        </div>
        <div class="itemRight">
          <a class="linkBtn" href="./form.html?id=${encodeURIComponent(c.id)}">Open</a>
        </div>
      `;
      checklistList.appendChild(card);
    }
  }

  // -------------- RENDER: FORM --------------
  function renderForm() {
    const buildTag = $("buildTag");
    if (buildTag) buildTag.textContent = `BUILD ${BUILD} • by Aureliu Nica`;

    const id = getParam("id");
    const checklist = getChecklistById(id);

    const titleEl = $("formTitle");
    const descEl = $("formDesc");
    const subEl = $("formSubtitle");
    const itemsWrap = $("itemsWrap");
    const periodLabelEl = $("periodLabel");
    const periodInput = $("meta_period");
    const backLink = $("backLink");
    const errorBox = $("errorBox");

    if (!checklist || !itemsWrap || !periodInput) {
      if (titleEl) titleEl.textContent = "Checklist not found";
      if (descEl) descEl.textContent = "Please go back and choose a checklist.";
      if (itemsWrap) itemsWrap.innerHTML = "";
      return;
    }

    const cat = checklist.category;
    if (subEl) subEl.textContent = `${CAT_LABELS[cat] || "Checks"} • ${checklist.title}`;
    if (titleEl) titleEl.textContent = checklist.title;
    if (descEl) descEl.textContent = checklist.description || "";

    // Back behaviour:
    // - If only 1 checklist exists for that category, go back to Home
    // - If more than 1 exists, go back to the category list
    if (backLink) {
      const count = CHECKLISTS.filter((c) => c.category === cat).length;
      backLink.href = count > 1 ? `./list.html?cat=${encodeURIComponent(cat)}` : `./index.html`;
    }

    // Set period label + default value
    let periodLabel = "Date";
    if (cat === "weekly") periodLabel = "Week Commencing (Monday)";
    if (cat === "monthly") periodLabel = "Month (select any day in month)";
    if (periodLabelEl) periodLabelEl.textContent = periodLabel;

    if (cat === "daily") periodInput.value = todayISO();
    if (cat === "weekly") periodInput.value = mondayOf(todayISO());
    if (cat === "monthly") periodInput.value = monthISO();

    // State
    const state = {
      checklistId: checklist.id,
      category: cat,
      title: checklist.title,
      periodLabel,
      items: checklist.items.map((it) => ({
        key: it.key,
        label: it.label,
        hint: it.hint || "",
        status: "",
        note: "",
      })),
    };

    // Render items
    itemsWrap.innerHTML = "";
    for (let i = 0; i < state.items.length; i++) {
      const it = state.items[i];

      const row = document.createElement("div");
      row.className = "checkRow";

      const pills = STATUS.map((s) => {
        return `
          <button class="pill" type="button" data-idx="${i}" data-state="${s.key}">
            ${escapeHtml(s.label)}
          </button>
        `;
      }).join("");

      row.innerHTML = `
        <div class="checkTop">
          <div style="min-width:0;">
            <div class="checkLabel">${escapeHtml(it.label)}</div>
            ${it.hint ? `<div class="checkHint">${escapeHtml(it.hint)}</div>` : ``}
          </div>
          <div class="pills" aria-label="Status">${pills}</div>
        </div>

        <span class="noteToggle" data-idx="${i}">Add note</span>

        <div class="noteRow" id="noteRow_${i}">
          <textarea class="noteInput" rows="2" placeholder="Note (optional)"></textarea>
        </div>
      `;

      itemsWrap.appendChild(row);
    }

    // Status click handlers
    itemsWrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".pill");
      if (btn) {
        const idx = Number(btn.dataset.idx);
        const st = btn.dataset.state;

        state.items[idx].status = st;

        // Update active styling for this row only
        const row = btn.closest(".checkRow");
        row.querySelectorAll(".pill").forEach((p) => {
          p.classList.toggle("active", p.dataset.state === st);
        });

        // If not done, open note automatically
        const noteRow = row.querySelector(".noteRow");
        if (st === "not_done") noteRow.classList.add("show");
      }

      const toggle = e.target.closest(".noteToggle");
      if (toggle) {
        const idx = Number(toggle.dataset.idx);
        const noteRow = $(`noteRow_${idx}`);
        if (noteRow) noteRow.classList.toggle("show");
      }
    });

    // Capture notes
    itemsWrap.addEventListener("input", (e) => {
      const row = e.target.closest(".checkRow");
      if (!row) return;
      const note = e.target.value || "";
      const allRows = Array.from(itemsWrap.querySelectorAll(".checkRow"));
      const idx = allRows.indexOf(row);
      if (idx >= 0) state.items[idx].note = note;
    });

    // Mark all done
    const markAllBtn = $("markAllDoneBtn");
    if (markAllBtn) {
      markAllBtn.addEventListener("click", () => {
        const rows = itemsWrap.querySelectorAll(".checkRow");
        rows.forEach((row, idx) => {
          state.items[idx].status = "done";
          row.querySelectorAll(".pill").forEach((p) => {
            p.classList.toggle("active", p.dataset.state === "done");
          });
        });
      });
    }

    // Submit
    const form = $("checkForm");
    const submitBtn = $("submitBtn");

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();

      if (errorBox) {
        errorBox.style.display = "none";
        errorBox.textContent = "";
        // reset in case previous success state changed styling
        errorBox.style.borderColor = "rgba(220,38,38,.35)";
        errorBox.style.background = "rgba(220,38,38,.06)";
        errorBox.style.color = "#7f1d1d";
      }

      const meta = {
        project: $("meta_project")?.value?.trim() || "",
        projectNo: $("meta_projectNo")?.value?.trim() || "",
        site: $("meta_site")?.value?.trim() || "",
        supervisor: $("meta_supervisor")?.value?.trim() || "",
        period: $("meta_period")?.value || "",
        completedBy: $("meta_completedBy")?.value?.trim() || "",
      };

      // Period prettify
      let periodPretty = "";
      if (cat === "monthly") {
        const d = new Date((meta.period || monthISO()) + "T00:00:00");
        const m = d.toLocaleString(undefined, { month: "long" });
        periodPretty = `${m} ${d.getFullYear()}`;
      } else {
        periodPretty = prettyDate(meta.period);
      }
      meta.periodPretty = periodPretty;

      const errors = [];
      if (!meta.project) errors.push("Project is required.");
      if (!meta.site) errors.push("Site is required.");
      if (!meta.supervisor) errors.push("Supervisor is required.");
      if (!meta.period) errors.push(`${periodLabel} is required.`);
      if (!meta.completedBy) errors.push("Completed by is required.");

      const missing = state.items.filter((it) => !it.status);
      if (missing.length) errors.push("Please select a status for every item (Done / Not Done / N/A).");

      if (errors.length) {
        if (errorBox) {
          errorBox.textContent = errors.join(" ");
          errorBox.style.display = "block";
        }
        return;
      }

      const submission = {
        uid: uid(),
        createdAt: new Date().toISOString(),
        checklistId: state.checklistId,
        category: state.category,
        title: state.title,
        periodLabel: state.periodLabel,
        meta: meta,
        items: state.items.map((it) => ({
          key: it.key,
          label: it.label,
          status: it.status,
          statusLabel: STATUS.find((s) => s.key === it.status)?.label || it.status,
          note: (it.note || "").trim(),
        })),
      };

      addSubmission(submission);

      if (submitBtn) submitBtn.disabled = true;
      try {
        generatePDF(submission);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }

      if (errorBox) {
        errorBox.style.display = "block";
        errorBox.style.borderColor = "rgba(22,163,74,.35)";
        errorBox.style.background = "rgba(22,163,74,.06)";
        errorBox.style.color = "#14532d";
        errorBox.textContent = "Submitted and PDF downloaded. A copy is saved in History on this device.";
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // -------------- RENDER: HISTORY --------------
  function renderHistory() {
    const buildTag = $("buildTag");
    if (buildTag) buildTag.textContent = `BUILD ${BUILD} • by Aureliu Nica`;

    const list = $("historyList");
    const empty = $("historyEmpty");
    const clearBtn = $("clearHistoryBtn");

    if (!list || !empty) return;

    function draw() {
      const subs = loadSubmissions();
      list.innerHTML = "";

      if (!subs.length) {
        empty.style.display = "block";
        return;
      }
      empty.style.display = "none";

      for (const s of subs) {
        const when = s.createdAt ? new Date(s.createdAt).toLocaleString() : "";
        const period = s?.meta?.periodPretty || s?.meta?.period || "";

        const card = document.createElement("div");
        card.className = "itemCard";
        card.innerHTML = `
          <div style="min-width:0;">
            <div class="itemTitle">${escapeHtml(s.title || "Checklist")}</div>
            <div class="itemSub">${escapeHtml((s.category || "").toUpperCase())} • ${escapeHtml(period)} • ${escapeHtml(when)}</div>
          </div>
          <div class="itemRight">
            <button class="linkBtn" type="button" data-act="pdf" data-id="${escapeHtml(s.uid)}">Download PDF</button>
            <button class="linkBtn" type="button" data-act="del" data-id="${escapeHtml(s.uid)}">Delete</button>
          </div>
        `;
        list.appendChild(card);
      }
    }

    list.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.dataset.act;
      const id = btn.dataset.id;

      const subs = loadSubmissions();
      const sub = subs.find((x) => x.uid === id);

      if (act === "pdf" && sub) {
        generatePDF(sub);
      }

      if (act === "del") {
        deleteSubmission(id);
        draw();
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        clearHistory();
        draw();
      });
    }

    draw();
  }

  // -------------- INIT --------------
  function init() {
    const page = document.body?.dataset?.page || "";
    if (page === "home") return renderHome();
    if (page === "list") return renderList();
    if (page === "form") return renderForm();
    if (page === "history") return renderHistory();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
