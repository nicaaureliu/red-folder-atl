/* public/app.js */
(() => {
  const BUILD = "v0.3";
  const SUBMISSIONS_KEY = "RFATL_SUBMISSIONS_V1";
  const PACKSTATE_KEY = "RFATL_PACKSTATE_V1";

  const $ = (id) => document.getElementById(id);

  const CAT_LABELS = {
    daily: "Daily Checks",
    weekly: "Weekly Checks",
    monthly: "Monthly Checks",
  };

  const CAT_HINTS = {
    daily: "Complete the daily checks and download records.",
    weekly: "Complete once per Week Commencing (WC) and download records.",
    monthly: "Complete once per calendar month and download records.",
  };

  // If you want Plant Checks to open your existing QR Plant Checks site, paste it here:
  const PLANT_CHECKS_URL = ""; // e.g. "https://your-plant-checks.pages.dev/"

  // Starter checklists (from your Excel screenshot)
  const CHECKLISTS = [
    {
      id: "sm_daily_pack",
      category: "daily",
      title: "Site Manager Daily Pack",
      description: "Daily compliance and paperwork checks.",
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
      description: "Weekly checks (one record per WC).",
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
      description: "Monthly checks (one record per calendar month).",
      items: [
        { key: "lifting_equipment", label: "Lifting equipment checks up to date" },
        { key: "pat_testing", label: "PAT testing of electrical tools up to date" },
      ],
    },
  ];

  // ---------------- helpers ----------------
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
    const diff = (day === 0 ? -6 : 1) - day; // Monday
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

  function sanitizeFileName(s) {
    return String(s || "")
      .replaceAll(/[\/\\:*?"<>|]/g, "-")
      .replaceAll(/\s+/g, " ")
      .trim();
  }

  function getChecklistById(id) {
    return CHECKLISTS.find((c) => c.id === id) || null;
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

  // ---------------- pack state (draft) ----------------
  function packKey(checklistId, period) {
    return `${checklistId}__${period || ""}`;
  }

  function loadPackState() {
    return loadJSON(PACKSTATE_KEY, {});
  }

  function savePackState(state) {
    saveJSON(PACKSTATE_KEY, state);
  }

  function getPack(checklistId, period) {
    const all = loadPackState();
    const key = packKey(checklistId, period);
    if (!all[key]) {
      all[key] = {
        checklistId,
        period,
        meta: {},
        tasks: {}, // key -> { status: "new|complete|na", data: {}, updatedAt }
        createdAt: new Date().toISOString(),
      };
      savePackState(all);
    }
    return all[key];
  }

  function setPack(checklistId, period, packObj) {
    const all = loadPackState();
    all[packKey(checklistId, period)] = packObj;
    savePackState(all);
  }

  function setTaskStatus(checklistId, period, taskKey, status, data = null) {
    const pack = getPack(checklistId, period);
    pack.tasks[taskKey] = pack.tasks[taskKey] || { status: "new", data: {}, updatedAt: "" };
    pack.tasks[taskKey].status = status;
    if (data !== null) pack.tasks[taskKey].data = data;
    pack.tasks[taskKey].updatedAt = new Date().toISOString();
    setPack(checklistId, period, pack);
  }

  // ---------------- submissions (history) ----------------
  function loadSubmissions() {
    return loadJSON(SUBMISSIONS_KEY, []);
  }

  function saveSubmissions(arr) {
    saveJSON(SUBMISSIONS_KEY, arr);
  }

  function addSubmission(sub) {
    const all = loadSubmissions();
    all.unshift(sub);
    saveSubmissions(all.slice(0, 100));
  }

  // ---------------- PDF (generic) ----------------
  function ensurePdf() {
    const jspdfNS = window.jspdf;
    if (!jspdfNS?.jsPDF) {
      alert("PDF library not loaded. Please refresh the page.");
      return null;
    }
    return jspdfNS.jsPDF;
  }

  function packPeriodPretty(category, periodISO) {
    if (!periodISO) return "";
    if (category === "monthly") {
      const d = new Date(periodISO + "T00:00:00");
      const m = d.toLocaleString(undefined, { month: "long" });
      return `${m} ${d.getFullYear()}`;
    }
    return prettyDate(periodISO);
  }

  function generatePackPDF(checklist, pack) {
    const jsPDF = ensurePdf();
    if (!jsPDF) return;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const left = 40;
    let y = 46;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("RED FOLDER ATL", left, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, left, y + 16);

    doc.setDrawColor(255, 214, 0);
    doc.setLineWidth(3);
    doc.line(left, y + 28, 555, y + 28);

    y += 54;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(checklist.title, left, y);
    y += 14;

    const periodPretty = packPeriodPretty(checklist.category, pack.period);

    const metaRows = [
      ["Project", pack.meta.project || ""],
      ["Project No.", pack.meta.projectNo || ""],
      ["Site", pack.meta.site || ""],
      ["Supervisor", pack.meta.supervisor || ""],
      [checklist.category === "weekly" ? "Week Commencing" : (checklist.category === "monthly" ? "Month" : "Date"), periodPretty || pack.period || ""],
      ["Completed by", pack.meta.completedBy || ""],
    ];

    doc.autoTable({
      startY: y,
      head: [["Field", "Value"]],
      body: metaRows,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [255, 214, 0], textColor: 17 },
      margin: { left, right: 40 },
    });

    y = doc.lastAutoTable.finalY + 14;

    const rows = checklist.items.map((it) => {
      const st = pack.tasks?.[it.key]?.status || "new";
      const label = st === "complete" ? "COMPLETED" : (st === "na" ? "N/A" : "NOT STARTED");
      return [it.label, label, pack.tasks?.[it.key]?.updatedAt ? new Date(pack.tasks[it.key].updatedAt).toLocaleString() : ""];
    });

    doc.autoTable({
      startY: y,
      head: [["Task", "Status", "Last updated"]],
      body: rows,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [17, 24, 39], textColor: 255 },
      margin: { left, right: 40 },
      columnStyles: { 0: { cellWidth: 310 }, 1: { cellWidth: 110 }, 2: { cellWidth: 135 } },
    });

    const filePeriod = sanitizeFileName(periodPretty || pack.period || "");
    const fileTitle = sanitizeFileName(checklist.title);
    doc.save(`RedFolderATL - ${fileTitle} - ${filePeriod || "Record"}.pdf`);
  }

  // ---------------- TASK MODULES ----------------

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

  function renderDailyBriefTask(container, pack, checklistId, period) {
    const meta = pack.meta || {};
    const existing = pack.tasks?.daily_brief?.data || {};

    const defaultData = {
      projectTitle: meta.project || "",
      workLocation: "",
      siteLocation: meta.site || "",
      projectNo: meta.projectNo || "",
      briefingBy: meta.supervisor || "",
      jobTitle: "",
      date: period || todayISO(),
      personsAttending: "",
      previousActivities: "",
      wentAsPlanned: "yes",
      concerns: "",
      plannedActivities: "",
      points: DAILY_BRIEF_POINTS.reduce((acc, p) => (acc[p] = false, acc), {}),
      coveredByRAMS: "yes",
      controlsInPlace: "yes",
      ppeCompliant: "yes",
      attendees: [], // [{name, date, signature}]
    };

    const data = Object.assign({}, defaultData, existing);

    container.innerHTML = `
      <div class="grid2">
        <div><label class="lbl">Project title</label><input class="inp" id="db_projectTitle" value="${escapeHtml(data.projectTitle)}"></div>
        <div><label class="lbl">Site location</label><input class="inp" id="db_siteLocation" value="${escapeHtml(data.siteLocation)}"></div>

        <div><label class="lbl">Work location</label><input class="inp" id="db_workLocation" value="${escapeHtml(data.workLocation)}"></div>
        <div><label class="lbl">Project no</label><input class="inp" id="db_projectNo" value="${escapeHtml(data.projectNo)}"></div>

        <div><label class="lbl">Name of person giving briefing</label><input class="inp" id="db_briefingBy" value="${escapeHtml(data.briefingBy)}"></div>
        <div><label class="lbl">Job title</label><input class="inp" id="db_jobTitle" value="${escapeHtml(data.jobTitle)}"></div>

        <div><label class="lbl">Date</label><input class="inp" type="date" id="db_date" value="${escapeHtml(data.date)}"></div>
        <div><label class="lbl">No. persons attending</label><input class="inp" id="db_personsAttending" value="${escapeHtml(data.personsAttending)}"></div>
      </div>

      <div class="divider"></div>

      <div>
        <label class="lbl">Previous day’s activities</label>
        <textarea class="inp" rows="3" id="db_previousActivities">${escapeHtml(data.previousActivities)}</textarea>

        <div class="grid2" style="margin-top:10px;">
          <div>
            <label class="lbl">Did they go as planned?</label>
            <select class="inp" id="db_wentAsPlanned">
              <option value="yes" ${data.wentAsPlanned==="yes"?"selected":""}>Yes</option>
              <option value="no" ${data.wentAsPlanned==="no"?"selected":""}>No</option>
            </select>
          </div>
          <div>
            <label class="lbl">Any concerns from the previous day?</label>
            <input class="inp" id="db_concerns" value="${escapeHtml(data.concerns)}" placeholder="Short note (or leave blank)">
          </div>
        </div>

        <label class="lbl" style="margin-top:10px;">Today’s planned activities briefing</label>
        <textarea class="inp" rows="3" id="db_plannedActivities">${escapeHtml(data.plannedActivities)}</textarea>
      </div>

      <div class="divider"></div>

      <h3 class="h3">Points discussed for today’s operation</h3>
      <div class="checkGrid" id="db_points"></div>

      <div class="divider"></div>

      <div class="grid3">
        <div>
          <label class="lbl">Activities covered by RAMS / Work Instruction?</label>
          <select class="inp" id="db_coveredByRAMS">
            <option value="yes" ${data.coveredByRAMS==="yes"?"selected":""}>Yes</option>
            <option value="no" ${data.coveredByRAMS==="no"?"selected":""}>No</option>
          </select>
        </div>
        <div>
          <label class="lbl">All control measures in place?</label>
          <select class="inp" id="db_controlsInPlace">
            <option value="yes" ${data.controlsInPlace==="yes"?"selected":""}>Yes</option>
            <option value="no" ${data.controlsInPlace==="no"?"selected":""}>No</option>
          </select>
        </div>
        <div>
          <label class="lbl">Operatives compliant with PPE?</label>
          <select class="inp" id="db_ppeCompliant">
            <option value="yes" ${data.ppeCompliant==="yes"?"selected":""}>Yes</option>
            <option value="no" ${data.ppeCompliant==="no"?"selected":""}>No</option>
          </select>
        </div>
      </div>

      <div class="divider"></div>

      <h3 class="h3">Attendees (sign-up)</h3>
      <div id="db_attendees"></div>
      <button class="btn btnAlt" type="button" id="db_addAttendee">Add attendee</button>
    `;

    // render points
    const pointsWrap = container.querySelector("#db_points");
    DAILY_BRIEF_POINTS.forEach((p, idx) => {
      const checked = !!data.points?.[p];
      const el = document.createElement("label");
      el.className = "tickRow";
      el.innerHTML = `
        <input type="checkbox" id="db_point_${idx}" ${checked ? "checked" : ""} />
        <span>${escapeHtml(p)}</span>
      `;
      pointsWrap.appendChild(el);
    });

    function renderAttendees() {
      const wrap = container.querySelector("#db_attendees");
      wrap.innerHTML = "";

      if (!Array.isArray(data.attendees)) data.attendees = [];

      if (!data.attendees.length) {
        const p = document.createElement("div");
        p.className = "muted";
        p.textContent = "No attendees added yet.";
        wrap.appendChild(p);
        return;
      }

      data.attendees.forEach((a, i) => {
        const row = document.createElement("div");
        row.className = "attRow";
        row.innerHTML = `
          <div class="grid3">
            <div>
              <label class="lbl">Name</label>
              <input class="inp" data-att="name" data-i="${i}" value="${escapeHtml(a.name || "")}" />
            </div>
            <div>
              <label class="lbl">Date</label>
              <input class="inp" data-att="date" data-i="${i}" value="${escapeHtml(a.date || prettyDate(data.date))}" />
            </div>
            <div>
              <label class="lbl">Signature (type)</label>
              <input class="inp" data-att="sig" data-i="${i}" value="${escapeHtml(a.signature || "")}" placeholder="Type signature" />
            </div>
          </div>
          <div style="margin-top:8px;">
            <button class="btn btnAlt" type="button" data-del="${i}">Remove</button>
          </div>
          <div class="divider" style="margin:12px 0;"></div>
        `;
        wrap.appendChild(row);
      });

      wrap.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-del]");
        if (!btn) return;
        const idx = Number(btn.dataset.del);
        data.attendees.splice(idx, 1);
        renderAttendees();
      }, { once: true });

      wrap.addEventListener("input", (e) => {
        const inp = e.target.closest("input[data-att]");
        if (!inp) return;
        const i = Number(inp.dataset.i);
        const f = inp.dataset.att;
        data.attendees[i] = data.attendees[i] || {};
        if (f === "name") data.attendees[i].name = inp.value;
        if (f === "date") data.attendees[i].date = inp.value;
        if (f === "sig") data.attendees[i].signature = inp.value;
      });
    }

    renderAttendees();

    container.querySelector("#db_addAttendee").addEventListener("click", () => {
      data.attendees = data.attendees || [];
      data.attendees.push({ name: "", date: prettyDate(data.date), signature: "" });
      renderAttendees();
    });

    // return collectors + pdf generator for this module
    return {
      collect: () => {
        const collected = {
          projectTitle: container.querySelector("#db_projectTitle").value.trim(),
          siteLocation: container.querySelector("#db_siteLocation").value.trim(),
          workLocation: container.querySelector("#db_workLocation").value.trim(),
          projectNo: container.querySelector("#db_projectNo").value.trim(),
          briefingBy: container.querySelector("#db_briefingBy").value.trim(),
          jobTitle: container.querySelector("#db_jobTitle").value.trim(),
          date: container.querySelector("#db_date").value,
          personsAttending: container.querySelector("#db_personsAttending").value.trim(),
          previousActivities: container.querySelector("#db_previousActivities").value.trim(),
          wentAsPlanned: container.querySelector("#db_wentAsPlanned").value,
          concerns: container.querySelector("#db_concerns").value.trim(),
          plannedActivities: container.querySelector("#db_plannedActivities").value.trim(),
          points: {},
          coveredByRAMS: container.querySelector("#db_coveredByRAMS").value,
          controlsInPlace: container.querySelector("#db_controlsInPlace").value,
          ppeCompliant: container.querySelector("#db_ppeCompliant").value,
          attendees: (data.attendees || []).map((a) => ({
            name: (a.name || "").trim(),
            date: (a.date || "").trim(),
            signature: (a.signature || "").trim(),
          })),
        };

        DAILY_BRIEF_POINTS.forEach((p, idx) => {
          const chk = container.querySelector(`#db_point_${idx}`);
          collected.points[p] = !!chk?.checked;
        });

        return collected;
      },

      pdf: (collected) => {
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
          ["Project Title", collected.projectTitle],
          ["Site Location", collected.siteLocation],
          ["Work Location", collected.workLocation],
          ["Project No", collected.projectNo],
          ["Briefing by", collected.briefingBy],
          ["Job title", collected.jobTitle],
          ["Date", prettyDate(collected.date)],
          ["No. persons attending", collected.personsAttending],
          ["Went as planned?", (collected.wentAsPlanned || "").toUpperCase()],
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

        const textRows = [
          ["Previous day’s activities", collected.previousActivities || ""],
          ["Concerns from previous day", collected.concerns || ""],
          ["Today’s planned activities briefing", collected.plannedActivities || ""],
        ];

        doc.autoTable({
          startY: y,
          head: [["Section", "Notes"]],
          body: textRows,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 9, cellPadding: 4, valign: "top" },
          headStyles: { fillColor: [17, 24, 39], textColor: 255 },
          margin: { left, right: 40 },
          columnStyles: { 0: { cellWidth: 180 }, 1: { cellWidth: 335 } },
        });

        y = doc.lastAutoTable.finalY + 10;

        const pointsRows = DAILY_BRIEF_POINTS.map((p) => [p, collected.points?.[p] ? "✓" : ""]);
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
            ["Activities covered by RAMS / Work Instruction?", (collected.coveredByRAMS || "").toUpperCase()],
            ["All control measures in place?", (collected.controlsInPlace || "").toUpperCase()],
            ["Operatives compliant with PPE?", (collected.ppeCompliant || "").toUpperCase()],
          ],
          theme: "grid",
          styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: [17, 24, 39], textColor: 255 },
          margin: { left, right: 40 },
          columnStyles: { 0: { cellWidth: 445 }, 1: { cellWidth: 70 } },
        });

        // Page 2 (attendees)
        doc.addPage();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("MORNING BRIEFING SIGN-UP SHEET", left, 46);
        doc.setDrawColor(255, 214, 0);
        doc.setLineWidth(3);
        doc.line(left, 58, 555, 58);

        const att = (collected.attendees || []).filter((a) => a.name || a.signature);
        const attRows = att.length
          ? att.map((a) => [a.name || "", a.date || prettyDate(collected.date), a.signature || ""])
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

        const fileDate = sanitizeFileName(prettyDate(collected.date));
        doc.save(`Daily Morning Briefing - ${fileDate || "Record"}.pdf`);
      },
    };
  }

  function renderGenericTask(container, taskKey, taskLabel, existingData = {}) {
    const data = Object.assign({ note: "" }, existingData);

    container.innerHTML = `
      <label class="lbl">Notes / Details</label>
      <textarea class="inp" rows="4" id="gen_note" placeholder="Add anything useful (optional)">${escapeHtml(data.note || "")}</textarea>
      <p class="muted" style="margin-top:10px;">
        This task is a placeholder for now. We will replace it with the full form (questions + proper PDF) next.
      </p>
    `;

    return {
      collect: () => ({ note: container.querySelector("#gen_note").value.trim() }),
      pdf: (collected) => {
        const jsPDF = ensurePdf();
        if (!jsPDF) return;
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(`Task: ${taskLabel}`, 40, 50);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 68);
        doc.autoTable({
          startY: 90,
          head: [["Field", "Value"]],
          body: [["Notes", collected.note || ""]],
          theme: "grid",
          styles: { font: "helvetica", fontSize: 9, cellPadding: 4, valign: "top" },
          margin: { left: 40, right: 40 },
          columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 405 } },
        });
        doc.save(`${sanitizeFileName(taskLabel)}.pdf`);
      },
    };
  }

  function renderPlantChecksTask(container, existingData = {}) {
    const data = Object.assign({ note: "" }, existingData);

    container.innerHTML = `
      <p class="sub">
        This will open your Plant Checks (QR) system. When done, come back and press Save to mark this task completed.
      </p>
      <div class="actions" style="justify-content:flex-start; gap:10px; margin: 10px 0 14px;">
        <button class="btn" type="button" id="pc_open">Open Plant Checks</button>
      </div>
      <label class="lbl">Notes (optional)</label>
      <textarea class="inp" rows="3" id="pc_note">${escapeHtml(data.note || "")}</textarea>
      <p class="muted" style="margin-top:10px;">
        Once you confirm the Plant Checks URL, I can embed it more tightly (or route you directly into the exact machine checks page).
      </p>
    `;

    container.querySelector("#pc_open").addEventListener("click", () => {
      if (!PLANT_CHECKS_URL) {
        alert("Plant Checks URL not set yet in app.js (PLANT_CHECKS_URL).");
        return;
      }
      window.open(PLANT_CHECKS_URL, "_blank", "noopener,noreferrer");
    });

    return {
      collect: () => ({ note: container.querySelector("#pc_note").value.trim() }),
      pdf: (collected) => {
        const jsPDF = ensurePdf();
        if (!jsPDF) return;
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("Plant Operative Check Sheet", 40, 50);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("This record confirms Plant Checks were completed via the Plant Checks system.", 40, 70);
        doc.autoTable({
          startY: 90,
          head: [["Field", "Value"]],
          body: [
            ["Plant Checks URL", PLANT_CHECKS_URL || "Not set"],
            ["Notes", collected.note || ""],
          ],
          theme: "grid",
          styles: { font: "helvetica", fontSize: 9, cellPadding: 4, valign: "top" },
          margin: { left: 40, right: 40 },
          columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 375 } },
        });
        doc.save("Plant Operative Check Sheet - Record.pdf");
      },
    };
  }

  // ---------------- pages ----------------

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

    if (!checklist || !itemsWrap || !periodInput) return;

    if (subEl) subEl.textContent = `${CAT_LABELS[checklist.category] || "Checks"} • ${checklist.title}`;
    if (titleEl) titleEl.textContent = checklist.title;
    if (descEl) descEl.textContent = checklist.description || "";

    // Back: to list if multiple packs in category; else home
    if (backLink) {
      const count = CHECKLISTS.filter((c) => c.category === checklist.category).length;
      backLink.href = count > 1 ? `./list.html?cat=${encodeURIComponent(checklist.category)}` : `./index.html`;
    }

    // Period label + default
    let periodLabel = "Date";
    if (checklist.category === "weekly") periodLabel = "Week Commencing (Monday)";
    if (checklist.category === "monthly") periodLabel = "Month (select any day in month)";
    if (periodLabelEl) periodLabelEl.textContent = periodLabel;

    if (!periodInput.value) {
      if (checklist.category === "daily") periodInput.value = todayISO();
      if (checklist.category === "weekly") periodInput.value = mondayOf(todayISO());
      if (checklist.category === "monthly") periodInput.value = monthISO();
    }

    function currentPeriod() {
      return periodInput.value || "";
    }

    function loadAndPrefillMeta() {
      const period = currentPeriod();
      const pack = getPack(checklist.id, period);

      // Prefill meta inputs if pack has values
      const fields = ["project", "projectNo", "site", "supervisor", "completedBy"];
      fields.forEach((f) => {
        const el = $(`meta_${f}`);
        if (el && !el.value && pack.meta?.[f]) el.value = pack.meta[f];
      });
    }

    function saveMetaToPack() {
      const period = currentPeriod();
      const pack = getPack(checklist.id, period);
      pack.meta = {
        project: $("meta_project")?.value?.trim() || "",
        projectNo: $("meta_projectNo")?.value?.trim() || "",
        site: $("meta_site")?.value?.trim() || "",
        supervisor: $("meta_supervisor")?.value?.trim() || "",
        completedBy: $("meta_completedBy")?.value?.trim() || "",
      };
      setPack(checklist.id, period, pack);
    }

    loadAndPrefillMeta();

    // Save meta on change
    ["meta_project","meta_projectNo","meta_site","meta_supervisor","meta_completedBy","meta_period"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("change", () => {
        saveMetaToPack();
        drawTasks();
      });
      el.addEventListener("input", () => {
        saveMetaToPack();
      });
    });

    function taskStatusBadge(st) {
      if (st === "complete") return `<span class="badge ok">Completed</span>`;
      if (st === "na") return `<span class="badge na">N/A</span>`;
      return `<span class="badge">Not started</span>`;
    }

    function drawTasks() {
      const period = currentPeriod();
      const pack = getPack(checklist.id, period);

      itemsWrap.innerHTML = "";

      checklist.items.forEach((it) => {
        const st = pack.tasks?.[it.key]?.status || "new";

        const isPlant = it.key === "plant_check_sheet";

        const card = document.createElement("div");
        card.className = "taskCard";
        card.innerHTML = `
          <div style="min-width:0;">
            <div class="itemTitle">${escapeHtml(it.label)}</div>
            <div class="itemSub">Status: ${taskStatusBadge(st)}</div>
          </div>
          <div class="itemRight">
            <a class="linkBtn" href="./task.html?pack=${encodeURIComponent(checklist.id)}&task=${encodeURIComponent(it.key)}&period=${encodeURIComponent(period)}">
              Open
            </a>
          </div>
        `;
        itemsWrap.appendChild(card);
      });
    }

    drawTasks();

    // Submit (generate pack summary PDF + store history entry)
    const form = $("checkForm");
    const submitBtn = $("submitBtn");

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (errorBox) errorBox.style.display = "none";

      const period = currentPeriod();
      if (!period) {
        if (errorBox) {
          errorBox.textContent = `${periodLabel} is required.`;
          errorBox.style.display = "block";
        }
        return;
      }

      saveMetaToPack();
      const pack = getPack(checklist.id, period);

      // Store to History as a “pack record”
      const periodPretty = packPeriodPretty(checklist.category, pack.period);
      const submission = {
        uid: `${packKey(checklist.id, pack.period)}__${Date.now()}`,
        createdAt: new Date().toISOString(),
        checklistId: checklist.id,
        category: checklist.category,
        title: checklist.title,
        meta: {
          ...pack.meta,
          period: pack.period,
          periodPretty,
        },
        tasks: pack.tasks || {},
      };
      addSubmission(submission);

      if (submitBtn) submitBtn.disabled = true;
      try {
        generatePackPDF(checklist, pack);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function renderTask() {
    const buildTag = $("buildTag");
    if (buildTag) buildTag.textContent = `BUILD ${BUILD} • by Aureliu Nica`;

    const checklistId = getParam("pack");
    const taskKey = getParam("task");
    const period = getParam("period");

    const checklist = getChecklistById(checklistId);
    if (!checklist) return;

    const taskDef = checklist.items.find((x) => x.key === taskKey);
    const taskLabel = taskDef?.label || taskKey;

    const pack = getPack(checklistId, period);

    const backLink = $("backLink");
    if (backLink) backLink.href = `./form.html?id=${encodeURIComponent(checklistId)}`;

    const titleEl = $("taskTitle");
    const descEl = $("taskDesc");
    const crumb = $("taskBreadcrumb");
    if (crumb) crumb.textContent = `${checklist.title} • ${taskLabel}`;

    if (titleEl) titleEl.textContent = taskLabel;

    const body = $("taskBody");
    const msg = $("taskMsg");

    function showMsg(text, ok = true) {
      if (!msg) return;
      msg.style.display = "block";
      msg.className = ok ? "msg msgOk" : "msg msgErr";
      msg.textContent = text;
    }

    // Choose module:
    let moduleApi = null;

    if (taskKey === "daily_brief") {
      if (descEl) descEl.textContent = "Complete the morning briefing and download the PDF.";
      moduleApi = renderDailyBriefTask(body, pack, checklistId, period);
    } else if (taskKey === "plant_check_sheet") {
      if (descEl) descEl.textContent = "Open Plant Checks (QR) and confirm completion.";
      const existing = pack.tasks?.[taskKey]?.data || {};
      moduleApi = renderPlantChecksTask(body, existing);
    } else {
      if (descEl) descEl.textContent = "Complete task details and download a simple record PDF.";
      const existing = pack.tasks?.[taskKey]?.data || {};
      moduleApi = renderGenericTask(body, taskKey, taskLabel, existing);
    }

    const saveBtn = $("saveTaskBtn");
    const pdfBtn = $("pdfTaskBtn");
    const naBtn = $("naTaskBtn");

    function save(status = "complete") {
      const collected = moduleApi.collect();
      // persist collected
      setTaskStatus(checklistId, period, taskKey, status, collected);
      showMsg(status === "na" ? "Marked N/A and saved." : "Saved. You can now download/print the PDF.");
    }

    saveBtn?.addEventListener("click", () => save("complete"));

    naBtn?.addEventListener("click", () => {
      setTaskStatus(checklistId, period, taskKey, "na", pack.tasks?.[taskKey]?.data || {});
      showMsg("Marked N/A and saved.");
    });

    pdfBtn?.addEventListener("click", () => {
      const collected = moduleApi.collect();
      // save as complete when generating pdf (safe default)
      setTaskStatus(checklistId, period, taskKey, "complete", collected);
      moduleApi.pdf(collected);
      showMsg("PDF downloaded. Task saved as Completed.");
    });
  }

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
            <a class="linkBtn" href="./form.html?id=${encodeURIComponent(s.checklistId || "")}">Open</a>
          </div>
        `;
        list.appendChild(card);
      }
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        localStorage.removeItem(SUBMISSIONS_KEY);
        draw();
      });
    }

    draw();
  }

  function init() {
    const page = document.body?.dataset?.page || "";
    if (page === "home") return renderHome();
    if (page === "list") return renderList();
    if (page === "form") return renderForm();
    if (page === "task") return renderTask();
    if (page === "history") return renderHistory();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
