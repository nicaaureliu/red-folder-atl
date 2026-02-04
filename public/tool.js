// tool.js - Main app logic for ATL PDF tools
//
// To use a local copy of pdf-lib (for strict Content-Security-Policy environments):
// 1. Download pdf-lib.min.js from https://github.com/Hopding/pdf-lib/releases or npm.
// 2. Place it in your public/assets/ or similar folder (e.g. public/assets/pdf-lib.min.js).
// 3. Change the 'pdfLibUrl' below to your local path (e.g. './assets/pdf-lib.min.js').
// 4. Ensure your CSP allows loading from that path.
//
// By default, the app loads pdf-lib from CDN for convenience.

// ===========================
// QA / Testing Checklist
// ===========================
// Use this checklist to ensure all forms and PDFs work correctly.
//
// [ ] Daily Briefing Form (tool.html?t=daily%20brief)
//     - Form loads without errors
//     - All input fields accept text/dates
//     - "Points discussed" checkboxes toggle correctly
//     - Add/delete attendees works (up to 96 attendees)
//     - Signature modal opens, draws, clears, saves, and cancels correctly
//     - Signature appears in preview after saving
//     - "Download PDF" generates valid PDF with all data
//     - PDF includes all attendees and signatures
//     - PDF pagination works for 20+ attendees
//
// [ ] Confined Space Permit (tool.html?t=confined%20space%20permit)
//     - Form loads without errors
//     - All sections render correctly (Work Description, Briefing, Risk, Controls, etc.)
//     - Checkboxes toggle correctly
//     - "Download PDF" generates valid PDF with all data
//     - PDF layout is correct and readable
//
// [ ] Hot Work Permit (tool.html?t=hot%20work%20permit)
//     - Form loads without errors
//     - Activities, precautions, checks render correctly
//     - Yes/N/A checkboxes work
//     - Extinguisher type checkboxes work
//     - "Download PDF" generates valid PDF with all data
//     - PDF layout matches requirements
//
// [ ] Error Handling
//     - If pdf-lib CDN is blocked, user sees clear error message
//     - If assets (logo) are missing, user sees clear error message
//     - Network failures show user-friendly messages
//     - Banner errors are dismissible/clear
//
// [ ] Accessibility
//     - Signature modal can be opened and closed with keyboard (Tab, Enter, Esc)
//     - Focus is trapped within modal when open
//     - Focus returns to trigger button when modal closes
//     - All buttons have aria-labels
//     - Screen readers can navigate forms
//
// [ ] Performance
//     - pdf-lib loads only when "Download PDF" is clicked (lazy-load)
//     - Page loads quickly without blocking
//     - Signature canvas is responsive to touch and mouse
//
// [ ] Browser Compatibility
//     - Works in Chrome, Firefox, Safari, Edge
//     - Works on mobile (iOS Safari, Android Chrome)
//     - Touch signatures work on tablets/phones
//
// ===========================

const pdfLibUrls = [
  './assets/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'
];

// Lazy-load pdf-lib only when needed
async function loadPdfLib() {
  if (window.PDFLib) return window.PDFLib;
  window.__pdfLibLoadFailed = false;
  let lastErr;
  for (const url of pdfLibUrls) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => {
          if (window.PDFLib) resolve();
          else reject(new Error('PDF engine failed to load.'));
        };
        script.onerror = () => reject(new Error(`Could not load PDF engine from ${url}`));
        document.head.appendChild(script);
      });
      if (window.PDFLib) return window.PDFLib;
    } catch (err) {
      lastErr = err;
    }
  }
  window.__pdfLibLoadFailed = true;
  throw (lastErr || new Error('PDF engine failed to load. Please check your internet connection or Content-Security-Policy.'));
}

window.__toolReady = false;
window.__pdfLibLoadFailed = false;

    const $ = (q) => document.querySelector(q);
    const el = (tag, attrs={}, children=[]) => {
      const n = document.createElement(tag);
      Object.entries(attrs).forEach(([k,v])=>{
        if(k === "class") n.className = v;
        else if(k === "html") n.innerHTML = v;
        else if(k.startsWith("on") && typeof v === "function") n.addEventListener(k.substring(2), v);
        else n.setAttribute(k, v);
      });
      children.forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
      return n;
    };

    const params = new URLSearchParams(location.search);
    const t = (params.get("t") || "Form").trim();
    document.title = t;

    const sigStore = new Map();
    const makeId = () => "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);

    const pad2 = (n) => String(n).padStart(2,"0");
    const todayISO = () => {
      const d = new Date();
      return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
    };
    const toDDMMYYYY = (iso) => {
      if(!iso || !iso.includes("-")) return iso || "";
      const [y,m,d] = iso.split("-");
      return `${pad2(d)}/${pad2(m)}/${y}`;
    };

    function showBanner(msg, type="warn"){
      const b = $("#banner");
      b.style.display = "block";
      b.style.borderColor = (type==="bad") ? "var(--badBd)" : "var(--warnBd)";
      b.style.background = (type==="bad") ? "var(--badBg)" : "var(--warnBg)";
      b.style.color = (type==="bad") ? "var(--badTx)" : "var(--warnTx)";
      b.textContent = msg;
    }
    function hideBanner(){
      const b = $("#banner");
      if(!b) return;
      b.style.display = "none";
      b.textContent = "";
    }

    function renderPlaceholder(title){
      const app = $("#app");
      app.innerHTML = "";
      app.appendChild(el("div",{class:"head"},[
        el("div",{},[
          el("h1",{},[title]),
          el("div",{class:"sub"},["This is a placeholder page."])
        ]),
        el("div",{class:"pillRow"},[
          el("a",{class:"btn btnYellow", href:"daily.html"},["Back"])
        ])
      ]));
    }

    const SigModal = (() => {
      const overlay = $("#sigOverlay");
      const canvas = $("#sigCanvas");
      const titleEl = $("#sigTitle");
      const btnClear = $("#sigClear");
      const btnCancel = $("#sigCancel");
      const btnSave = $("#sigSave");
      const btnCloseTop = $("#sigCloseTop");

      let ctx, drawing=false, hasInk=false;
      let currentAttId=null;
      let onSavedCb=null;
      let lastFocused=null;

      const focusFirst = () => {
        // Focus the first focusable element in the modal
        const focusable = overlay.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
        if (focusable.length) focusable[0].focus();
      };

      const trapFocus = (e) => {
        if (overlay.style.display !== "flex") return;
        const focusable = overlay.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.key === "Tab") {
          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        } else if (e.key === "Escape") {
          close();
        }
      };

      const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
        ctx = canvas.getContext("2d");
        ctx.setTransform(dpr,0,0,dpr,0,0);
        clearCanvas();
      };

      const clearCanvas = () => {
        if(!ctx) return;
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0,0,rect.width,rect.height);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0,0,rect.width,rect.height);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        hasInk = false;
      };

      const getPos = (evt) => {
        const rect = canvas.getBoundingClientRect();
        return { x: (evt.clientX - rect.left), y: (evt.clientY - rect.top) };
      };

      const start = (evt) => {
        evt.preventDefault();
        drawing = true;
        const p = getPos(evt);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      };

      const move = (evt) => {
        if(!drawing) return;
        evt.preventDefault();
        const p = getPos(evt);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        hasInk = true;
      };

      const end = (evt) => {
        if(!drawing) return;
        evt.preventDefault();
        drawing = false;
      };

      canvas.addEventListener("pointerdown", start);
      canvas.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);

      btnClear.addEventListener("click", clearCanvas);

      const close = () => {
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden","true");
        document.removeEventListener("keydown", trapFocus, true);
        if (lastFocused) {
          lastFocused.focus();
          lastFocused = null;
        }
        currentAttId = null;
        onSavedCb = null;
      };

      btnCancel.addEventListener("click", close);
      btnCloseTop.addEventListener("click", close);

      btnSave.addEventListener("click", () => {
        if(!currentAttId) return;
        if(!hasInk){
          alert("Please sign first, then Save.");
          return;
        }
        const dataUrl = canvas.toDataURL("image/png");
        sigStore.set(currentAttId, dataUrl);
        if(typeof onSavedCb === "function") onSavedCb(currentAttId, dataUrl);
        close();
      });

      window.addEventListener("resize", () => {
        if(overlay.style.display === "flex") resizeCanvas();
      });

      const open = (attId, label, cb) => {
        currentAttId = attId;
        onSavedCb = cb;
        titleEl.textContent = label ? `Signature: ${label}` : "Signature";
        overlay.style.display = "flex";
        overlay.setAttribute("aria-hidden","false");
        lastFocused = document.activeElement;
        setTimeout(() => {
          resizeCanvas();
          focusFirst();
        }, 50);
        document.addEventListener("keydown", trapFocus, true);
      };

      return { open };
    })();

    async function checkTemplateAndLib(mode){
      const libPill = $("#pillLib");
      const tplPill = $("#pillTpl");
      if(!libPill || !tplPill) return;

      await new Promise(r => setTimeout(r, 400));

      if(window.PDFLib){
        libPill.className = "pill ok";
        libPill.textContent = "PDF engine: OK";
      }else if(window.__pdfLibLoadFailed){
        libPill.className = "pill bad";
        libPill.textContent = "PDF engine: BLOCKED";
      }else{
        libPill.className = "pill warn";
        libPill.textContent = "PDF engine: ON DEMAND";
      }

      const tryFetch = async (url) => {
        try{
          const res = await fetch(url, { method:"HEAD", cache:"no-store" });
          return res.ok;
        }catch(e){
          return false;
        }
      };

      let ok = false;
      if(mode === "csp"){
        // For CSP, we now generate programmatically, so we just check the logo
        ok = await tryFetch("atl-logo.png") || await tryFetch("/atl-logo.png");
      }else if(mode === "ground"){
        ok = await tryFetch("templates/1.pdf") || await tryFetch("/templates/1.pdf");
      }else if(mode === "excavation"){
        ok = await tryFetch("atl-logo.png") || await tryFetch("/atl-logo.png");
      }else{
        ok = await tryFetch("templates/daily-briefing.pdf");
      }

      if(ok){
        tplPill.className = "pill ok";
        tplPill.textContent = "Assets: OK";
      }else{
        tplPill.className = "pill bad";
        tplPill.textContent = "Assets: MISSING";
      }
    }

    function renderConfinedSpacePermit(){
      const app = $("#app");
      app.innerHTML = "";

      const state = {
        projectTitle: "",
        projectNo: "",
        siteLocation: "",
        workLocation: "",
        contractorName: "Active Tunnelling",
        supervisorName: "",
        brieferName: "",
        jobTitle: "",
        permitNo: "",
        dateISO: todayISO(),
        startTime: "",
        finishTime: "",
        workDescription: "",
        personnel: "",
        preEntryBriefing: "",
        points: {
          confined:false, emergency:false, lifting:false, permits:false, plant:false, safetyPlanning:false,
          barriers:false, clearAccess:false, methodStatements:false, suitablePPE:false, trenchCollapse:false, welfare:false,
          coshh:false, fire:false, materials:false, competence:false, cables:false, trips:false
        },
        equipment: "",
        riskAssessment: {
          o2: false, toxic: false, flammable: false, ingress: false, sludge: false,
          animals: false, mechanical: false, hotwork: false, chemicals: false,
          physical: false, temperature: false, radiation: false
        },
        riskOthers: "",
        controls: {
          isoPhys: false, isoElec: false, isoMech: false, cleaning: false,
          ventNat: false, ventForced: false, light110: false, lightLow: false,
          signage: false, comms: false, testing: false, monitoring: false,
          extinguishers: false, rpe: false, training: false
        },
        controlsOthers: "",
        emergency: {
          plan: false, tripod: false, harness: false, fallArrest: false,
          stretcher: false, resuscitation: false, ba: false, light: false,
          alarm: false, comms: false, standby: false
        },
        safetyEquipment: {
          head: false, eye: false, hearing: false, foot: false, hand: false,
          hiVis: false, fallArrest: false, rpe: false
        },
        safetyOthers: "",
        standbyPerson: "",
        rescueArrangements: "",
        emergencyContact: "",
        hospitalDetails: "",
        firstAid: "",
        commMethod: "",
        bumpTestDone: false,
        monitorDevice1: "",
        monitorSerial1: "",
        monitorDevice2: "",
        monitorSerial2: "",
        authorisingPerson: "",
        authorisingTime: "",
        closureName: "",
        closureTime: ""
      };

      const head = el("div",{class:"head"},[
        el("div",{},[
          el("h1",{},["Confined Space Permit"]),
          el("div",{class:"sub"},["Pre-fill the permit details, then download the PDF to be completed by hand on site."])
        ]),
        el("div",{class:"pillRow"},[
          el("span",{id:"pillLib", class:"pill warn"},["PDF engine: checking..."]),
          el("span",{id:"pillTpl", class:"pill warn"},["Template: checking..."])
        ])
      ]);

      const banner = el("div",{id:"banner", class:"banner"},[""]);

      const sDetails = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["1. Work Description"]),
        el("div",{class:"grid2"},[
          field("Project Title","projectTitle","text","e.g. Sizewell C", state.projectTitle),
          field("Project No","projectNo","text","e.g. 836", state.projectNo),
          field("Site Location","siteLocation","text","e.g. Sizewell", state.siteLocation),
          field("Work Location","workLocation","text","e.g. Shaft 4", state.workLocation),
          field("Contractor Name","contractorName","text","", state.contractorName),
          field("Supervisor Name","supervisorName","text","", state.supervisorName),
          field("Name of Person giving briefing","brieferName","text","", state.brieferName),
          field("Job Title of briefer","jobTitle","text","", state.jobTitle),
          field("Permit No.","permitNo","text","e.g. CSP-001", state.permitNo),
          field("Date","dateISO","date","", state.dateISO),
          field("Valid From (Time)","startTime","time","", state.startTime),
          field("Valid To (Time)","finishTime","time","", state.finishTime),
        ]),
        el("div",{style:"margin-top:12px"},[
          textareaField("Description of work to be carried out","workDescription","What work is being carried out?", state.workDescription),
          textareaField("Personnel entering the confined space","personnel","Names of operatives entering the confined space", state.personnel),
        ])
      ]);

      const sBriefing = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Pre-entry Briefing"]),
        el("div",{class:"grid3auto"},[
          chk("pt_confined","Confined Spaces / Areas", state.points.confined),
          chk("pt_emergency","Emergency Procedures", state.points.emergency),
          chk("pt_lifting","Lifting Equipment - Chains / Slings", state.points.lifting),
          chk("pt_permits","Permits to Work", state.points.permits),
          chk("pt_plant","Plant & Equipment", state.points.plant),
          chk("pt_safetyPlanning","Safety Planning", state.points.safetyPlanning),
          chk("pt_barriers","Barriers / Edge Protection", state.points.barriers),
          chk("pt_clearAccess","Clear Access Ways", state.points.clearAccess),
          chk("pt_methodStatements","Method Statements / Risk Assessments", state.points.methodStatements),
          chk("pt_suitablePPE","Suitable PPE", state.points.suitablePPE),
          chk("pt_trenchCollapse","Trench Collapse", state.points.trenchCollapse),
          chk("pt_welfare","Welfare Facilities", state.points.welfare),
          chk("pt_coshh","COSHH Assessments", state.points.coshh),
          chk("pt_fire","Fire Precautions", state.points.fire),
          chk("pt_materials","Materials", state.points.materials),
          chk("pt_competence","Operative Experience / Competence", state.points.competence),
          chk("pt_cables","Overhead / Underground Cable Strike", state.points.cables),
          chk("pt_trips","Trips / Falls", state.points.trips),
        ]),
        el("div",{style:"margin-top:12px"},[
          textareaField("Additional Briefing Information","preEntryBriefing","Details of briefing given to personnel...", state.preEntryBriefing),
        ])
      ]);

      const sEquipment = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["2. Equipment / Tools to be used"]),
        textareaField("Tools & Equipment","equipment","List all tools, plant and equipment to be used...", state.equipment)
      ]);

      const sRisk = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["3. Risk Assessment"]),
        el("div",{class:"grid3auto"},[
          chk("ra_o2","Oxygen enrichment/deficiency", state.riskAssessment.o2),
          chk("ra_toxic","Toxic gases/vapours/fumes", state.riskAssessment.toxic),
          chk("ra_flammable","Flammable gases/vapours/fumes", state.riskAssessment.flammable),
          chk("ra_ingress","Ingress of liquids/gas/solids", state.riskAssessment.ingress),
          chk("ra_sludge","Sludge/deposits/waste", state.riskAssessment.sludge),
          chk("ra_animals","Animals/biological hazards", state.riskAssessment.animals),
          chk("ra_mechanical","Mechanical/electrical hazards", state.riskAssessment.mechanical),
          chk("ra_hotwork","Hot work within space", state.riskAssessment.hotwork),
          chk("ra_chemicals","Use of chemicals", state.riskAssessment.chemicals),
          chk("ra_physical","Physical/structural hazards", state.riskAssessment.physical),
          chk("ra_temperature","Temperature extremes", state.riskAssessment.temperature),
          chk("ra_radiation","Ionising radiation", state.riskAssessment.radiation),
        ]),
        el("div",{style:"margin-top:12px"},[
          field("Others (specify)","riskOthers","text","Any other risks...", state.riskOthers)
        ])
      ]);

      const sControls = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["4. Controls"]),
        el("div",{class:"grid3auto"},[
          chk("co_isoPhys","Isolation - Physical", state.controls.isoPhys),
          chk("co_isoElec","Isolation - Electrical", state.controls.isoElec),
          chk("co_isoMech","Isolation - Mechanical", state.controls.isoMech),
          chk("co_cleaning","Cleaning/Purging of space", state.controls.cleaning),
          chk("co_ventNat","Ventilation - Natural", state.controls.ventNat),
          chk("co_ventForced","Ventilation - Forced", state.controls.ventForced),
          chk("co_light110","Lighting - 110V", state.controls.light110),
          chk("co_lightLow","Lighting - Low Voltage", state.controls.lightLow),
          chk("co_signage","Safety signage/Barricades", state.controls.signage),
          chk("co_comms","Communication equipment", state.controls.comms),
          chk("co_testing","Atmospheric testing (initial)", state.controls.testing),
          chk("co_monitoring","Constant monitoring", state.controls.monitoring),
          chk("co_extinguishers","Fire extinguishers", state.controls.extinguishers),
          chk("co_rpe","RPE (BA / Escape set)", state.controls.rpe),
          chk("co_training","Training/Competence", state.controls.training),
        ]),
        el("div",{style:"margin-top:12px"},[
          field("Others (specify)","controlsOthers","text","Any other controls...", state.controlsOthers)
        ])
      ]);

      const sSafety = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["6. Safety Equipment"]),
        el("div",{class:"grid3auto"},[
          chk("se_head","Head protection (Hard hat)", state.safetyEquipment.head),
          chk("se_eye","Eye protection", state.safetyEquipment.eye),
          chk("se_hearing","Hearing protection", state.safetyEquipment.hearing),
          chk("se_foot","Foot protection", state.safetyEquipment.foot),
          chk("se_hand","Hand protection", state.safetyEquipment.hand),
          chk("se_hiVis","High visibility clothing", state.safetyEquipment.hiVis),
          chk("se_fallArrest","Fall arrest / restraint", state.safetyEquipment.fallArrest),
          chk("se_rpe","Respiratory protection (RPE)", state.safetyEquipment.rpe),
        ]),
        el("div",{style:"margin-top:12px"},[
          field("Others (specify)","safetyOthers","text","Any other safety equipment...", state.safetyOthers)
        ])
      ]);

      const sEmergency = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["5. Emergency Arrangements"]),
        el("div",{class:"grid3auto"},[
          chk("em_plan","Rescue plan in place", state.emergency.plan),
          chk("em_tripod","Tripod / Winch / Davit", state.emergency.tripod),
          chk("em_harness","Harness / Rescue line", state.emergency.harness),
          chk("em_fallArrest","Fall arrest equipment", state.emergency.fallArrest),
          chk("em_stretcher","Recovery stretcher", state.emergency.stretcher),
          chk("em_resuscitation","Resuscitation equipment", state.emergency.resuscitation),
          chk("em_ba","Breathing apparatus (Rescue)", state.emergency.ba),
          chk("em_light","Emergency lighting", state.emergency.light),
          chk("em_alarm","Method of raising alarm", state.emergency.alarm),
          chk("em_comms","Method of communication", state.emergency.comms),
          chk("em_standby","Standby person (Top-man)", state.emergency.standby),
        ]),
        el("div",{class:"grid2", style:"margin-top:12px"},[
          field("Standby Person(s) Name","standbyPerson","text","", state.standbyPerson),
          field("Emergency Contact Number","emergencyContact","text","", state.emergencyContact),
          field("Nearest Hospital Details","hospitalDetails","text","", state.hospitalDetails),
          field("Emergency First Aid provision","firstAid","text","e.g. First aider on site", state.firstAid),
          field("Method of Communication","commMethod","text","e.g. Two-way radio", state.commMethod),
        ]),
        el("div",{style:"margin-top:12px"},[
          textareaField("Specific Rescue Arrangements / Plan","rescueArrangements","Details of the rescue plan...", state.rescueArrangements),
        ])
      ]);

      const sMonitoring = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Monitoring, Certification & Closure"]),
        el("div",{class:"grid2"},[
          chk("bumpTestDone", "Gas Monitor Bump Test confirmed?", state.bumpTestDone),
        ]),
        el("div",{class:"grid2", style:"margin-top:10px"},[
          field("Monitoring Device 1","monitorDevice1","text","e.g. GMI PS200", state.monitorDevice1),
          field("Serial Number 1","monitorSerial1","text","", state.monitorSerial1),
          field("Monitoring Device 2","monitorDevice2","text","", state.monitorDevice2),
          field("Serial Number 2","monitorSerial2","text","", state.monitorSerial2),
        ]),
        el("div",{class:"grid2", style:"margin-top:12px"},[
          field("Authorising Person (Section 6)","authorisingPerson","text","Name of person authorising entry", state.authorisingPerson),
          field("Authorising Time","authorisingTime","time","", state.authorisingTime),
          field("Closure Name (Section 7)","closureName","text","Name for permit closure", state.closureName),
          field("Closure Time","closureTime","time","", state.closureTime),
        ])
      ]);

      const sticky = el("div",{class:"stickyBar"},[
        el("div",{class:"actionBar"},[
          el("div",{class:"btnRow"},[
            el("a",{class:"btn btnYellow", href:"daily.html"},["Back"]),
          ]),
          el("div",{class:"btnRow"},[
            el("button",{id:"btnDownload", class:"btn", type:"button", onclick: async()=> {
              hideBanner();
              await onDownload();
            }},["Download PDF"])
          ])
        ])
      ]);

      app.appendChild(head);
      app.appendChild(banner);
      app.appendChild(sDetails);
      app.appendChild(sBriefing);
      app.appendChild(sEquipment);
      app.appendChild(sRisk);
      app.appendChild(sControls);
      app.appendChild(sEmergency);
      app.appendChild(sSafety);
      app.appendChild(sMonitoring);
      app.appendChild(sticky);

      checkTemplateAndLib("csp");

      function field(labelText, id, type, placeholder, val = ""){
        return el("div",{},[
          el("label",{for:id},[labelText]),
          el("input",{id, type, placeholder, value: val})
        ]);
      }
      function textareaField(labelText, id, placeholder, val = ""){
        const txt = el("textarea",{id, placeholder});
        txt.value = val;
        return el("div",{},[
          el("label",{for:id},[labelText]),
          txt
        ]);
      }
      function chk(id, labelText, checked = false){
        const input = el("input",{type:"checkbox", id});
        if(checked) input.checked = true;
        return el("label",{class:"check", for:id},[
          input,
          el("span",{},[labelText])
        ]);
      }

      async function onDownload(){
        const btn = $("#btnDownload");
        btn.disabled = true;
        btn.textContent = "Generating...";
        try{
          const data = {
            projectTitle: $("#projectTitle").value.trim(),
            projectNo: $("#projectNo").value.trim(),
            siteLocation: $("#siteLocation").value.trim(),
            workLocation: $("#workLocation").value.trim(),
            contractorName: $("#contractorName").value.trim(),
            supervisorName: $("#supervisorName").value.trim(),
            brieferName: $("#brieferName").value.trim(),
            jobTitle: $("#jobTitle").value.trim(),
            permitNo: $("#permitNo").value.trim(),
            dateISO: $("#dateISO").value,
            startTime: $("#startTime").value,
            finishTime: $("#finishTime").value,
            workDescription: $("#workDescription").value.trim(),
            personnel: $("#personnel").value.trim(),
            preEntryBriefing: $("#preEntryBriefing").value.trim(),
            points: {
              confined: $("#pt_confined").checked, emergency: $("#pt_emergency").checked, lifting: $("#pt_lifting").checked,
              permits: $("#pt_permits").checked, plant: $("#pt_plant").checked, safetyPlanning: $("#pt_safetyPlanning").checked,
              barriers: $("#pt_barriers").checked, clearAccess: $("#pt_clearAccess").checked, methodStatements: $("#pt_methodStatements").checked,
              suitablePPE: $("#pt_suitablePPE").checked, trenchCollapse: $("#pt_trenchCollapse").checked, welfare: $("#pt_welfare").checked,
              coshh: $("#pt_coshh").checked, fire: $("#pt_fire").checked, materials: $("#pt_materials").checked,
              competence: $("#pt_competence").checked, cables: $("#pt_cables").checked, trips: $("#pt_trips").checked
            },
            equipment: $("#equipment").value.trim(),
            riskAssessment: {
              o2: $("#ra_o2").checked, toxic: $("#ra_toxic").checked, flammable: $("#ra_flammable").checked,
              ingress: $("#ra_ingress").checked, sludge: $("#ra_sludge").checked, animals: $("#ra_animals").checked,
              mechanical: $("#ra_mechanical").checked, hotwork: $("#ra_hotwork").checked, chemicals: $("#ra_chemicals").checked,
              physical: $("#ra_physical").checked, temperature: $("#ra_temperature").checked, radiation: $("#ra_radiation").checked
            },
            riskOthers: $("#riskOthers").value.trim(),
            controls: {
              isoPhys: $("#co_isoPhys").checked, isoElec: $("#co_isoElec").checked, isoMech: $("#co_isoMech").checked,
              cleaning: $("#co_cleaning").checked, ventNat: $("#co_ventNat").checked, ventForced: $("#co_ventForced").checked,
              light110: $("#co_light110").checked, lightLow: $("#co_lightLow").checked, signage: $("#co_signage").checked,
              comms: $("#co_comms").checked, testing: $("#co_testing").checked, monitoring: $("#co_monitoring").checked,
              extinguishers: $("#co_extinguishers").checked, rpe: $("#co_rpe").checked,
              training: $("#co_training").checked
            },
            controlsOthers: $("#controlsOthers").value.trim(),
            emergency: {
              plan: $("#em_plan").checked, tripod: $("#em_tripod").checked, harness: $("#em_harness").checked,
              fallArrest: $("#em_fallArrest").checked, stretcher: $("#em_stretcher").checked, resuscitation: $("#em_resuscitation").checked,
              ba: $("#em_ba").checked, light: $("#em_light").checked, alarm: $("#em_alarm").checked,
              comms: $("#em_comms").checked, standby: $("#em_standby").checked
            },
            safetyEquipment: {
              head: $("#se_head").checked, eye: $("#se_eye").checked, hearing: $("#se_hearing").checked,
              foot: $("#se_foot").checked, hand: $("#se_hand").checked, hiVis: $("#se_hiVis").checked,
              fallArrest: $("#se_fallArrest").checked, rpe: $("#se_rpe").checked
            },
            safetyOthers: $("#safetyOthers").value.trim(),
            standbyPerson: $("#standbyPerson").value.trim(),
            emergencyContact: $("#emergencyContact").value.trim(),
            hospitalDetails: $("#hospitalDetails").value.trim(),
            rescueArrangements: $("#rescueArrangements").value.trim(),
            firstAid: $("#firstAid").value.trim(),
            commMethod: $("#commMethod").value.trim(),
            bumpTestDone: $("#bumpTestDone").checked,
            monitorDevice1: $("#monitorDevice1").value.trim(),
            monitorSerial1: $("#monitorSerial1").value.trim(),
            monitorDevice2: $("#monitorDevice2").value.trim(),
            monitorSerial2: $("#monitorSerial2").value.trim(),
            authorisingPerson: $("#authorisingPerson").value.trim(),
            authorisingTime: $("#authorisingTime").value,
            closureName: $("#closureName").value.trim(),
            closureTime: $("#closureTime").value
          };
          await generateConfinedSpacePDF(data);
        }catch(err){
          showBanner(String(err && err.message ? err.message : err), "bad");
        }finally{
          btn.disabled = false;
          btn.textContent = "Download PDF";
        }
      }
    }

    function renderDailyBrief(){
      const app = $("#app");
      app.innerHTML = "";

      const MAX_ATTENDEES = 96;

      const state = {
        projectTitle:"",
        siteLocation:"",
        workLocation:"",
        projectNo:"",
        brieferName:"",
        dateISO: todayISO(),
        jobTitle:"",
        prevPlanned:"Yes",
        prevConcerns:"",
        todayPlanned:"",
        covered:"Yes",
        controls:"Yes",
        ppe:"Yes",
        points:{
          confined:false, emergency:false, lifting:false, permits:false, plant:false, safetyPlanning:false,
          barriers:false, clearAccess:false, methodStatements:false, suitablePPE:false, trenchCollapse:false, welfare:false,
          coshh:false, fire:false, materials:false, competence:false, cables:false, trips:false
        },
        attendees:[ { id: makeId(), name:"", dateISO: todayISO() } ]
      };

      const head = el("div",{class:"head"},[
        el("div",{},[
          el("h1",{},["Daily Brief"]),
          el("div",{class:"sub"},["Fill it in, collect signatures per attendee, then download the PDF."])
        ]),
        el("div",{class:"pillRow"},[
          el("span",{id:"pillLib", class:"pill warn"},["PDF engine: checking..."]),
          el("span",{id:"pillTpl", class:"pill warn"},["Template: checking..."])
        ])
      ]);

      const banner = el("div",{id:"banner", class:"banner"},[""]);

      const sDetails = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Project & briefing details"]),
        el("div",{class:"grid2"},[
          field("Project title","projectTitle","text","e.g. Sizewell C"),
          field("Project no","projectNo","text","e.g. 836"),
          field("Site location","siteLocation","text","e.g. Sizewell"),
          field("Work location","workLocation","text","e.g. Cofferdams"),
          field("Name of person giving briefing","brieferName","text","e.g. Aureliu Nica"),
          field("Job title","jobTitle","text","e.g. Site Agent"),
          field("Date","dateISO","date",""),
          selectField("Did previous day go as planned?","prevPlanned",["Yes","No"])
        ])
      ]);

      const sBrief = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Briefing"]),
        el("div",{class:"grid2"},[
          textareaField("Any concerns from the previous day?","prevConcerns","Write concerns / issues / lessons learned..."),
          textareaField("Today's planned activities briefing","todayPlanned","What are we doing today? Key risks, controls, sequence...")
        ])
      ]);

      const sPoints = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Points discussed for today's operation"]),
        el("div",{class:"grid3auto"},[
          chk("confined","Confined Spaces / Areas"),
          chk("emergency","Emergency Procedures"),
          chk("lifting","Lifting Equipment - Chains / Slings"),
          chk("permits","Permits to Work"),
          chk("plant","Plant & Equipment"),
          chk("safetyPlanning","Safety Planning"),
          chk("barriers","Barriers / Edge Protection"),
          chk("clearAccess","Clear Access Ways"),
          chk("methodStatements","Method Statements / Risk Assessments"),
          chk("suitablePPE","Suitable PPE"),
          chk("trenchCollapse","Trench Collapse"),
          chk("welfare","Welfare Facilities"),
          chk("coshh","COSHH Assessments"),
          chk("fire","Fire Precautions"),
          chk("materials","Materials"),
          chk("competence","Operative Experience / Competence"),
          chk("cables","Overhead / Underground Cable Strike"),
          chk("trips","Trips / Falls"),
        ])
      ]);

      const sConfirm = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Confirmations"]),
        el("div",{class:"grid2"},[
          selectField("Are all today's activities covered by the procedure / MS / RA?","covered",["Yes","No"]),
          selectField("Are all control measures in place?","controls",["Yes","No"]),
          selectField("Are all operatives compliant with PPE requirements?","ppe",["Yes","No"]),
        ])
      ]);

      const sAtt = el("div",{class:"section"},[
        el("div",{class:"attTop"},[
          el("div",{class:"sectionTitle", style:"margin:0;"},["Attendees (sign-up sheet)"]),
          el("button",{class:"btn btnGhost", type:"button", onclick:()=>addAttendee()},["+ Add attendee"])
        ]),
        el("div",{id:"attWrap"},[]),
        el("div",{class:"note"},[`PDF supports up to ${MAX_ATTENDEES} attendees (adds pages automatically).`])
      ]);

      const sticky = el("div",{class:"stickyBar"},[
        el("div",{class:"actionBar"},[
          el("div",{class:"btnRow"},[
            el("a",{class:"btn btnYellow", href:"daily.html"},["Back"]),
            el("span",{id:"attCount", class:"pill"},["Attendees: 0"])
          ]),
          el("div",{class:"btnRow"},[
            el("button",{id:"btnDownload", class:"btn", type:"button", onclick: async()=> {
              hideBanner();
              await onDownload();
            }},["Download PDF"])
          ])
        ])
      ]);

      app.appendChild(head);
      app.appendChild(banner);
      app.appendChild(sDetails);
      app.appendChild(sBrief);
      app.appendChild(sPoints);
      app.appendChild(sConfirm);
      app.appendChild(sAtt);
      app.appendChild(sticky);

      $("#prevPlanned").value = state.prevPlanned;
      $("#covered").value = state.covered;
      $("#controls").value = state.controls;
      $("#ppe").value = state.ppe;

      rebuildAttendees();
      updateAttCount();
      checkTemplateAndLib("daily");

      function field(labelText, id, type, placeholder){
        return el("div",{},[
          el("label",{for:id},[labelText]),
          el("input",{id, type, placeholder})
        ]);
      }
      function textareaField(labelText, id, placeholder){
        return el("div",{},[
          el("label",{for:id},[labelText]),
          el("textarea",{id, placeholder})
        ]);
      }
      function selectField(labelText, id, options){
        return el("div",{},[
          el("label",{for:id},[labelText]),
          el("select",{id}, options.map(o=> el("option",{value:o},[o])) )
        ]);
      }
      function chk(key, labelText){
        const id = "pt_" + key;
        return el("label",{class:"check", for:id},[
          el("input",{type:"checkbox", id}),
          el("span",{},[labelText])
        ]);
      }

      function addAttendee(){
        const list = collectAttendees();
        if(list.length >= MAX_ATTENDEES){
          showBanner(`Max ${MAX_ATTENDEES} attendees.`, "warn");
          return;
        }
        list.push({ id: makeId(), name:"", dateISO: todayISO() });
        state.attendees = list;
        rebuildAttendees();
        updateAttCount();
      }

      function rebuildAttendees(){
        const wrap = $("#attWrap");
        wrap.innerHTML = "";
        const list = state.attendees;

        list.forEach((a, idx)=>{
          const sigUrl = sigStore.get(a.id) || "";

          const sigPreview = el("div",{class:"sigPreview", "data-prev":a.id, role:"button", tabindex:"0", title:"Tap to sign"},[
            sigUrl ? el("img",{src:sigUrl, alt:"Signature"}) : el("span",{},["Tap to sign"])
          ]);

          const nameInput = el("input",{type:"text", value:a.name || "", placeholder:"Name", "data-name":a.id});
          const dateInput = el("input",{type:"date", value:a.dateISO || todayISO(), "data-date":a.id});

          nameInput.addEventListener("input", updateAttCount);

          const openSig = () => {
            const nm = (nameInput.value || "").trim();
            SigModal.open(a.id, nm || `Attendee ${idx+1}`, (id, url)=>{
              const box = wrap.querySelector(`[data-prev="${id}"]`);
              if(box){
                box.innerHTML = "";
                box.appendChild(el("img",{src:url, alt:"Signature"}));
              }
            });
          };

          sigPreview.addEventListener("click", openSig);
          sigPreview.addEventListener("keydown", (e)=>{
            if(e.key === "Enter" || e.key === " "){
              e.preventDefault();
              openSig();
            }
          });

          const btnDelete = el("button",{class:"btn btnDanger", type:"button", onclick:()=>{
            const now = collectAttendees().filter(x=>x.id !== a.id);
            sigStore.delete(a.id);
            state.attendees = now.length ? now : [{ id: makeId(), name:"", dateISO: todayISO() }];
            rebuildAttendees();
            updateAttCount();
          }},["Delete"]);

          const row = el("div",{class:"attRow"},[
            el("div",{class:"attName"},[
              el("label",{},["Name"]),
              nameInput
            ]),
            el("div",{class:"attDate"},[
              el("label",{},["Date"]),
              dateInput
            ]),
            el("div",{class:"attSig"},[
              el("label",{},["Signature"]),
              sigPreview
            ]),
            el("div",{class:"attRemove"},[
              el("label",{},["Remove"]),
              btnDelete
            ])
          ]);

          wrap.appendChild(row);
        });
      }

      function collectAttendees(){
        const wrap = $("#attWrap");
        const rows = [...wrap.querySelectorAll(".attRow")];
        return rows.map(r=>{
          const nameInp = r.querySelector("input[data-name]");
          const dateInp = r.querySelector("input[data-date]");
          const id = nameInp.getAttribute("data-name");
          return {
            id,
            name: (nameInp.value || "").trim(),
            dateISO: (dateInp.value || todayISO()),
            signature: sigStore.get(id) || ""
          };
        });
      }

      function updateAttCount(){
        const count = collectAttendees().filter(a => a.name.length>0).length;
        $("#attCount").textContent = `Attendees: ${count}`;
      }

      function readForm(){
        const data = {
          projectTitle: $("#projectTitle").value.trim(),
          siteLocation: $("#siteLocation").value.trim(),
          workLocation: $("#workLocation").value.trim(),
          projectNo: $("#projectNo").value.trim(),
          brieferName: $("#brieferName").value.trim(),
          dateISO: $("#dateISO").value || todayISO(),
          jobTitle: $("#jobTitle").value.trim(),
          prevPlanned: $("#prevPlanned").value,
          prevConcerns: $("#prevConcerns").value.trim(),
          todayPlanned: $("#todayPlanned").value.trim(),
          covered: $("#covered").value,
          controls: $("#controls").value,
          ppe: $("#ppe").value,
          points: {}
        };

        Object.keys(state.points).forEach(k=>{
          const box = document.getElementById("pt_"+k);
          data.points[k] = !!(box && box.checked);
        });

        data.attendees = collectAttendees().filter(a => a.name.length>0);
        return data;
      }

      async function onDownload(){
        const btn = $("#btnDownload");
        btn.disabled = true;
        btn.textContent = "Generating...";
        try{
          const data = readForm();
          await generateDailyBriefPDF(data);
        }catch(err){
          showBanner(String(err && err.message ? err.message : err), "bad");
        }finally{
          btn.disabled = false;
          btn.textContent = "Download PDF";
        }
      }
    }

    function renderHotWorkPermit(){
      const app = $("#app");
      app.innerHTML = "";

      const state = {
        permitNo:"",
        dateRequired: todayISO(),
        requestedBy:"",
        address:"",
        description:"",
        activities:{
          welding:false, burning:false, soldering:false, gasCutting:false, brazing:false,
          discCutting:false, heathland:false, other:false
        },
        hwrp:"",
        contractor:"",
        fireSafety:"",
        precautions:{},
        precautionsNa:{},
        checks:{},
        checksNa:{},
        extinguishers:{ co2:false, foam:false, water:false, dryPowder:false },
        sketch:"",
        permitValidFrom:"",
        permitValidTo:"",
        permitTimeFrom:"",
        permitTimeTo:"",
        authorisedBy:"",
        authorisedSig:"",
        authorisedDate:"",
        fireWatcher:"",
        fireWatcherSig:"",
        fireWatcherDate:"",
        hwrpName:"",
        hwrpSig:"",
        hwrpDate:"",
        clearanceYes:false,
        clearanceNa:false,
        completionHours:"",
        fireWatchHours:"",
        completionTimeFrom:"",
        completionTimeTo:"",
        fireWatchTimeFrom:"",
        fireWatchTimeTo:"",
        clearanceBy:"",
        clearanceSig:"",
        clearanceDate:""
      };

      const head = el("div",{class:"head"},[
        el("div",{},[
          el("h1",{},["Hot Work Permit"]),
          el("div",{class:"sub"},["Fill in the permit details, then download the PDF."])
        ]),
        el("div",{class:"pillRow"},[
          el("span",{id:"pillLib", class:"pill warn"},["PDF engine: checking..."])
        ])
      ]);

      const banner = el("div",{id:"banner", class:"banner"},[""]);

      const sDetails = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Permit details"]),
        el("div",{class:"grid2"},[
          field("Permit No.","permitNo","text",""),
          field("Date required","dateRequired","date",""),
          field("Permit requested by","requestedBy","text",""),
          textareaField("Address and location","address",""),
          textareaField("Description of works","description","")
        ])
      ]);

      const sActivities = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Activity involves"]),
        el("div",{class:"grid3auto"},[
          chk("welding","Welding incl. Thermic Melting"),
          chk("burning","Burning or Cutting"),
          chk("soldering","Soldering"),
          chk("gasCutting","Gas cutting"),
          chk("brazing","Brazing"),
          chk("discCutting","Disc cutting/grinding"),
          chk("heathland","Heathland clearing"),
          chk("other","Other")
        ])
      ]);

      const sPeople = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Responsible people"]),
        el("div",{class:"grid2"},[
          field("Hot Works Responsible Person (HWRP)","hwrp","text",""),
          field("Contractor/company carrying out hot works","contractor","text",""),
          field("Responsible person for Fire Safety","fireSafety","text","")
        ])
      ]);

      const formatQpfs = (num)=> `QPFS.${String(num).padStart(3, "0")}`;
      const precautionsList = [
        "A risk assessment has been carried out for the Hot Works Activity",
        "The inherent risks within the building or asset fire risk assessment have been considered",
        "The building/asset fire warden has been made aware of any potential risks",
        "There will be an appointed Fire Watcher, who will be available for the period of the Hot Works",
        "Have any automatic fire alarms and detection systems been isolated?",
        "Confirmation that the fire alarm will be immediately, cleaned, tested and reinstated before the permit is signed off",
        "If work is to take place outside/in rural areas, specify any additional controls required",
        "Is area clear of removable combustible material/flamable liquids within 6m of the hot work?",
        "Any non-moveable combustible material within 6m protected from heat/sparks?",
        "Access/egress arrangements defined for non-authorised personnel?",
        "Duties and nominated persons for fire watch and inspection defined and briefed?",
        "Other working in proximity of hot works informed and briefed?",
        "Suitable screens/barriers to contain sparks/shield arc from eyes?",
        "Suitable clear escape signage posted?",
        "Competency checks carried out on those undertaking the works?",
        "Gas cylinders secured in vertical position or trolley 6m from burners?",
        "Regulators and flashback arrestors fitted to all gas cylinders?",
        "All equipment checked/tested? Jubilee clips must not be used.",
        "Is the area adequately ventilated? If Confined Space, permit/gas detection in place?"
      ].map((text, idx)=> ({ code: formatQpfs(idx + 1), text }));

      const checksList = [
        "Has a check been undertaken to confirm there is no gas leakage?",
        "Are smoking and naked lights prohibited?",
        "Has suitable firefighting equipment been provided and user is competent?",
        "Has consideration been given to isolation and purging of systems?",
        "Have sand and sand trays been provided for containment of molten metal?",
        "Has suitable flame retardant PPE been issued?",
        "Is there a clear process of what to do in the event of a fire?"
      ].map((text, idx)=> ({
        code: formatQpfs(precautionsList.length + idx + 1),
        text
      }));

      const sPrecautions = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Precautions to be checked immediately before commencement"]),
        el("div",{class:"grid1"},[
          ...precautionsList.map(({ code, text }, idx)=> {
            const yesId = `prec_${idx}`;
            const naId = `prec_na_${idx}`;
            return el("div",{class:"check", style:"justify-content:space-between; gap:12px;"},[
              el("div",{},[
                el("span",{},[el("strong",{},[`${code} `]), text])
              ]),
              el("div",{style:"display:flex; gap:10px; align-items:center;"},[
                el("label",{for:"pt_"+yesId, style:"display:flex; align-items:center; gap:6px; margin:0;"},[
                  el("input",{type:"checkbox", id:"pt_"+yesId}),
                  el("span",{},["Yes"])
                ]),
                el("label",{for:"pt_"+naId, style:"display:flex; align-items:center; gap:6px; margin:0;"},[
                  el("input",{type:"checkbox", id:"pt_"+naId}),
                  el("span",{},["N/A"])
                ])
              ])
            ]);
          })
        ])
      ]);

      const sChecks = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Additional checks"]),
        el("div",{class:"grid1"},[
          ...checksList.map(({ code, text }, idx)=> {
            const yesId = `chk_${idx}`;
            const naId = `chk_na_${idx}`;
            return el("div",{class:"check", style:"justify-content:space-between; gap:12px;"},[
              el("div",{},[
                el("span",{},[el("strong",{},[`${code} `]), text])
              ]),
              el("div",{style:"display:flex; gap:10px; align-items:center;"},[
                el("label",{for:"pt_"+yesId, style:"display:flex; align-items:center; gap:6px; margin:0;"},[
                  el("input",{type:"checkbox", id:"pt_"+yesId}),
                  el("span",{},["Yes"])
                ]),
                el("label",{for:"pt_"+naId, style:"display:flex; align-items:center; gap:6px; margin:0;"},[
                  el("input",{type:"checkbox", id:"pt_"+naId}),
                  el("span",{},["N/A"])
                ])
              ])
            ]);
          })
        ]),
        el("div",{class:"grid3auto", style:"margin-top:10px;"},[
          chk("co2","CO2"),
          chk("foam","Foam"),
          chk("water","Water"),
          chk("dryPowder","Dry Powder")
        ])
      ]);

      const sSketch = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Sketch of work area"]),
        el("div",{class:"grid1"},[
          textareaField("Work area sketch / notes","sketch","")
        ])
      ]);

      const sAuth = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Authorisation"]),
        el("div",{class:"grid2"},[
          field("Permit valid from (date)","permitValidFrom","date",""),
          field("Permit valid to (date)","permitValidTo","date",""),
          field("Time from","permitTimeFrom","text",""),
          field("Time to","permitTimeTo","text",""),
          field("Name of person undertaking hot works","authorisedBy","text",""),
          field("Signature","authorisedSig","text",""),
          field("Date/Time","authorisedDate","text",""),
          field("Name of person appointed as Fire Watcher","fireWatcher","text",""),
          field("Signature","fireWatcherSig","text",""),
          field("Date/Time","fireWatcherDate","text",""),
          field("Name of HWRP","hwrpName","text",""),
          field("Signature","hwrpSig","text",""),
          field("Date/Time","hwrpDate","text","")
        ])
      ]);

      const sClear = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Fire Watch Clearance & Cancellation"]),
        el("div",{class:"grid2"},[
          field("Works completed after (hrs)","completionHours","text",""),
          field("Fire watch maintained after (hrs)","fireWatchHours","text",""),
          field("From (time)","completionTimeFrom","text",""),
          field("To (time)","completionTimeTo","text",""),
          field("From (time)","fireWatchTimeFrom","text",""),
          field("To (time)","fireWatchTimeTo","text",""),
          field("Name of person appointed as Fire Watcher","clearanceBy","text",""),
          field("Signature","clearanceSig","text",""),
          field("Date/Time","clearanceDate","text","")
        ])
      ]);

      const sticky = el("div",{class:"stickyBar"},[
        el("div",{class:"actionBar"},[
          el("div",{class:"btnRow"},[
            el("a",{class:"btn btnYellow", href:"daily.html"},["Back"])
          ]),
          el("div",{class:"btnRow"},[
            el("button",{id:"btnDownload", class:"btn", type:"button", onclick: async()=> {
              hideBanner();
              await onDownload();
            }},["Download PDF"])
          ])
        ])
      ]);

      app.appendChild(head);
      app.appendChild(banner);
      app.appendChild(sDetails);
      app.appendChild(sActivities);
      app.appendChild(sPeople);
      app.appendChild(sPrecautions);
      app.appendChild(sChecks);
      app.appendChild(sSketch);
      app.appendChild(sAuth);
      app.appendChild(sClear);
      app.appendChild(sticky);

      checkTemplateAndLib("csp");

      function field(labelText, id, type, placeholder){
        return el("div",{},[
          el("label",{for:id},[labelText]),
          el("input",{id, type, placeholder})
        ]);
      }
      function textareaField(labelText, id, placeholder){
        return el("div",{},[
          el("label",{for:id},[labelText]),
          el("textarea",{id, placeholder})
        ]);
      }
      function chk(key, labelText){
        const id = "pt_" + key;
        return el("label",{class:"check", for:id},[
          el("input",{type:"checkbox", id}),
          el("span",{},[labelText])
        ]);
      }

      function readForm(){
        const data = {
          permitNo: $("#permitNo").value.trim(),
          dateRequired: $("#dateRequired").value || todayISO(),
          requestedBy: $("#requestedBy").value.trim(),
          address: $("#address").value.trim(),
          description: $("#description").value.trim(),
          activities: {},
          hwrp: $("#hwrp").value.trim(),
          contractor: $("#contractor").value.trim(),
          fireSafety: $("#fireSafety").value.trim(),
          precautions: {},
          precautionsNa: {},
          checks: {},
          checksNa: {},
          extinguishers: {},
          sketch: $("#sketch").value.trim(),
          permitValidFrom: $("#permitValidFrom").value.trim(),
          permitValidTo: $("#permitValidTo").value.trim(),
          permitTimeFrom: $("#permitTimeFrom").value.trim(),
          permitTimeTo: $("#permitTimeTo").value.trim(),
          authorisedBy: $("#authorisedBy").value.trim(),
          authorisedSig: $("#authorisedSig").value.trim(),
          authorisedDate: $("#authorisedDate").value.trim(),
          fireWatcher: $("#fireWatcher").value.trim(),
          fireWatcherSig: $("#fireWatcherSig").value.trim(),
          fireWatcherDate: $("#fireWatcherDate").value.trim(),
          hwrpName: $("#hwrpName").value.trim(),
          hwrpSig: $("#hwrpSig").value.trim(),
          hwrpDate: $("#hwrpDate").value.trim(),
          completionHours: $("#completionHours").value.trim(),
          fireWatchHours: $("#fireWatchHours").value.trim(),
          completionTimeFrom: $("#completionTimeFrom").value.trim(),
          completionTimeTo: $("#completionTimeTo").value.trim(),
          fireWatchTimeFrom: $("#fireWatchTimeFrom").value.trim(),
          fireWatchTimeTo: $("#fireWatchTimeTo").value.trim(),
          clearanceBy: $("#clearanceBy").value.trim(),
          clearanceSig: $("#clearanceSig").value.trim(),
          clearanceDate: $("#clearanceDate").value.trim()
        };

        Object.keys(state.activities).forEach(k=>{
          const box = document.getElementById("pt_"+k);
          data.activities[k] = !!(box && box.checked);
        });

        precautionsList.forEach((_, idx)=>{
          const box = document.getElementById("pt_prec_"+idx);
          const boxNa = document.getElementById("pt_prec_na_"+idx);
          data.precautions[idx] = !!(box && box.checked);
          data.precautionsNa[idx] = !!(boxNa && boxNa.checked);
        });
        checksList.forEach((_, idx)=>{
          const box = document.getElementById("pt_chk_"+idx);
          const boxNa = document.getElementById("pt_chk_na_"+idx);
          data.checks[idx] = !!(box && box.checked);
          data.checksNa[idx] = !!(boxNa && boxNa.checked);
        });

        ["co2","foam","water","dryPowder"].forEach(k=>{
          const box = document.getElementById("pt_"+k);
          data.extinguishers[k] = !!(box && box.checked);
        });
        return data;
      }

      async function onDownload(){
        const btn = $("#btnDownload");
        btn.disabled = true;
        btn.textContent = "Generating...";

        try{
          const data = readForm();
          await generateHotWorkPermitPDF(data, precautionsList, checksList);
        }catch(err){
          showBanner(String(err && err.message ? err.message : err), "bad");
        }finally{
          btn.disabled = false;
          btn.textContent = "Download PDF";
        }
      }
    }

    function renderGroundDisturbancePermit(){
      const app = $("#app");
      app.innerHTML = "";

      const state = {
        projectName: "",
        projectNo: "",
        permitNo: "",
        preparedBy: "",
        issuedTo: "",
        validFrom: "",
        validTo: "",
        workPackage: "",
        locationDescription: "",
        surveyConclusions: "",
        utilities: {
          underground: false,
          electrical: false,
          gas: false,
          water: false,
          telecom: false,
          surfaceSewer: false,
          other: false
        },
        utilitiesOther: "",
        coordinatorName: "",
        coordinatorDate: "",
        coordinatorTime: "",
        isolationsDetails: "",
        designChangesDetails: "",
        ppeRequired: "",
        excavationTools: "",
        excavationSupport: "",
        backfillRequirements: "",
        compositeDrawing: "",
        utilityMarkers: "",
        networkRailConfirmed: false,
        sketch: "",
        acceptanceName: "",
        acceptanceSigned: "",
        acceptanceDate: "",
        acceptanceTime: "",
        findings: "",
        coordinatorConfirmName: "",
        coordinatorConfirmSigned: "",
        coordinatorConfirmDate: "",
        cancelSigned: "",
        cancelDateTime: ""
      };

      const head = el("div",{class:"head"},[
        el("div",{},[
          el("h1",{},["Ground disturbance permit"]),
          el("div",{class:"sub"},["Pre-fill the permit details, then download the PDF."])
        ]),
        el("div",{class:"pillRow"},[
          el("span",{id:"pillLib", class:"pill warn"},["PDF engine: checking…"]),
          el("span",{id:"pillTpl", class:"pill warn"},["Template: checking…"])
        ])
      ]);

      const banner = el("div",{id:"banner", class:"banner"},[""]);

      const sHeader = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Project & permit details"]),
        el("div",{class:"grid2"},[
          field("Project Name","gd_projectName","text","", state.projectName),
          field("Project No","gd_projectNo","text","", state.projectNo),
          field("Permit No","gd_permitNo","text","", state.permitNo),
          field("Permit compiled by (Utility Co-ordinator)","gd_preparedBy","text","", state.preparedBy),
          field("Permit issued to (Contractor)","gd_issuedTo","text","", state.issuedTo),
          field("Permit validity from","gd_validFrom","text","", state.validFrom),
          field("Permit validity to","gd_validTo","text","", state.validTo),
          field("Work Package Plan Name & No","gd_workPackage","text","", state.workPackage)
        ])
      ]);

      const sExtent = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["1. Extent of permit, location & brief description of work"]),
        textareaField("Description","gd_locationDescription","", state.locationDescription)
      ]);

      const sSurvey = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["2. Survey conclusions"]),
        textareaField("Survey conclusions","gd_surveyConclusions","", state.surveyConclusions),
        el("div",{class:"grid3auto", style:"margin-top:10px;"},[
          chk("gd_util_underground","Underground", state.utilities.underground),
          chk("gd_util_electrical","Electrical", state.utilities.electrical),
          chk("gd_util_gas","Gas", state.utilities.gas),
          chk("gd_util_water","Water", state.utilities.water),
          chk("gd_util_telecom","Telecom", state.utilities.telecom),
          chk("gd_util_surface","Surface/Sewer", state.utilities.surfaceSewer),
          chk("gd_util_other","Other", state.utilities.other)
        ]),
        field("Other (state)","gd_utilitiesOther","text","", state.utilitiesOther),
        el("div",{class:"grid3auto", style:"margin-top:10px;"},[
          field("Signed (Utility Co-ordinator)","gd_coordName","text","", state.coordinatorName),
          field("Date","gd_coordDate","text","", state.coordinatorDate),
          field("Time","gd_coordTime","text","", state.coordinatorTime)
        ])
      ]);

      const sControls = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["3. Controls (Utility Co-ordinator)"])
      ]);
      sControls.appendChild(textareaField("Isolations requested granted/denied (details)","gd_isolationsDetails","", state.isolationsDetails));
      sControls.appendChild(textareaField("Design changes requested granted/denied (details)","gd_designChangesDetails","", state.designChangesDetails));
      sControls.appendChild(field("PPE required (list)","gd_ppeRequired","text","", state.ppeRequired));
      sControls.appendChild(field("Excavation tools required (list)","gd_excavationTools","text","", state.excavationTools));
      sControls.appendChild(textareaField("Excavation support/protection equipment required","gd_excavationSupport","", state.excavationSupport));
      sControls.appendChild(textareaField("Backfill/marker placement requirements","gd_backfillRequirements","", state.backfillRequirements));
      sControls.appendChild(textareaField("Composite colour drawing / reference","gd_compositeDrawing","", state.compositeDrawing));
      sControls.appendChild(textareaField("Utility markers details","gd_utilityMarkers","", state.utilityMarkers));
      sControls.appendChild(chk("gd_networkRailConfirmed","Network Rail Buried Services search & forms completed", state.networkRailConfirmed));

      const sSketch = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["4. Simplified sketch of all known utilities"]),
        textareaField("Sketch notes","gd_sketch","", state.sketch)
      ]);

      const sAcceptance = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["5. Excavation Supervisor’s acceptance"]),
        el("div",{class:"grid2"},[
          field("Name","gd_acceptanceName","text","", state.acceptanceName),
          field("Signed","gd_acceptanceSigned","text","", state.acceptanceSigned),
          field("Date","gd_acceptanceDate","text","", state.acceptanceDate),
          field("Time","gd_acceptanceTime","text","", state.acceptanceTime)
        ])
      ]);

      const sFindings = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Additional findings / variations"]),
        textareaField("Findings","gd_findings","", state.findings)
      ]);

      const sConfirm = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Utility Coordinator confirmation & cancellation"]),
        el("div",{class:"grid2"},[
          field("Coordinator name","gd_coordConfirmName","text","", state.coordinatorConfirmName),
          field("Signed","gd_coordConfirmSigned","text","", state.coordinatorConfirmSigned),
          field("Dated","gd_coordConfirmDate","text","", state.coordinatorConfirmDate),
          field("Cancellation signed","gd_cancelSigned","text","", state.cancelSigned),
          field("Cancellation date/time","gd_cancelDateTime","text","", state.cancelDateTime)
        ])
      ]);

      const sticky = el("div",{class:"stickyBar"},[
        el("div",{class:"actionBar"},[
          el("div",{class:"btnRow"},[
            el("a",{class:"btn btnYellow", href:"daily.html"},["Back"])
          ]),
          el("div",{class:"btnRow"},[
            el("button",{id:"btnDownload", class:"btn", type:"button", onclick: async()=> {
              hideBanner();
              await onDownload();
            }},["Download PDF"])
          ])
        ])
      ]);

      app.appendChild(head);
      app.appendChild(banner);
      app.appendChild(sHeader);
      app.appendChild(sExtent);
      app.appendChild(sSurvey);
      app.appendChild(sControls);
      app.appendChild(sSketch);
      app.appendChild(sAcceptance);
      app.appendChild(sFindings);
      app.appendChild(sConfirm);
      app.appendChild(sticky);

      checkTemplateAndLib();

      function field(labelText, id, type, placeholder, val = ""){
        return el("div",{},[
          el("label",{for:id},[labelText]),
          el("input",{id, type, placeholder, value: val})
        ]);
      }
      function textareaField(labelText, id, placeholder, val = ""){
        const txt = el("textarea",{id, placeholder});
        txt.value = val;
        return el("div",{},[
          el("label",{for:id},[labelText]),
          txt
        ]);
      }
      function chk(id, labelText, checked = false){
        return el("label",{class:"check"},[
          el("input",{id, type:"checkbox", checked: checked ? "checked" : null}),
          labelText
        ]);
      }

      function readForm(){
        return {
          projectName: $("#gd_projectName").value.trim(),
          projectNo: $("#gd_projectNo").value.trim(),
          permitNo: $("#gd_permitNo").value.trim(),
          preparedBy: $("#gd_preparedBy").value.trim(),
          issuedTo: $("#gd_issuedTo").value.trim(),
          validFrom: $("#gd_validFrom").value.trim(),
          validTo: $("#gd_validTo").value.trim(),
          workPackage: $("#gd_workPackage").value.trim(),
          locationDescription: $("#gd_locationDescription").value.trim(),
          surveyConclusions: $("#gd_surveyConclusions").value.trim(),
          utilities: {
            underground: $("#gd_util_underground").checked,
            electrical: $("#gd_util_electrical").checked,
            gas: $("#gd_util_gas").checked,
            water: $("#gd_util_water").checked,
            telecom: $("#gd_util_telecom").checked,
            surfaceSewer: $("#gd_util_surface").checked,
            other: $("#gd_util_other").checked
          },
          utilitiesOther: $("#gd_utilitiesOther").value.trim(),
          coordinatorName: $("#gd_coordName").value.trim(),
          coordinatorDate: $("#gd_coordDate").value.trim(),
          coordinatorTime: $("#gd_coordTime").value.trim(),
          isolationsDetails: $("#gd_isolationsDetails").value.trim(),
          designChangesDetails: $("#gd_designChangesDetails").value.trim(),
          ppeRequired: $("#gd_ppeRequired").value.trim(),
          excavationTools: $("#gd_excavationTools").value.trim(),
          excavationSupport: $("#gd_excavationSupport").value.trim(),
          backfillRequirements: $("#gd_backfillRequirements").value.trim(),
          compositeDrawing: $("#gd_compositeDrawing").value.trim(),
          utilityMarkers: $("#gd_utilityMarkers").value.trim(),
          networkRailConfirmed: $("#gd_networkRailConfirmed").checked,
          sketch: $("#gd_sketch").value.trim(),
          acceptanceName: $("#gd_acceptanceName").value.trim(),
          acceptanceSigned: $("#gd_acceptanceSigned").value.trim(),
          acceptanceDate: $("#gd_acceptanceDate").value.trim(),
          acceptanceTime: $("#gd_acceptanceTime").value.trim(),
          findings: $("#gd_findings").value.trim(),
          coordinatorConfirmName: $("#gd_coordConfirmName").value.trim(),
          coordinatorConfirmSigned: $("#gd_coordConfirmSigned").value.trim(),
          coordinatorConfirmDate: $("#gd_coordConfirmDate").value.trim(),
          cancelSigned: $("#gd_cancelSigned").value.trim(),
          cancelDateTime: $("#gd_cancelDateTime").value.trim()
        };
      }

      async function onDownload(){
        const btn = $("#btnDownload");
        btn.disabled = true;
        btn.textContent = "Generating…";
        try{
          const data = readForm();
          await generateGroundDisturbancePDF(data);
        }catch(err){
          showBanner(String(err && err.message ? err.message : err), "bad");
        }finally{
          btn.disabled = false;
          btn.textContent = "Download PDF";
        }
      }
    }

    function renderExcavationInspectionChecks(){
      const app = $("#app");
      app.innerHTML = "";

      const state = {
        siteAddress: "",
        siteNumber: "",
        location: "",
        reporterName: "",
        receiverName: "",
        canWork: "Yes",
        entries: [
          { date: todayISO(), time: "", condition: "", action: "" }
        ]
      };

      const head = el("div",{class:"head"},[
        el("div",{},[
          el("h1",{},["Excavation inspection checks"]),
          el("div",{class:"sub"},["Pre-fill the inspection checks, then download the PDF."])
        ]),
        el("div",{class:"pillRow"},[
          el("span",{id:"pillLib", class:"pill warn"},["PDF engine: checking…"]),
          el("span",{id:"pillTpl", class:"pill warn"},["Template: checking…"])
        ])
      ]);

      const banner = el("div",{id:"banner", class:"banner"},[""]);

      const sSite = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Site details"]),
        el("div",{class:"grid2"},[
          field("Site Address","ex_siteAddress","text","", state.siteAddress),
          field("Site Number","ex_siteNumber","text","", state.siteNumber)
        ]),
        field("Location of Excavation onsite","ex_location","text","", state.location)
      ]);

      const sPeople = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Report details"]),
        el("div",{class:"grid2"},[
          field("Name and position of person making report","ex_reporter","text","", state.reporterName),
          field("Name of person receiving report","ex_receiver","text","", state.receiverName)
        ]),
        el("div",{style:"max-width:280px;"},[
          selectField("Can work be carried out safely?","ex_canWork", ["Yes","No"], state.canWork)
        ])
      ]);

      const sRegister = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["Inspection register"]),
        el("div",{class:"attTop"},[
          el("div",{class:"sub"},["Add entries for each inspection."]),
          el("div",{class:"btnRow"},[
            el("button",{class:"btn btnGhost", type:"button", onclick: ()=> addEntry()},["Add entry"]),
            el("button",{class:"btn btnGhost", type:"button", onclick: ()=> removeEntry()},["Remove last"])
          ])
        ]),
        el("div",{id:"ex_entries"},[])
      ]);

      const sticky = el("div",{class:"stickyBar"},[
        el("div",{class:"actionBar"},[
          el("div",{class:"btnRow"},[
            el("a",{class:"btn btnYellow", href:"daily.html"},["Back"])
          ]),
          el("div",{class:"btnRow"},[
            el("button",{id:"btnDownload", class:"btn", type:"button", onclick: async()=> {
              hideBanner();
              await onDownload();
            }},["Download PDF"])
          ])
        ])
      ]);

      app.appendChild(head);
      app.appendChild(banner);
      app.appendChild(sSite);
      app.appendChild(sPeople);
      app.appendChild(sRegister);
      app.appendChild(sticky);

      renderEntries();
      checkTemplateAndLib("excavation");

      function field(labelText, id, type, placeholder, val = ""){
        return el("div",{},[
          el("label",{for:id},[labelText]),
          el("input",{id, type, placeholder, value: val})
        ]);
      }
      function selectField(labelText, id, options, val){
        const sel = el("select",{id});
        options.forEach(opt => {
          sel.appendChild(el("option",{value: opt, selected: opt === val ? "selected" : null},[opt]));
        });
        return el("div",{},[
          el("label",{for:id},[labelText]),
          sel
        ]);
      }

      function entryRow(idx, row){
        return el("div",{class:"attRow", style:"grid-template-columns: 1fr 1fr 2fr 2fr;"},[
          field("Date","ex_date_"+idx,"date","", row.date),
          field("Time","ex_time_"+idx,"time","", row.time),
          field("Condition of Excavation","ex_condition_"+idx,"text","", row.condition),
          field("Action taken","ex_action_"+idx,"text","", row.action)
        ]);
      }

      function renderEntries(){
        const wrap = $("#ex_entries");
        wrap.innerHTML = "";
        state.entries.forEach((row, idx)=>{
          wrap.appendChild(entryRow(idx, row));
        });
      }

      function addEntry(){
        if(state.entries.length >= 8) return;
        state.entries.push({ date: "", time: "", condition: "", action: "" });
        renderEntries();
      }

      function removeEntry(){
        if(state.entries.length <= 1) return;
        state.entries.pop();
        renderEntries();
      }

      function readForm(){
        const entries = [];
        for(let i=0;i<state.entries.length;i++){
          const date = $("#ex_date_"+i)?.value || "";
          const time = $("#ex_time_"+i)?.value || "";
          const condition = $("#ex_condition_"+i)?.value || "";
          const action = $("#ex_action_"+i)?.value || "";
          if(date || time || condition || action){
            entries.push({ date, time, condition, action });
          }
        }
        return {
          siteAddress: $("#ex_siteAddress").value.trim(),
          siteNumber: $("#ex_siteNumber").value.trim(),
          location: $("#ex_location").value.trim(),
          reporterName: $("#ex_reporter").value.trim(),
          receiverName: $("#ex_receiver").value.trim(),
          canWork: $("#ex_canWork").value,
          entries
        };
      }

      async function onDownload(){
        const btn = $("#btnDownload");
        btn.disabled = true;
        btn.textContent = "Generating…";
        try{
          const data = readForm();
          await generateExcavationChecksPDF(data);
        }catch(err){
          showBanner(String(err && err.message ? err.message : err), "bad");
        }finally{
          btn.disabled = false;
          btn.textContent = "Download PDF";
        }
      }
    }

    async function generateDailyBriefPDF(data){
      // 1) pdf-lib availability
      if(!window.PDFLib){
        throw new Error("PDF engine is blocked (pdf-lib did not load). If you use a strict Content-Security-Policy, you must allow the CDN or host pdf-lib locally.");
      }

      const { PDFDocument, StandardFonts, rgb } = PDFLib;
      const pdfDoc = await PDFDocument.create();
      const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const A4 = [595.28, 841.89];
      const page1 = pdfDoc.addPage(A4);
      const page2 = pdfDoc.addPage(A4);

      const detectImageType = (bytes) => {
        if(!bytes || bytes.length < 4) return null;
        if(bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
        if(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
        return null;
      };

      const embedImageBytes = async (bytes) => {
        const type = detectImageType(bytes);
        if(type === "jpeg") return await pdfDoc.embedJpg(bytes);
        if(type === "png") return await pdfDoc.embedPng(bytes);
        return null;
      };

      async function fetchImage(url){
        try{
          const res = await fetch(url, { cache:"no-store" });
          if(!res.ok) return null;
          return new Uint8Array(await res.arrayBuffer());
        }catch(err){
          return null;
        }
      }

      let atlLogo;
      const atlBytes = await fetchImage("assets/atl-logo.png")
        || await fetchImage("/assets/atl-logo.png")
        || await fetchImage("atl-logo.png")
        || await fetchImage("/atl-logo.png");
      if(atlBytes) atlLogo = await embedImageBytes(atlBytes);

      const RED = rgb(0.78, 0.1, 0.1);
      const HEADER_TEXT = rgb(1, 1, 1);
      const BLACK = rgb(0,0,0);
      const LIGHT_BLUE = rgb(0.95, 0.98, 1);
      const LIGHT_GRAY = rgb(0.96, 0.96, 0.96);

      const ddmmyyyy = toDDMMYYYY(data.dateISO || todayISO());
      const attendeesCount = (data.attendees || []).length;

      const sanitizePdfText = (text) => {
        let s = String(text ?? "");
        s = s.replace(/[\u2018\u2019]/g, "'")
             .replace(/[\u201C\u201D]/g, '"')
             .replace(/[\u2010-\u2015\u2212\u00ad]/g, "-")
             .replace(/\u2026/g, "...")
             .replace(/\u00A0/g, " ");
        if (s.normalize) {
          s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        }
        s = s.replace(/[^\x0A\x0D\x20-\x7E]/g, "");
        return s;
      };

      const drawText = (page, text, x, y, size=10, font=helvBold, color=BLACK) => {
        const safeText = sanitizePdfText(text);
        if(!safeText) return;
        page.drawText(safeText, { x, y, size, font, color });
      };

      const drawCenteredText = (page, text, centerX, y, size=12, font=helvBold, color=BLACK) => {
        const safeText = sanitizePdfText(text);
        if(!safeText) return;
        const width = font.widthOfTextAtSize(safeText, size);
        page.drawText(safeText, { x: centerX - (width / 2), y, size, font, color });
      };

      const drawCell = (page, x, y, w, h, { fill, border=1 } = {}) => {
        page.drawRectangle({
          x,
          y,
          width: w,
          height: h,
          color: fill,
          borderColor: BLACK,
          borderWidth: border
        });
      };

      const drawCheckmark = (page, boxX, boxY, boxW, boxH) => {
        const left = boxX + (boxW * 0.2);
        const midX = boxX + (boxW * 0.42);
        const right = boxX + (boxW * 0.82);
        const lower = boxY + (boxH * 0.3);
        const midY = boxY + (boxH * 0.1);
        const upper = boxY + (boxH * 0.72);
        page.drawLine({ start:{ x:left, y:lower }, end:{ x:midX, y:midY }, thickness:1.8, color: BLACK });
        page.drawLine({ start:{ x:midX, y:midY }, end:{ x:right, y:upper }, thickness:1.8, color: BLACK });
      };

      const wrapLines = (font, text, size, maxWidth) => {
        const safe = sanitizePdfText(text);
        if(!safe) return [];
        const parts = safe.replace(/\r/g, "").split("\n");
        const lines = [];
        for(const part of parts){
          const words = part.split(/\s+/).filter(Boolean);
          if(words.length === 0){ lines.push(""); continue; }
          let line = "";
          for(const w of words){
            const test = line ? (line + " " + w) : w;
            if(font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
            else { if(line) lines.push(line); line = w; }
          }
          if(line) lines.push(line);
        }
        return lines;
      };

      const drawWrappedFromTop = (page, text, x, topY, maxWidth, lineHeight=12, size=10, maxLines=20, color=BLACK, font=helvBold) => {
        const lines = wrapLines(font, text, size, maxWidth).slice(0, maxLines);
        let y = topY;
        for(const ln of lines){
          page.drawText(ln, { x, y, size, font, color });
          y -= lineHeight;
        }
      };

      const drawTextInCellLeft = (page, text, x, y, w, h, size=10, font=helvBold, color=BLACK, pad=6) => {
        const safe = sanitizePdfText(text);
        if(!safe) return;
        const yText = y + Math.max(2, (h - size) / 2 + 1);
        page.drawText(safe, { x: x + pad, y: yText, size, font, color });
      };

      const drawWrapInCellLeft = (page, text, x, y, w, h, size=8, lineHeight=9, maxLines=2, font=helvBold, color=BLACK, pad=6) => {
        const lines = wrapLines(font, text, size, w - (pad * 2)).slice(0, maxLines);
        if(!lines.length) return;
        const totalH = (lines.length - 1) * lineHeight + size;
        let yText = y + Math.max(2, (h - totalH) / 2 + (totalH - size));
        lines.forEach(ln => {
          page.drawText(ln, { x: x + pad, y: yText, size, font, color });
          yText -= lineHeight;
        });
      };

      const drawYesNoBox = (page, x, y, size, isYes) => {
        drawCell(page, x, y, size, size, { fill: undefined, border: 1 });
        if(isYes){
          drawCheckmark(page, x + 1.5, y + 1.5, size - 3, size - 3);
        }
      };

      function drawHeader(page){
        if(atlLogo){
          const scale = 140 / atlLogo.width;
          page.drawImage(atlLogo, { x:40, y:760, width: atlLogo.width * scale, height: atlLogo.height * scale });
        }
        drawText(page, "ATL Daily Task Briefing", 430, 795, 9, helvBold, RED);
        drawText(page, "QPFS12.4", 430, 783, 9, helvBold, RED);
        drawCell(page, 40, 705, 515, 22, { fill: RED, border: 1 });
        drawCenteredText(page, "HEALTH & SAFETY - MORNING BRIEFING", 297.5, 712, 12, helvBold, HEADER_TEXT);
      }

      function drawIntroTable(page){
        const marginX = 40;
        const tableTop = 680;
        const rowH = 26;
        const labelW = 140;
        const valueW = 190;
        const label2W = 110;
        const value2W = 75;

        const rows = [
          ["PROJECT TITLE", data.projectTitle, "SITE LOCATION", data.siteLocation],
          ["Work Location", data.workLocation, "Project no:", data.projectNo],
          ["NAME OF PERSON\nGIVING BRIEFING", data.brieferName, "DATE", ddmmyyyy],
          ["JOB TITLE", data.jobTitle, "NO. OF PERSONS\nATTENDING BRIEFING", String(attendeesCount || "")]
        ];

        rows.forEach((row, i) => {
          const y = tableTop - (rowH * (i + 1));
          drawCell(page, marginX, y, labelW, rowH, { fill: LIGHT_GRAY });
          drawCell(page, marginX + labelW, y, valueW, rowH, { fill: LIGHT_BLUE });
          drawCell(page, marginX + labelW + valueW, y, label2W, rowH, { fill: LIGHT_GRAY });
          drawCell(page, marginX + labelW + valueW + label2W, y, value2W, rowH, { fill: LIGHT_BLUE });
          drawWrapInCellLeft(page, row[0], marginX, y, labelW, rowH, 8, 9, 2, helvBold, BLACK);
          drawTextInCellLeft(page, row[1], marginX + labelW, y, valueW, rowH, 10, helvBold, BLACK);
          drawWrapInCellLeft(page, row[2], marginX + labelW + valueW, y, label2W, rowH, 8, 9, 2, helvBold, BLACK);
          drawTextInCellLeft(page, row[3], marginX + labelW + valueW + label2W, y, value2W, rowH, 10, helvBold, BLACK);
        });

        return tableTop - (rowH * rows.length) - 10;
      }

      function drawPreviousDay(page, startY){
        const marginX = 40;
        const headerH = 20;
        drawCell(page, marginX, startY - headerH, 515, headerH, { fill: RED });
        drawText(page, "PREVIOUS DAY'S ACTIVITIES", marginX + 6, startY - 14, 9, helvBold, HEADER_TEXT);

        const qH = 36;
        const qY = startY - headerH - qH;
        drawCell(page, marginX, qY, 515, qH, { fill: LIGHT_GRAY });
        drawTextInCellLeft(page, `Did previous day go as planned? ${data.prevPlanned}`, marginX, qY, 515, qH, 9, helvBold, BLACK);
        drawCell(page, marginX, qY - 36, 515, 36, { fill: LIGHT_BLUE });
        drawWrappedFromTop(page, data.prevConcerns, marginX + 6, qY - 8, 500, 11, 9, 3, BLACK, helvBold);

        return qY - 52;
      }

      function drawTodayPlanned(page, startY){
        const marginX = 40;
        const headerH = 18;
        drawCell(page, marginX, startY - headerH, 515, headerH, { fill: RED });
        drawText(page, "TODAY'S PLANNED ACTIVITIES BRIEFING", marginX + 6, startY - 12, 9, helvBold, HEADER_TEXT);
        const bodyH = 120;
        drawCell(page, marginX, startY - headerH - bodyH, 515, bodyH, { fill: LIGHT_BLUE });
        drawWrappedFromTop(page, data.todayPlanned, marginX + 6, startY - headerH - 8, 500, 11, 9, 9, BLACK, helvBold);
        return startY - headerH - bodyH - 18;
      }

      function drawPointsGrid(page, startY){
        const marginX = 40;
        const headerH = 16;
        drawCell(page, marginX, startY - headerH, 515, headerH, { fill: RED });
        drawText(page, "Points discussed for today's operation:", marginX + 6, startY - 12, 8, helvBold, HEADER_TEXT);

        const rowH = 18;
        const colGroups = [
          { labelW: 150, checkW: 20 },
          { labelW: 150, checkW: 20 },
          { labelW: 155, checkW: 20 }
        ];
        const rows = [
          ["confined", "barriers", "coshh"],
          ["emergency", "clearAccess", "fire"],
          ["lifting", "methodStatements", "materials"],
          ["permits", "suitablePPE", "competence"],
          ["plant", "trenchCollapse", "cables"],
          ["safetyPlanning", "welfare", "trips"],
        ];
        const labels = {
          confined: "Confined Spaces / Areas",
          emergency: "Emergency Procedures",
          lifting: "Lifting Equipment - Chains / Slings",
          permits: "Permits to Work",
          plant: "Plant & Equipment",
          safetyPlanning: "Safety Planning",
          barriers: "Barriers / Edge Protection",
          clearAccess: "Clear Access Ways",
          methodStatements: "Method Statements / Risk Assessments",
          suitablePPE: "Suitable PPE",
          trenchCollapse: "Trench Collapse",
          welfare: "Welfare Facilities",
          coshh: "COSHH Assessments",
          fire: "Fire Precautions",
          materials: "Materials",
          competence: "Operative Experience / Competence",
          cables: "Overhead / Underground Cable Strike",
          trips: "Trips / Falls"
        };

        let y = startY - headerH;
        rows.forEach((row, rowIdx) => {
          y -= rowH;
          let x = marginX;
          row.forEach((key, idx) => {
            const group = colGroups[idx];
            drawCell(page, x, y, group.labelW, rowH, { fill: (rowIdx % 2 === 0) ? LIGHT_GRAY : undefined });
            drawCell(page, x + group.labelW, y, group.checkW, rowH, { fill: LIGHT_BLUE });
            drawText(page, labels[key], x + 6, y + 6, 7.5);
            if(data.points && data.points[key]){
              drawCheckmark(page, x + group.labelW + 2, y + 3, group.checkW - 4, rowH - 6);
            }
            x += group.labelW + group.checkW;
          });
        });

        const footerY = y - 18;
        drawCell(page, marginX, footerY, 515, 16, { fill: RED });
        drawCenteredText(page, "This list is not exhaustive  -  REMEMBER - MANAGE HEALTH & SAFETY", 297.5, footerY + 4, 8, helvBold, HEADER_TEXT);
        return footerY - 16;
      }

      function drawConfirmations(page, startY){
        const marginX = 40;
        const rowH = 32;
        const textW = 460;
        const boxW = 55;
        const items = [
          { text: "Are all today's activities covered by the Operation Procedure / Method Statement / Risk Assessment?", value: data.covered },
          { text: "Are all Control Measures in place?", value: data.controls },
          { text: "Are all operatives compliant with the site requirements for PPE?", value: data.ppe }
        ];
        let y = startY;
        items.forEach(item => {
          y -= rowH;
          drawCell(page, marginX, y, textW, rowH, { fill: undefined });
          drawCell(page, marginX + textW, y, boxW, rowH, { fill: undefined });
        drawWrappedFromTop(page, item.text, marginX + 6, y + rowH - 10, textW - 10, 10, 8, 3, BLACK);
          drawYesNoBox(page, marginX + textW + 18, y + 9, 12, item.value === "Yes");
        });
      }

      function drawSignUpPage(page){
        drawHeader(page);
        drawCell(page, 40, 675, 515, 20, { fill: RED });
        drawCenteredText(page, "HEALTH & SAFETY - MORNING BRIEFING SIGN-UP Sheet", 297.5, 680, 8.5, helvBold, HEADER_TEXT);
        drawCell(page, 40, 645, 515, 30, { fill: undefined });
        drawWrappedFromTop(
          page,
          "Signing of this briefing confirms that all control measures defined in the associated risk assessments are in place, anyone joining the working group must be briefed prior to starting",
          50,
          668,
          495,
          9,
          7.5,
          3,
          BLACK
        );
        drawCell(page, 40, 632, 515, 20, { fill: RED });
        drawCenteredText(page, "ATTENDEES", 297.5, 637, 8, helvBold, HEADER_TEXT);
      }

      async function drawAttendeeTable(page, startY, attendees, startIndex){
        const marginX = 40;
        const rowH = 22;
        const nameW = 250;
        const dateW = 110;
        const sigW = 155;
        const headerY = startY;
        drawCell(page, marginX, headerY, nameW, rowH, { fill: RED });
        drawCell(page, marginX + nameW, headerY, dateW, rowH, { fill: RED });
        drawCell(page, marginX + nameW + dateW, headerY, sigW, rowH, { fill: RED });
        drawText(page, "NAME", marginX + 6, headerY + 8, 8, helvBold, HEADER_TEXT);
        drawText(page, "DATE", marginX + nameW + 6, headerY + 8, 8, helvBold, HEADER_TEXT);
        drawText(page, "SIGNATURE", marginX + nameW + dateW + 6, headerY + 8, 8, helvBold, HEADER_TEXT);

        const fitInto = (imgW, imgH, maxW, maxH) => {
          const r = Math.min(maxW / imgW, maxH / imgH);
          return { w: imgW * r, h: imgH * r };
        };

        const decodeDataUrl = (dataUrl) => {
          if(!dataUrl || typeof dataUrl !== "string") return null;
          const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg));base64,(.+)$/i);
          if(!match) return null;
          const mime = match[1].toLowerCase();
          const b64 = match[3];
          if(!b64) return null;
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          return { mime, bytes };
        };

        const embedImageFromDataUrl = async (dataUrl) => {
          const decoded = decodeDataUrl(dataUrl);
          if(!decoded) return null;
          return await embedImageBytes(decoded.bytes);
        };

        let y = headerY - rowH;
        let idx = startIndex;
        for(let i=0;i<20;i++){
          drawCell(page, marginX, y, nameW, rowH, { fill: LIGHT_BLUE });
          drawCell(page, marginX + nameW, y, dateW, rowH, { fill: LIGHT_BLUE });
          drawCell(page, marginX + nameW + dateW, y, sigW, rowH, { fill: LIGHT_BLUE });
          const a = attendees[idx];
          if(a){
            drawText(page, a.name, marginX + 6, y + 6, 10);
            drawText(page, toDDMMYYYY(a.dateISO), marginX + nameW + 6, y + 6, 10);
            if(a.signature){
              const embed = await embedImageFromDataUrl(a.signature);
              if(embed){
                const maxW = sigW - 12;
                const maxH = rowH - 6;
                const s = fitInto(embed.width, embed.height, maxW, maxH);
                const x = marginX + nameW + dateW + 6 + ((maxW - s.w) / 2);
                const yImg = y + 3 + ((maxH - s.h) / 2);
                page.drawImage(embed, { x, y: yImg, width:s.w, height:s.h });
              }
            }
            idx++;
          }
          y -= rowH;
        }
        return idx;
      }

      drawHeader(page1);
      let cursorY = drawIntroTable(page1);
      cursorY = drawPreviousDay(page1, cursorY);
      cursorY = drawTodayPlanned(page1, cursorY);
      cursorY = drawPointsGrid(page1, cursorY);
      drawConfirmations(page1, cursorY);

      drawSignUpPage(page2);

      const attendeesAll = (data.attendees || []).slice(0, 36).map(a=>({
        name: (a.name||"").trim(),
        dateISO: (a.dateISO||data.dateISO||todayISO()),
        signature: (a.signature||"")
      }));
      let next = await drawAttendeeTable(page2, 612, attendeesAll, 0);
      if(next < attendeesAll.length){
        const page3 = pdfDoc.addPage(A4);
        drawSignUpPage(page3);
        await drawAttendeeTable(page3, 612, attendeesAll, next);
      }

      const addPageFooter = (page, pageIndex, totalPages) => {
        drawText(page, "QPFS12.4", 40, 24, 9);
        drawText(page, `Page No. ${pageIndex} of ${totalPages}`, 455, 24, 9);
      };

      const pages = pdfDoc.getPages();
      pages.forEach((page, idx) => addPageFooter(page, idx + 1, pages.length));

      // Save + download (with fallback)
      const outBytes = await pdfDoc.save();
      const blob = new Blob([outBytes], { type:"application/pdf" });
      const url = URL.createObjectURL(blob);
      const filename = `Daily-Briefing_${data.dateISO || todayISO()}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(()=> URL.revokeObjectURL(url), 2500);
    }

    async function generateConfinedSpacePDF(data){
      if(!window.PDFLib){
        throw new Error("PDF engine is blocked (pdf-lib did not load). If you use a strict Content-Security-Policy, you must allow the CDN or host pdf-lib locally.");
      }

      const { PDFDocument, StandardFonts, rgb } = PDFLib;
      const pdfDoc = await PDFDocument.create();
      const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const A4 = [595.28, 841.89];
      const page1 = pdfDoc.addPage(A4);
      const page2 = pdfDoc.addPage(A4);
      const page3 = pdfDoc.addPage(A4);

      const RED = rgb(0.78, 0.1, 0.1);
      const BLACK = rgb(0,0,0);
      const LIGHT = rgb(0.97,0.97,0.97);
      const WHITE = rgb(1,1,1);

      const sanitize = (text) => {
        let s = String(text ?? "");
        s = s.replace(/[\u2018\u2019]/g, "'")
             .replace(/[\u201C\u201D]/g, '"')
             .replace(/[\u2010-\u2015\u2212\u00ad]/g, "-")
             .replace(/\u2026/g, "...")
             .replace(/\u00A0/g, " ");
        if (s.normalize) {
          s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        }
        s = s.replace(/[^\x0A\x0D\x20-\x7E]/g, "");
        return s;
      };

      const drawText = (page, text, x, y, size=9, font=helv, color=BLACK) => {
        const t = sanitize(text);
        if(!t) return;
        page.drawText(t, { x, y, size, font, color });
      };

      const drawWrap = (page, text, x, topY, maxW, lineH=11, size=9, maxLines=10, font=helv, color=BLACK) => {
        const t = sanitize(text);
        if(!t) return;
        const parts = t.replace(/\r/g, "").split("\n");
        const lines = [];
        parts.forEach(part => {
          const words = part.split(/\s+/).filter(Boolean);
          if(words.length === 0){ lines.push(""); return; }
          let line = "";
          words.forEach(w => {
            const test = line ? (line + " " + w) : w;
            if(font.widthOfTextAtSize(test, size) <= maxW) line = test;
            else { if(line) lines.push(line); line = w; }
          });
          if(line) lines.push(line);
        });
        let y = topY;
        lines.slice(0, maxLines).forEach(ln => {
          page.drawText(ln, { x, y, size, font, color });
          y -= lineH;
        });
      };

      const drawSectionHeader = (page, title, yTop) => {
        page.drawRectangle({ x:40, y:yTop-16, width:515, height:16, color: RED });
        drawText(page, title, 46, yTop-12, 9, helvBold, WHITE);
      };

      const drawLabeledBox = (page, label, value, x, y, w, h=18) => {
        drawText(page, label, x, y + h + 2, 7, helvBold);
        page.drawRectangle({ x, y, width:w, height:h, borderColor: BLACK, borderWidth: 1, color: LIGHT });
        drawText(page, value, x + 4, y + 6, 8);
      };

      const drawTextArea = (page, label, value, x, y, w, h) => {
        drawText(page, label, x, y + h + 2, 7, helvBold);
        page.drawRectangle({ x, y, width:w, height:h, borderColor: BLACK, borderWidth: 1, color: LIGHT });
        drawWrap(page, value, x + 6, y + h - 6, w - 12, 10, 8, Math.floor(h / 12));
      };

      const drawCheckboxGrid = (page, items, x, yTop, colCount=3, rowH=14, colW=170) => {
        const rows = Math.ceil(items.length / colCount);
        for(let r=0;r<rows;r++){
          for(let c=0;c<colCount;c++){
            const idx = r*colCount + c;
            if(idx >= items.length) continue;
            const item = items[idx];
            const x0 = x + (c * colW);
            const y = yTop - (r * rowH);
            page.drawRectangle({ x: x0, y: y-9, width: 10, height: 10, borderColor: BLACK, borderWidth: 1, color: WHITE });
            if(item.checked){
              page.drawText("X", { x: x0 + 2, y: y-8, size: 9, font: helvBold, color: BLACK });
            }
            drawText(page, item.label, x0 + 14, y-6, 7);
          }
        }
      };

      const points = [
        { label: "Confined Spaces / Areas", checked: data.points.confined },
        { label: "Emergency Procedures", checked: data.points.emergency },
        { label: "Lifting Equipment - Chains / Slings", checked: data.points.lifting },
        { label: "Permits to Work", checked: data.points.permits },
        { label: "Plant & Equipment", checked: data.points.plant },
        { label: "Safety Planning", checked: data.points.safetyPlanning },
        { label: "Barriers / Edge Protection", checked: data.points.barriers },
        { label: "Clear Access Ways", checked: data.points.clearAccess },
        { label: "Method Statements / Risk Assessments", checked: data.points.methodStatements },
        { label: "Suitable PPE", checked: data.points.suitablePPE },
        { label: "Trench Collapse", checked: data.points.trenchCollapse },
        { label: "Welfare Facilities", checked: data.points.welfare },
        { label: "COSHH Assessments", checked: data.points.coshh },
        { label: "Fire Precautions", checked: data.points.fire },
        { label: "Materials", checked: data.points.materials },
        { label: "Competence", checked: data.points.competence },
        { label: "Overhead / Underground Cable Strike", checked: data.points.cables },
        { label: "Trips / Falls", checked: data.points.trips }
      ];

      const risks = [
        { label: "Oxygen enrichment/deficiency", checked: data.riskAssessment.o2 },
        { label: "Toxic gases/vapours/fumes", checked: data.riskAssessment.toxic },
        { label: "Flammable gases/vapours/fumes", checked: data.riskAssessment.flammable },
        { label: "Ingress of liquids/gas/solids", checked: data.riskAssessment.ingress },
        { label: "Sludge/deposits/waste", checked: data.riskAssessment.sludge },
        { label: "Animals/biological hazards", checked: data.riskAssessment.animals },
        { label: "Mechanical/electrical hazards", checked: data.riskAssessment.mechanical },
        { label: "Hot work within space", checked: data.riskAssessment.hotwork },
        { label: "Use of chemicals", checked: data.riskAssessment.chemicals },
        { label: "Physical/structural hazards", checked: data.riskAssessment.physical },
        { label: "Temperature extremes", checked: data.riskAssessment.temperature },
        { label: "Ionising radiation", checked: data.riskAssessment.radiation }
      ];

      const controls = [
        { label: "Isolation - Physical", checked: data.controls.isoPhys },
        { label: "Isolation - Electrical", checked: data.controls.isoElec },
        { label: "Isolation - Mechanical", checked: data.controls.isoMech },
        { label: "Cleaning/Purging of space", checked: data.controls.cleaning },
        { label: "Ventilation - Natural", checked: data.controls.ventNat },
        { label: "Ventilation - Forced", checked: data.controls.ventForced },
        { label: "Lighting - 110V", checked: data.controls.light110 },
        { label: "Lighting - Low Voltage", checked: data.controls.lightLow },
        { label: "Safety signage/Barricades", checked: data.controls.signage },
        { label: "Communication equipment", checked: data.controls.comms },
        { label: "Atmospheric testing (initial)", checked: data.controls.testing },
        { label: "Constant monitoring", checked: data.controls.monitoring },
        { label: "Fire extinguishers", checked: data.controls.extinguishers },
        { label: "RPE (BA / Escape set)", checked: data.controls.rpe },
        { label: "Training/Competence", checked: data.controls.training }
      ];

      const emergency = [
        { label: "Rescue plan in place", checked: data.emergency.plan },
        { label: "Tripod / Winch / Davit", checked: data.emergency.tripod },
        { label: "Harness / Rescue line", checked: data.emergency.harness },
        { label: "Fall arrest equipment", checked: data.emergency.fallArrest },
        { label: "Recovery stretcher", checked: data.emergency.stretcher },
        { label: "Resuscitation equipment", checked: data.emergency.resuscitation },
        { label: "Breathing apparatus (Rescue)", checked: data.emergency.ba },
        { label: "Emergency lighting", checked: data.emergency.light },
        { label: "Method of raising alarm", checked: data.emergency.alarm },
        { label: "Method of communication", checked: data.emergency.comms },
        { label: "Standby person (Top-man)", checked: data.emergency.standby }
      ];

      const safety = [
        { label: "Head protection (Hard hat)", checked: data.safetyEquipment.head },
        { label: "Eye protection", checked: data.safetyEquipment.eye },
        { label: "Hearing protection", checked: data.safetyEquipment.hearing },
        { label: "Foot protection", checked: data.safetyEquipment.foot },
        { label: "Hand protection", checked: data.safetyEquipment.hand },
        { label: "High visibility clothing", checked: data.safetyEquipment.hiVis },
        { label: "Fall arrest / restraint", checked: data.safetyEquipment.fallArrest },
        { label: "Respiratory protection (RPE)", checked: data.safetyEquipment.rpe }
      ];

      const marginX = 40;
      const contentW = 515;
      const colGap = 15;
      const colW = (contentW - colGap) / 2;
      const rowH = 18;

      const drawTwoColRow = (page, y, leftLabel, leftValue, rightLabel, rightValue) => {
        drawLabeledBox(page, leftLabel, leftValue, marginX, y, colW, rowH);
        drawLabeledBox(page, rightLabel, rightValue, marginX + colW + colGap, y, colW, rowH);
      };

      const drawHeaderLine = (page) => {
        drawText(page, "Title:  Confined Space Permit", marginX, 782, 9, helvBold, BLACK);
        page.drawLine({ start:{ x:marginX, y:775 }, end:{ x:marginX + contentW, y:775 }, thickness:1, color: BLACK });
      };

      const drawRedBar = (page, y, leftText, rightText) => {
        page.drawRectangle({ x:marginX, y, width:contentW, height:16, color: RED });
        drawText(page, leftText, marginX + 6, y + 4, 8, helvBold, WHITE);
        if(rightText){
          drawText(page, rightText, marginX + 320, y + 4, 8, helvBold, WHITE);
        }
      };

      const drawTable = (page, x, y, w, h, cols, rows) => {
        page.drawRectangle({ x, y, width:w, height:h, borderColor: BLACK, borderWidth: 1, color: WHITE });
        for(let i=1;i<cols;i++){
          const cx = x + (w/cols)*i;
          page.drawLine({ start:{ x:cx, y }, end:{ x:cx, y:y+h }, thickness:1, color: BLACK });
        }
        for(let r=1;r<rows;r++){
          const cy = y + (h/rows)*r;
          page.drawLine({ start:{ x, y:cy }, end:{ x:x+w, y:cy }, thickness:1, color: BLACK });
        }
      };

      const normalizeCols = (cols, w) => {
        const sum = cols.reduce((a,b)=>a+b, 0) || 1;
        const scale = w / sum;
        return cols.map(c => c * scale);
      };

      const drawTableCols = (page, x, y, w, h, cols, rows) => {
        const colWidths = normalizeCols(cols, w);
        page.drawRectangle({ x, y, width:w, height:h, borderColor: BLACK, borderWidth: 1, color: WHITE });
        let cx = x;
        for(let i=0;i<colWidths.length-1;i++){
          cx += colWidths[i];
          page.drawLine({ start:{ x:cx, y }, end:{ x:cx, y:y+h }, thickness:1, color: BLACK });
        }
        for(let r=1;r<rows;r++){
          const cy = y + (h/rows)*r;
          page.drawLine({ start:{ x, y:cy }, end:{ x:x+w, y:cy }, thickness:1, color: BLACK });
        }
        return colWidths;
      };

      const drawHeaderRow = (page, x, y, w, labels, fontSize=7) => {
        const colW = w / labels.length;
        labels.forEach((label, idx) => {
          drawText(page, label, x + (colW * idx) + 4, y + 4, fontSize, helvBold, BLACK);
        });
      };

      const drawHeaderRowCols = (page, x, y, colWidths, labels, fontSize=7) => {
        let cx = x;
        labels.forEach((label, idx) => {
          const colW = colWidths[idx] || 0;
          const maxW = Math.max(0, colW - 6);
          const textW = helvBold.widthOfTextAtSize(label, fontSize);
          if(textW <= maxW){
            const tx = cx + Math.max(0, (colW - textW) / 2);
            drawText(page, label, tx, y, fontSize, helvBold, BLACK);
          } else {
            drawWrap(page, label, cx + 3, y + 6, maxW, 7, fontSize, 2, helvBold, BLACK);
          }
          cx += colW;
        });
      };

      // Page 1
      drawHeaderLine(page1);
      drawRedBar(page1, 735, `Project: ${data.projectTitle || ""}`, `Permit No: ${data.permitNo || ""}`);

      drawLabeledBox(page1, "Project", data.projectTitle, marginX, 710, colW, rowH);
      drawLabeledBox(page1, "Permit No", data.permitNo, marginX + colW + colGap, 710, colW, rowH);
      drawLabeledBox(page1, "Company", data.contractorName, marginX, 682, colW, rowH);
      drawLabeledBox(page1, "Date", data.dateISO, marginX + colW + colGap, 682, colW, rowH);
      drawLabeledBox(page1, "Issue time", data.startTime, marginX, 654, colW, rowH);
      drawLabeledBox(page1, "Expiry time", data.finishTime, marginX + colW + colGap, 654, colW, rowH);
      drawLabeledBox(page1, "Location of Work Site", data.workLocation || data.siteLocation, marginX, 626, contentW, rowH);
      drawTextArea(page1, "Description of Works", data.workDescription, marginX, 560, contentW, 55);

      drawText(page1, "Applicability: This permit establishes that all hazards have been identified and controlled...", marginX, 535, 7);
      drawText(page1, "Instructions: This form must be signed by the authorising person before entry...", marginX, 520, 7);
      drawText(page1, "Note - Working in a confined space is strictly prohibited unless all other practicable measures...", marginX, 505, 7);

      drawRedBar(page1, 480, "1   Permit Conditions", "");
      drawTable(page1, marginX, 380, contentW, 95, 2, 1);
      drawText(page1, "Reason for entry:", marginX + 6, 462, 7, helvBold);
      drawText(page1, "Entry date:", marginX + 265, 462, 7, helvBold);
      drawText(page1, "Permit expiry (date and time):", marginX + 265, 448, 7, helvBold);
      drawText(page1, "Acceptable entry conditions:", marginX + 265, 434, 7, helvBold);
      drawText(page1, "Gas monitor checks made prior to entry:", marginX + 265, 420, 7, helvBold);
      drawText(page1, "Entrants:", marginX + 6, 434, 7, helvBold);
      drawWrap(page1, data.personnel, marginX + 6, 424, 240, 10, 8, 6);

      drawTable(page1, marginX, 320, contentW, 50, 1, 2);
      drawText(page1, "Known and potential hazards:", marginX + 6, 348, 7, helvBold);
      drawText(page1, "Additional required permits (for example hot work):", marginX + 6, 334, 7, helvBold);

      // Page 2
      drawHeaderLine(page2);
      drawText(page2, "2   Requirements Checklist", marginX, 744, 9, helvBold);
      page2.drawRectangle({ x:marginX, y:700, width:255, height:16, color: RED });
      page2.drawRectangle({ x:marginX + 260, y:700, width:255, height:16, color: RED });
      drawText(page2, "Equipment", marginX + 6, 704, 8, helvBold, WHITE);
      drawText(page2, "Personal protective equipment and personal monitors", marginX + 266, 704, 7, helvBold, WHITE);

      const equipmentItems = [
        { label: "Full Body Harness", checked: data.safetyEquipment.fallArrest },
        { label: "Lifeline", checked: false },
        { label: "Warning Signs", checked: data.controls.signage },
        { label: "Ladder", checked: false },
        { label: "Ventilation Fan / blower", checked: data.controls.ventForced || data.controls.ventNat },
        { label: "Fire Extinguisher (Type):", checked: data.controls.extinguishers },
        { label: "Self-Contained breathing apparatus (SCBA)", checked: data.controls.rpe },
        { label: "Air purifying respirator (cartridge type)", checked: data.controls.rpe },
        { label: "Other", checked: false }
      ];
      const ppeItems = [
        { label: "Gloves", checked: data.safetyEquipment.hand },
        { label: "Safety glasses", checked: data.safetyEquipment.eye },
        { label: "Face / Eye Protection", checked: data.safetyEquipment.eye },
        { label: "Hearing", checked: data.safetyEquipment.hearing },
        { label: "Hard hat", checked: data.safetyEquipment.head },
        { label: "Hi-vis", checked: data.safetyEquipment.hiVis },
        { label: "Respirator", checked: data.safetyEquipment.rpe },
        { label: "Other", checked: !!data.safetyOthers }
      ];
      drawCheckboxGrid(page2, equipmentItems, marginX + 6, 680, 1, 14, 240);
      drawCheckboxGrid(page2, ppeItems, marginX + 266, 680, 1, 14, 240);

      drawText(page2, "3   Pre-entry Checklist", marginX, 520, 9, helvBold);
      page2.drawRectangle({ x:marginX, y:490, width:255, height:16, color: RED });
      page2.drawRectangle({ x:marginX + 260, y:490, width:255, height:16, color: RED });
      drawText(page2, "Pre-entry Checklist", marginX + 6, 494, 8, helvBold, WHITE);
      drawText(page2, "Control of hazardous energy / Communication / Lighting", marginX + 266, 494, 7, helvBold, WHITE);
      drawCheckboxGrid(page2, points, marginX + 6, 470, 1, 14, 240);
      const energyItems = [
        { label: "Lockout / tag out", checked: data.controls.isoElec || data.controls.isoPhys },
        { label: "Zero voltage verification", checked: false },
        { label: "Communication", checked: data.controls.comms },
        { label: "Lighting", checked: data.controls.light110 || data.controls.lightLow },
        { label: "Purging", checked: data.controls.cleaning },
        { label: "Other", checked: false }
      ];
      drawCheckboxGrid(page2, energyItems, marginX + 266, 470, 1, 14, 240);

      page2.drawRectangle({ x:marginX, y:320, width:contentW, height:16, color: RED });
      drawText(page2, "Atmospheric Test Record", marginX + 6, 324, 8, helvBold, WHITE);
      const atmosCols = drawTableCols(page2, marginX, 250, contentW, 70, [55, 60, 130, 75, 55, 45, 95], 4);
      drawHeaderRowCols(page2, marginX, 314, atmosCols, [
        "Device",
        "Substance",
        "Substance Monitoring",
        "Acceptance",
        "Result",
        "Time",
        "Duration"
      ], 6.5);

      // Page 3
      drawHeaderLine(page3);
      page3.drawRectangle({ x:marginX, y:700, width:contentW, height:16, color: RED });
      drawText(page3, "4   Personnel Entry & Exit record", marginX + 6, 704, 8, helvBold, WHITE);
      const entryCols = drawTableCols(page3, marginX, 260, contentW, 430, [90, 80, 90, 80, 90, 85], 18);
      drawHeaderRowCols(page3, marginX, 684, entryCols, [
        "Entrant name",
        "Attendant name",
        "Entrant name",
        "Attendant name",
        "Entrant name",
        "Attendant name"
      ], 6.5);
      drawText(page3, "Time in/out", marginX + 6, 652, 7);
      drawTextArea(page3, "Notes", data.preEntryBriefing, marginX, 210, contentW, 40);

      // Page 4
      const page4 = pdfDoc.addPage(A4);
      drawHeaderLine(page4);
      page4.drawRectangle({ x:marginX, y:700, width:contentW, height:16, color: RED });
      drawText(page4, "5   Air Monitoring Results", marginX + 6, 704, 8, helvBold, WHITE);
      const airCols = drawTableCols(page4, marginX, 440, contentW, 250, [90, 85, 50, 90, 70, 60, 70], 12);
      drawHeaderRowCols(page4, marginX, 684, airCols, [
        "Device(s)",
        "Serial number",
        "Time",
        "Sampled by",
        "O2 (19.5–21%)",
        "CO (<25 ppm)",
        "Other"
      ], 6.5);

      drawText(page4, "6   Pre-entry Certification", marginX, 390, 9, helvBold);
      page4.drawRectangle({ x:marginX, y:350, width:contentW, height:30, borderColor: BLACK, borderWidth: 1, color: LIGHT });
      drawText(page4, `Name: ${data.authorisingPerson}`, marginX + 6, 362, 8);
      drawText(page4, `Signature:`, marginX + 200, 362, 8);
      drawText(page4, `Date: ${data.dateISO}`, marginX + 420, 362, 8);

      drawText(page4, "7   Permit Closure", marginX, 310, 9, helvBold);
      page4.drawRectangle({ x:marginX, y:270, width:contentW, height:30, borderColor: BLACK, borderWidth: 1, color: LIGHT });
      drawText(page4, `Name: ${data.closureName}`, marginX + 6, 282, 8);
      drawText(page4, `Signature:`, marginX + 200, 282, 8);
      drawText(page4, `Date: ${data.dateISO}`, marginX + 420, 282, 8);

      const outBytes = await pdfDoc.save();
      const blob = new Blob([outBytes], { type:"application/pdf" });
      const url = URL.createObjectURL(blob);
      const filename = `Confined-space-permit_${new Date().toISOString().slice(0,10)}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(()=> URL.revokeObjectURL(url), 2500);
    }

    async function generateHotWorkPermitPDF(data, precautionsList, checksList){
      if(!window.PDFLib){
        throw new Error("PDF engine is blocked (pdf-lib did not load). If you use a strict Content-Security-Policy, you must allow the CDN or host pdf-lib locally.");
      }

      const { PDFDocument, StandardFonts, rgb } = PDFLib;
      const pdfDoc = await PDFDocument.create();
      const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const A4 = [595.28, 841.89];
      const page1 = pdfDoc.addPage(A4);
      const page2 = pdfDoc.addPage(A4);

      const BLACK = rgb(0,0,0);
      const RED = rgb(0.78, 0.1, 0.1);

      const sanitizePdfText = (text) => {
        let s = String(text ?? "");
        s = s.replace(/[\u2018\u2019]/g, "'")
             .replace(/[\u201C\u201D]/g, '"')
             .replace(/[\u2010-\u2015\u2212\u00ad]/g, "-")
             .replace(/\u2026/g, "...")
             .replace(/\u00A0/g, " ");
        if (s.normalize) {
          s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        }
        s = s.replace(/[^\x0A\x0D\x20-\x7E]/g, "");
        return s;
      };
      const drawText = (page, text, x, y, size=9, font=helv) => {
        const safeText = sanitizePdfText(text);
        if(!safeText) return;
        page.drawText(safeText, { x, y, size, font, color: BLACK });
      };
      const drawBold = (page, text, x, y, size=9) => {
        const safeText = sanitizePdfText(text);
        if(!safeText) return;
        page.drawText(safeText, { x, y, size, font: helvBold, color: BLACK });
      };
      const drawCell = (page, x, y, w, h, fill=null) => {
        page.drawRectangle({ x, y, width:w, height:h, borderColor: BLACK, borderWidth: 1, color: fill || undefined });
      };
      const drawCheck = (page, x, y, size, checked) => {
        drawCell(page, x, y, size, size);
        if(checked){
          page.drawLine({ start:{ x:x+2, y:y+4 }, end:{ x:x+5, y:y+2 }, thickness:1.4, color: BLACK });
          page.drawLine({ start:{ x:x+5, y:y+2 }, end:{ x:x+size-2, y:y+size-2 }, thickness:1.4, color: BLACK });
        }
      };

      async function fetchImage(url){
        try{
          const res = await fetch(url, { cache:"no-store" });
          if(!res.ok) return null;
          return new Uint8Array(await res.arrayBuffer());
        }catch(err){
          return null;
        }
      }
      const detectImageType = (bytes) => {
        if(!bytes || bytes.length < 4) return null;
        if(bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
        if(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
        return null;
      };
      const embedImageBytes = async (bytes) => {
        const type = detectImageType(bytes);
        if(type === "jpeg") return await pdfDoc.embedJpg(bytes);
        if(type === "png") return await pdfDoc.embedPng(bytes);
        return null;
      };

      const atlBytes = await fetchImage("/atl-logo.png") || await fetchImage("atl-logo.png");
      if(atlBytes){
        const logo = await embedImageBytes(atlBytes);
        if(logo){
          const scale = 140 / logo.width;
          page1.drawImage(logo, { x:40, y:780, width: logo.width*scale, height: logo.height*scale });
          page2.drawImage(logo, { x:40, y:780, width: logo.width*scale, height: logo.height*scale });
        }
      }

      drawText(page1, "Hot Works Permit", 430, 800, 12, helvBold);
      page1.drawLine({ start:{ x:40, y:760 }, end:{ x:555, y:760 }, thickness:1, color: BLACK });

      let y = 730;
      drawCell(page1, 40, y-20, 360, 40);
      drawText(page1, "Copy of permit to be retained by person carrying out work and by the Hot Works Responsible Person for the duration of the hot work operation", 46, y-12, 7);
      drawCell(page1, 400, y-20, 80, 20);
      drawCell(page1, 480, y-20, 75, 20);
      drawBold(page1, "Permit No:", 404, y-8, 8);
      drawText(page1, data.permitNo, 485, y-8, 8);
      drawCell(page1, 400, y-40, 80, 20);
      drawCell(page1, 480, y-40, 75, 20);
      drawBold(page1, "Date Required:", 404, y-28, 8);
      drawText(page1, data.dateRequired, 485, y-28, 8);

      y -= 60;
      const rows = [
        ["1. Permit requested by:", data.requestedBy],
        ["2. Address and location:", data.address],
        ["3. Description of works:", data.description]
      ];
      rows.forEach(([label, value])=>{
        drawCell(page1, 40, y-20, 515, 20);
        drawBold(page1, label, 46, y-8, 8);
        drawText(page1, value, 180, y-8, 8);
        y -= 20;
      });

      drawCell(page1, 40, y-22, 515, 22);
      drawBold(page1, "4. Activity involves:", 46, y-8, 8);
      const acts = [
        ["Welding incl. Thermic Melting","welding"],
        ["Burning or Cutting","burning"],
        ["Soldering","soldering"],
        ["Gas cutting","gasCutting"],
        ["Brazing","brazing"],
        ["Disc cutting/grinding","discCutting"],
        ["Heathland Clearing","heathland"],
        ["Other","other"]
      ];
      let ax = 140;
      acts.forEach(([label,key], idx)=>{
        const boxX = ax + (idx%4)*100;
        const rowY = y-18 - Math.floor(idx/4)*14;
        drawCheck(page1, boxX, rowY, 10, data.activities[key]);
        drawText(page1, label, boxX+14, rowY+2, 7);
      });
      y -= 40;

      const infoRows = [
        ["5. Hot Works Responsible Person (HWRP):", data.hwrp],
        ["6. Name of contractor/company carrying out Hot Works:", data.contractor],
        ["7. Name of the Responsible Person for Fire Safety:", data.fireSafety]
      ];
      infoRows.forEach(([label, value])=>{
        drawCell(page1, 40, y-20, 515, 20);
        drawBold(page1, label, 46, y-8, 8);
        drawText(page1, value, 300, y-8, 8);
        y -= 20;
      });

      drawCell(page1, 40, y-24, 515, 24);
      drawText(page1, "8. Hot works area is to be under continuous fire watch for at least 1 hour after hot works have ceased and regularly inspected for at least a further 1 hour", 46, y-12, 7);
      y -= 30;

      drawCell(page1, 40, y-18, 515, 18);
      drawBold(page1, "9. Precautions to be checked immediately before commencement of works", 46, y-7, 8);
      drawBold(page1, "YES", 485, y-7, 7);
      drawBold(page1, "N/A", 525, y-7, 7);
      y -= 18;
      precautionsList.forEach(({ code, text }, idx)=>{
        drawCell(page1, 40, y-16, 475, 16);
        drawText(page1, code, 46, y-6, 7);
        drawText(page1, text, 84, y-6, 7);
        drawCheck(page1, 520, y-12, 10, data.precautions[idx]);
        drawCheck(page1, 548, y-12, 10, data.precautionsNa[idx]);
        y -= 16;
        if(y < 80) return;
      });

      drawText(page1, "Document Ref: QPFS18.6", 40, 24, 8);
      drawText(page1, "August 2024", 260, 24, 8);
      drawText(page1, "01", 520, 24, 8);

      // Page 2
      drawText(page2, "Hot Works Permit", 430, 800, 12, helvBold);
      page2.drawLine({ start:{ x:40, y:760 }, end:{ x:555, y:760 }, thickness:1, color: BLACK });

      let y2 = 740;
      checksList.forEach(({ code, text }, idx)=>{
        drawText(page2, "•", 44, y2, 10);
        drawText(page2, code, 54, y2, 7);
        drawText(page2, text, 94, y2, 7);
        drawCheck(page2, 520, y2-6, 10, data.checks[idx]);
        drawCheck(page2, 545, y2-6, 10, data.checksNa[idx]);
        y2 -= 14;
      });

      drawText(page2, "No. of Extinguishers", 54, y2, 7);
      ["co2","foam","water","dryPowder"].forEach((k, idx)=>{
        drawCheck(page2, 200 + (idx*60), y2-6, 10, data.extinguishers[k]);
        drawText(page2, k.toUpperCase(), 214 + (idx*60), y2, 7);
      });
      y2 -= 24;

      drawText(page2, "7. In the area below, prepare a sketch of the work area highlighting; cutting/welding area(s) and any combustible material/flammable liquids areas which need to be protected:", 40, y2, 7);
      y2 -= 10;
      drawCell(page2, 40, y2-200, 515, 200);
      drawText(page2, data.sketch, 46, y2-12, 8);

      y2 -= 220;
      drawCell(page2, 40, y2-20, 515, 20, RED);
      drawText(page2, "8. Authorisation (Permit must be issued for a defined period not exceeding 1 working day/shift)", 46, y2-12, 7, helvBold);
      y2 -= 20;
      drawCell(page2, 40, y2-72, 515, 72);
      drawText(page2, "Permit valid from:", 46, y2-12, 7);
      drawText(page2, data.permitValidFrom, 130, y2-12, 7);
      drawText(page2, "Time:", 220, y2-12, 7);
      drawText(page2, data.permitTimeFrom, 250, y2-12, 7);
      drawText(page2, "To:", 320, y2-12, 7);
      drawText(page2, data.permitValidTo, 340, y2-12, 7);
      drawText(page2, "Time:", 420, y2-12, 7);
      drawText(page2, data.permitTimeTo, 450, y2-12, 7);

      y2 -= 80;
      drawCell(page2, 40, y2-90, 515, 90);
      drawText(page2, "Name of person undertaking Hot Works:", 46, y2-12, 7);
      drawText(page2, data.authorisedBy, 230, y2-12, 7);
      drawText(page2, "Signature:", 320, y2-12, 7);
      drawText(page2, data.authorisedSig, 380, y2-12, 7);
      drawText(page2, "Date/Time:", 430, y2-12, 7);
      drawText(page2, data.authorisedDate, 490, y2-12, 7);

      drawText(page2, "Name of person appointed as Fire Watcher", 46, y2-34, 7);
      drawText(page2, data.fireWatcher, 230, y2-34, 7);
      drawText(page2, "Signature:", 320, y2-34, 7);
      drawText(page2, data.fireWatcherSig, 380, y2-34, 7);
      drawText(page2, "Date/Time:", 430, y2-34, 7);
      drawText(page2, data.fireWatcherDate, 490, y2-34, 7);

      drawText(page2, "Name of HWRP", 46, y2-56, 7);
      drawText(page2, data.hwrpName, 230, y2-56, 7);
      drawText(page2, "Signature:", 320, y2-56, 7);
      drawText(page2, data.hwrpSig, 380, y2-56, 7);
      drawText(page2, "Date/Time:", 430, y2-56, 7);
      drawText(page2, data.hwrpDate, 490, y2-56, 7);

      y2 -= 100;
      drawCell(page2, 40, y2-70, 515, 70);
      drawText(page2, "9. Fire Watch Clearance and Cancellation of Permit", 46, y2-12, 7, helvBold);
      drawText(page2, "The works were completed at:", 46, y2-30, 7);
      drawText(page2, data.completionTimeFrom, 170, y2-30, 7);
      drawText(page2, "hrs", 210, y2-30, 7);
      drawText(page2, "and a fire watch has been maintained continuously from", 230, y2-30, 7);
      drawText(page2, data.fireWatchTimeFrom, 420, y2-30, 7);
      drawText(page2, "hrs to", 460, y2-30, 7);
      drawText(page2, data.fireWatchTimeTo, 490, y2-30, 7);

      drawText(page2, "Name of person appointed as Fire Watcher:", 46, y2-48, 7);
      drawText(page2, data.clearanceBy, 240, y2-48, 7);
      drawText(page2, "Signature:", 320, y2-48, 7);
      drawText(page2, data.clearanceSig, 380, y2-48, 7);
      drawText(page2, "Date/Time:", 430, y2-48, 7);
      drawText(page2, data.clearanceDate, 490, y2-48, 7);

      drawText(page2, "Document Ref: QPFS18.6", 40, 24, 8);
      drawText(page2, "August 2024", 260, 24, 8);
      drawText(page2, "01", 520, 24, 8);

      const outBytes = await pdfDoc.save();
      const blob = new Blob([outBytes], { type:"application/pdf" });
      const url = URL.createObjectURL(blob);
      const filename = `Hot-Works-Permit_${data.dateRequired || todayISO()}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(()=> URL.revokeObjectURL(url), 2500);
    }

    async function generateGroundDisturbancePDF(data){
      if(!window.PDFLib){
        throw new Error("PDF engine is blocked (pdf-lib did not load). If you use a strict Content-Security-Policy, you must allow the CDN or host pdf-lib locally.");
      }

      const { PDFDocument, StandardFonts, rgb } = PDFLib;
      const pdfDoc = await PDFDocument.create();
      const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const A4 = [595.28, 841.89];
      const page1 = pdfDoc.addPage(A4);
      const page2 = pdfDoc.addPage(A4);
      const page3 = pdfDoc.addPage(A4);

      const RED = rgb(0.78, 0.1, 0.1);
      const BLACK = rgb(0,0,0);
      const LIGHT = rgb(0.97,0.97,0.97);
      const WHITE = rgb(1,1,1);

      const sanitize = (text) => {
        let s = String(text ?? "");
        s = s.replace(/[\u2018\u2019]/g, "'")
             .replace(/[\u201C\u201D]/g, '"')
             .replace(/[\u2010-\u2015\u2212\u00ad]/g, "-")
             .replace(/\u2026/g, "...")
             .replace(/\u00A0/g, " ");
        if (s.normalize) {
          s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        }
        s = s.replace(/[^\x0A\x0D\x20-\x7E]/g, "");
        return s;
      };

      const drawText = (page, text, x, y, size=9, font=helv, color=BLACK) => {
        const t = sanitize(text);
        if(!t) return;
        page.drawText(t, { x, y, size, font, color });
      };

      const drawWrap = (page, text, x, topY, maxW, lineH=11, size=9, maxLines=10, font=helv, color=BLACK) => {
        const t = sanitize(text);
        if(!t) return;
        const parts = t.replace(/\r/g, "").split("\n");
        const lines = [];
        parts.forEach(part => {
          const words = part.split(/\s+/).filter(Boolean);
          if(words.length === 0){ lines.push(""); return; }
          let line = "";
          words.forEach(w => {
            const test = line ? (line + " " + w) : w;
            if(font.widthOfTextAtSize(test, size) <= maxW) line = test;
            else { if(line) lines.push(line); line = w; }
          });
          if(line) lines.push(line);
        });
        let y = topY;
        lines.slice(0, maxLines).forEach(ln => {
          page.drawText(ln, { x, y, size, font, color });
          y -= lineH;
        });
      };

      const drawSectionHeader = (page, title, yTop) => {
        page.drawRectangle({ x:40, y:yTop-16, width:515, height:16, color: RED });
        drawText(page, title, 46, yTop-12, 9, helvBold, WHITE);
      };

      const drawLabeledBox = (page, label, value, x, y, w, h=20) => {
        drawText(page, label, x, y + h + 2, 7, helvBold);
        page.drawRectangle({ x, y, width:w, height:h, borderColor: BLACK, borderWidth: 1, color: LIGHT });
        drawText(page, value, x + 4, y + 6, 8);
      };

      const drawTextArea = (page, label, value, x, y, w, h) => {
        drawText(page, label, x, y + h + 2, 7, helvBold);
        page.drawRectangle({ x, y, width:w, height:h, borderColor: BLACK, borderWidth: 1, color: LIGHT });
        drawWrap(page, value, x + 6, y + h - 6, w - 12, 10, 8, Math.floor(h / 12));
      };

      const utils = [
        `Underground: ${data.utilities.underground ? "Yes" : "No"}`,
        `Electrical: ${data.utilities.electrical ? "Yes" : "No"}`,
        `Gas: ${data.utilities.gas ? "Yes" : "No"}`,
        `Water: ${data.utilities.water ? "Yes" : "No"}`,
        `Telecom: ${data.utilities.telecom ? "Yes" : "No"}`,
        `Surface/Sewer: ${data.utilities.surfaceSewer ? "Yes" : "No"}`,
        `Other: ${data.utilities.other ? "Yes" : "No"}`
      ].join(" | ");

      // Page 1
      page1.drawRectangle({ x:40, y:800, width:515, height:24, color: RED });
      drawText(page1, "PERMIT TO BREAK GROUND (EXCLUSION ZONE)", 50, 806, 11, helvBold, WHITE);

      let y = 770;
      drawLabeledBox(page1, "Project Name", data.projectName, 40, y, 250);
      drawLabeledBox(page1, "Project No", data.projectNo, 305, y, 250);

      y -= 40;
      drawLabeledBox(page1, "Permit No", data.permitNo, 40, y, 180);
      drawLabeledBox(page1, "Permit compiled by", data.preparedBy, 230, y, 325);

      y -= 40;
      drawLabeledBox(page1, "Permit issued to", data.issuedTo, 40, y, 250);
      drawLabeledBox(page1, "Permit validity from", data.validFrom, 305, y, 120);
      drawLabeledBox(page1, "Permit validity to", data.validTo, 435, y, 120);

      y -= 40;
      drawLabeledBox(page1, "Work Package Plan Name & No", data.workPackage, 40, y, 515);

      y -= 28;
      drawSectionHeader(page1, "1. Extent of permit, location & brief description of work", y);
      y -= 86;
      drawTextArea(page1, "Description", data.locationDescription, 40, y, 515, 80);

      y -= 26;
      drawSectionHeader(page1, "2. Survey conclusions", y);
      y -= 76;
      drawTextArea(page1, "Survey conclusions", data.surveyConclusions, 40, y, 515, 70);

      y -= 24;
      drawText(page1, `Utilities: ${utils}`, 46, y + 6, 8);
      drawText(page1, `Other: ${data.utilitiesOther}`, 46, y - 6, 8);
      drawText(page1, `Signed (Utility Co-ordinator): ${data.coordinatorName}  Date: ${data.coordinatorDate}  Time: ${data.coordinatorTime}`, 46, y - 18, 8);

      y -= 40;
      drawSectionHeader(page1, "3. Controls (Utility Co-ordinator)", y);
      y -= 46;
      drawTextArea(page1, "Isolations requested granted/denied (details)", data.isolationsDetails, 40, y, 515, 36);

      y -= 46;
      drawTextArea(page1, "Design changes requested granted/denied (details)", data.designChangesDetails, 40, y, 515, 36);

      y -= 34;
      drawLabeledBox(page1, "PPE required", data.ppeRequired, 40, y, 250);
      drawLabeledBox(page1, "Excavation tools required", data.excavationTools, 305, y, 250);

      y -= 42;
      drawTextArea(page1, "Excavation support/protection equipment required", data.excavationSupport, 40, y, 515, 36);

      y -= 42;
      drawTextArea(page1, "Backfill/marker placement requirements", data.backfillRequirements, 40, y, 515, 36);

      y -= 42;
      drawTextArea(page1, "Composite colour drawing / reference", data.compositeDrawing, 40, y, 515, 36);

      y -= 42;
      drawTextArea(page1, "Utility markers details", data.utilityMarkers, 40, y, 515, 36);

      y -= 24;
      drawText(page1, `Network Rail Buried Services forms completed: ${data.networkRailConfirmed ? "Yes" : "No"}`, 46, y, 8);

      // Page 2
      page2.drawRectangle({ x:40, y:800, width:515, height:24, color: RED });
      drawText(page2, "4. Simplified sketch of all known utilities", 50, 806, 11, helvBold, WHITE);
      page2.drawRectangle({ x:40, y:140, width:515, height:640, borderColor: BLACK, borderWidth: 1, color: LIGHT });
      drawWrap(page2, data.sketch, 46, 770, 505, 11, 9, 38);

      drawSectionHeader(page2, "5. Excavation Supervisor's acceptance", 120);
      drawText(page2, `Name: ${data.acceptanceName}`, 46, 96, 9);
      drawText(page2, `Signed: ${data.acceptanceSigned}`, 230, 96, 9);
      drawText(page2, `Date: ${data.acceptanceDate}`, 390, 96, 9);
      drawText(page2, `Time: ${data.acceptanceTime}`, 470, 96, 9);

      // Page 3
      page3.drawRectangle({ x:40, y:800, width:515, height:24, color: RED });
      drawText(page3, "Additional findings / variations", 50, 806, 11, helvBold, WHITE);
      page3.drawRectangle({ x:40, y:540, width:515, height:240, borderColor: BLACK, borderWidth: 1, color: LIGHT });
      drawWrap(page3, data.findings, 46, 770, 505, 11, 9, 18);

      drawSectionHeader(page3, "Utility Coordinator confirmation", 520);
      drawText(page3, `Name: ${data.coordinatorConfirmName}`, 46, 496, 9);
      drawText(page3, `Signed: ${data.coordinatorConfirmSigned}`, 230, 496, 9);
      drawText(page3, `Dated: ${data.coordinatorConfirmDate}`, 400, 496, 9);

      drawSectionHeader(page3, "Cancellation", 470);
      drawText(page3, `Signed (Utility Co-ordinator): ${data.cancelSigned}`, 46, 446, 9);
      drawText(page3, `Date/Time: ${data.cancelDateTime}`, 300, 446, 9);

      const outBytes = await pdfDoc.save();
      const blob = new Blob([outBytes], { type:"application/pdf" });
      const url = URL.createObjectURL(blob);
      const filename = `Ground-disturbance-permit_${new Date().toISOString().slice(0,10)}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(()=> URL.revokeObjectURL(url), 2500);
    }

    async function generateExcavationChecksPDF(data){
      if(!window.PDFLib){
        throw new Error("PDF engine is blocked (pdf-lib did not load). If you use a strict Content-Security-Policy, you must allow the CDN or host pdf-lib locally.");
      }

      const { PDFDocument, StandardFonts, rgb } = PDFLib;
      const pdfDoc = await PDFDocument.create();
      const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const BLACK = rgb(0,0,0);
      const RED = rgb(0.78, 0.1, 0.1);
      const HEADER_TEXT = rgb(1,1,1);
      const LIGHT = rgb(0.98, 0.98, 0.98);
      const LIGHT_ROW = rgb(0.95, 0.95, 0.95);

      const page = pdfDoc.addPage([792, 612]);

      const sanitize = (text) => {
        let s = String(text ?? "");
        s = s.replace(/[\u2018\u2019]/g, "'")
             .replace(/[\u201C\u201D]/g, '"')
             .replace(/[\u2010-\u2015\u2212\u00ad]/g, "-")
             .replace(/\u2026/g, "...")
             .replace(/\u00A0/g, " ");
        if (s.normalize) {
          s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
        }
        s = s.replace(/[^\x0A\x0D\x20-\x7E]/g, "");
        return s;
      };

      const drawText = (text, x, y, size=9, font=helv) => {
        const t = sanitize(text);
        if(!t) return;
        page.drawText(t, { x, y, size, font, color: BLACK });
      };

      const drawWrap = (text, x, topY, maxW, lineH=10, size=9, maxLines=2, font=helv) => {
        const t = sanitize(text);
        if(!t) return;
        const parts = t.replace(/\r/g, "").split("\n");
        const lines = [];
        parts.forEach(part => {
          const words = part.split(/\s+/).filter(Boolean);
          if(words.length === 0){ lines.push(""); return; }
          let line = "";
          words.forEach(w => {
            const test = line ? (line + " " + w) : w;
            if(font.widthOfTextAtSize(test, size) <= maxW) line = test;
            else { if(line) lines.push(line); line = w; }
          });
          if(line) lines.push(line);
        });
        let y = topY;
        lines.slice(0, maxLines).forEach(ln => {
          page.drawText(ln, { x, y, size, font, color: BLACK });
          y -= lineH;
        });
      };

      const drawCheck = (x, y, size, checked) => {
        page.drawRectangle({ x, y, width:size, height:size, borderColor: BLACK, borderWidth: 1, color: undefined });
        if(checked){
          page.drawLine({ start:{ x:x+2, y:y+2 }, end:{ x:x+size-2, y:y+size-2 }, thickness:1.2, color: BLACK });
          page.drawLine({ start:{ x:x+2, y:y+size-2 }, end:{ x:x+size-2, y:y+2 }, thickness:1.2, color: BLACK });
        }
      };

      const drawBox = (x, y, w, h, fill=undefined) => {
        page.drawRectangle({ x, y, width:w, height:h, borderColor: BLACK, borderWidth: 1, color: fill });
      };

      const pageH = page.getHeight();
      const fromTop = (top, size=9) => pageH - top - size;

      // Header (colored)
      drawBox(40, fromTop(40, 0), 712, 24, RED);
      drawText("ATL Excavation Inspection", 50, fromTop(36, 10), 10, helvBold, HEADER_TEXT);
      drawText("REPORT OF INSPECTION – Excavation Inspection and Register.", 60, fromTop(80.0, 9), 9, helvBold);
      drawWrap("This inspection report is carried out on behalf of ATL Ltd in accordance with the Construction (Health, Safety and Welfare) Regulations 1996", 60, fromTop(95.0, 8) + 8, 680, 10, 8, 2, helv);

      // Site details
      drawText("Site Address", 60, fromTop(155, 8), 8, helvBold);
      drawText("Site Number", 560, fromTop(155, 8), 8, helvBold);
      drawBox(150, fromTop(165, 10), 390, 16, LIGHT);
      drawBox(640, fromTop(165, 10), 110, 16, LIGHT);
      drawText(data.siteAddress, 156, fromTop(162, 8), 8, helv);
      drawText(data.siteNumber, 646, fromTop(162, 8), 8, helv);

      drawText("Location of Excavation onsite", 60, fromTop(178, 8), 8, helvBold);
      drawBox(250, fromTop(188, 10), 500, 16, LIGHT);
      drawText(data.location, 256, fromTop(185, 8), 8, helv);

      drawText("Name and position of person making report", 60, fromTop(202, 8), 8, helvBold);
      drawText("Name of person receiving report", 440, fromTop(202, 8), 8, helvBold);
      drawBox(300, fromTop(212, 10), 220, 16, LIGHT);
      drawBox(610, fromTop(212, 10), 140, 16, LIGHT);
      drawText(data.reporterName, 306, fromTop(209, 8), 8, helv);
      drawText(data.receiverName, 616, fromTop(209, 8), 8, helv);

      // Register header band
      const headerTop = 235;
      const headerH = 18;
      drawBox(60, fromTop(headerTop + headerH, 0), 692, headerH, LIGHT_ROW);
      drawText("Date", 90, fromTop(headerTop + 4, 8), 8, helvBold);
      drawText("Time", 150, fromTop(headerTop + 4, 8), 8, helvBold);
      drawText("Condition of Excavation (type of Excavation)", 188, fromTop(headerTop + 4, 8), 8, helvBold);
      drawWrap("Details of any action taken as a result of any matter identified", 528, fromTop(headerTop + 4, 8) + 8, 240, 9, 8, 2, helvBold);

      // Safety decision (right-aligned panel)
      drawBox(420, fromTop(220, 0), 210, 18, LIGHT_ROW);
      drawText("Can work be carried out safely", 428, fromTop(216, 8), 8, helvBold);
      drawText("Y", 630, fromTop(216, 8), 8, helvBold);
      drawText("N", 660, fromTop(216, 8), 8, helvBold);
      const ynY = fromTop(216, 8);
      drawCheck(620, ynY - 2, 10, data.canWork === "Yes");
      drawCheck(650, ynY - 2, 10, data.canWork === "No");

      // Register table
      const tableX = 60;
      const tableTop = 260;
      const rows = (data.entries || []).slice(0, 8);
      const rowH = 24;
      const tableW = 692;
      const dateW = 90;
      const timeW = 50;
      const condW = 320;
      const actionW = tableW - dateW - timeW - condW;
      const tableH = rowH * 8;

      drawBox(tableX, fromTop(tableTop + tableH, 0), tableW, tableH, undefined);
      // subtle alternating row fill
      for(let r=0;r<8;r++){
        if(r % 2 === 1){
          drawBox(tableX, fromTop(tableTop + ((r+1) * rowH), 0), tableW, rowH, LIGHT);
        }
      }
      // vertical lines
      const colXs = [tableX + dateW, tableX + dateW + timeW, tableX + dateW + timeW + condW];
      colXs.forEach(x => {
        page.drawLine({ start:{ x, y: fromTop(tableTop + tableH, 0) }, end:{ x, y: fromTop(tableTop, 0) }, thickness:1, color: BLACK });
      });
      // horizontal lines
      for(let r=1;r<8;r++){
        const y = fromTop(tableTop + (r * rowH), 0);
        page.drawLine({ start:{ x: tableX, y }, end:{ x: tableX + tableW, y }, thickness:1, color: BLACK });
      }

      rows.forEach((row, idx) => {
        const top = tableTop + (idx * rowH) + 6;
        const y = fromTop(top, 9);
        drawText(row.date, tableX + 6, y, 8, helv);
        drawText(row.time, tableX + dateW + 6, y, 8, helv);
        drawWrap(row.condition, tableX + dateW + timeW + 6, y + 6, condW - 12, 9, 8, 2, helv);
        drawWrap(row.action, tableX + dateW + timeW + condW + 6, y + 6, actionW - 12, 9, 8, 2, helv);
      });

      drawText("Document Ref: QPFS22.0    August 2024    01", 60, fromTop(545, 8), 8, helv);

      const outBytes = await pdfDoc.save();
      const blob = new Blob([outBytes], { type:"application/pdf" });
      const url = URL.createObjectURL(blob);
      const filename = `Excavation-inspection-checks_${new Date().toISOString().slice(0,10)}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(()=> URL.revokeObjectURL(url), 2500);
    }

    function renderHotWorksPermit(){
      const app = $("#app");
      app.innerHTML = "";

      const state = {
        projectTitle: "",
        projectNo: "",
        siteLocation: "",
        permitNo: "",
        dateISO: todayISO(),
        workDescription: "",
        authorisingPerson: "",
        fireWatcher: "",
        contractorName: "Active Tunnelling"
      };

      const head = el("div",{class:"head"},[
        el("div",{},[
          el("h1",{},["Hot Work Permit"]),
          el("div",{class:"sub"},["Pre-fill the permit details, then download the PDF to be completed by hand on site."])
        ]),
        el("div",{class:"pillRow"},[
          el("span",{id:"pillLib", class:"pill warn"},["PDF engine: checking..."]),
          el("span",{id:"pillTpl", class:"pill warn"},["Assets: checking..."])
        ])
      ]);

      const banner = el("div",{id:"banner", class:"banner"},[""]);

      const sDetails = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["1. Work Details"]),
        el("div",{class:"grid2"},[
          field("Project Title","projectTitle","text","e.g. Sizewell C", state.projectTitle),
          field("Project No","projectNo","text","e.g. 836", state.projectNo),
          field("Site Location","siteLocation","text","e.g. Sizewell", state.siteLocation),
          field("Permit No.","permitNo","text","e.g. HWP-001", state.permitNo),
          field("Date","dateISO","date","", state.dateISO),
          field("Contractor Name","contractorName","text","", state.contractorName),
        ]),
        el("div",{style:"margin-top:12px"},[
          textareaField("Description of work to be carried out","workDescription","What hot work is being carried out?", state.workDescription),
        ])
      ]);

      const sPersonnel = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["2. Personnel"]),
        el("div",{class:"grid2"},[
          field("Authorising Person","authorisingPerson","text","Name of person authorising", state.authorisingPerson),
          field("Fire Watcher","fireWatcher","text","Name of fire watcher", state.fireWatcher),
        ])
      ]);

      const sticky = el("div",{class:"stickyBar"},[
        el("div",{class:"actionBar"},[
          el("div",{class:"btnRow"},[
            el("a",{class:"btn btnYellow", href:"daily.html"},["Back"]),
          ]),
          el("div",{class:"btnRow"},[
            el("button",{id:"btnDownload", class:"btn", type:"button", onclick: async()=> {
              hideBanner();
              await onDownload();
            }},["Download PDF"])
          ])
        ])
      ]);

      app.appendChild(head);
      app.appendChild(banner);
      app.appendChild(sDetails);
      app.appendChild(sPersonnel);
      app.appendChild(sticky);

      checkTemplateAndLib("csp");

      function field(labelText, id, type, placeholder, val = ""){
        return el("div",{},[
          el("label",{for:id},[labelText]),
          el("input",{id, type, placeholder, value: val})
        ]);
      }
      function textareaField(labelText, id, placeholder, val = ""){
        const txt = el("textarea",{id, placeholder});
        txt.value = val;
        return el("div",{},[
          el("label",{for:id},[labelText]),
          txt
        ]);
      }

      async function onDownload(){
        const btn = $("#btnDownload");
        btn.disabled = true;
        btn.textContent = "Generating...";
        try{
          const data = {
            projectTitle: $("#projectTitle").value.trim(),
            projectNo: $("#projectNo").value.trim(),
            siteLocation: $("#siteLocation").value.trim(),
            permitNo: $("#permitNo").value.trim(),
            dateISO: $("#dateISO").value,
            workDescription: $("#workDescription").value.trim(),
            authorisingPerson: $("#authorisingPerson").value.trim(),
            fireWatcher: $("#fireWatcher").value.trim(),
            contractorName: $("#contractorName").value.trim(),
          };
          await generateHotWorksPDF(data);
        }catch(err){
          showBanner(String(err && err.message ? err.message : err), "bad");
        }finally{
          btn.disabled = false;
          btn.textContent = "Download PDF";
        }
      }
    }

    function renderHotWorksPermit(){
      const app = $("#app");
      app.innerHTML = "";

      const state = {
        projectTitle: "",
        projectNo: "",
        siteLocation: "",
        permitNo: "",
        dateISO: todayISO(),
        workDescription: "",
        authorisingPerson: "",
        fireWatcher: "",
        contractorName: "Active Tunnelling"
      };

      const head = el("div",{class:"head"},[
        el("div",{},[
          el("h1",{},["Hot Work Permit"]),
          el("div",{class:"sub"},["Pre-fill the permit details, then download the PDF to be completed by hand on site."])
        ]),
        el("div",{class:"pillRow"},[
          el("span",{id:"pillLib", class:"pill warn"},["PDF engine: checkingΓÇª"]),
          el("span",{id:"pillTpl", class:"pill warn"},["Assets: checkingΓÇª"])
        ])
      ]);

      const banner = el("div",{id:"banner", class:"banner"},[""]);

      const sDetails = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["1. Work Details"]),
        el("div",{class:"grid2"},[
          field("Project Title","projectTitle","text","e.g. Sizewell C", state.projectTitle),
          field("Project No","projectNo","text","e.g. 836", state.projectNo),
          field("Site Location","siteLocation","text","e.g. Sizewell", state.siteLocation),
          field("Permit No.","permitNo","text","e.g. HWP-001", state.permitNo),
          field("Date","dateISO","date","", state.dateISO),
          field("Contractor Name","contractorName","text","", state.contractorName),
        ]),
        el("div",{style:"margin-top:12px"},[
          textareaField("Description of work to be carried out","workDescription","What hot work is being carried out?", state.workDescription),
        ])
      ]);

      const sPersonnel = el("div",{class:"section"},[
        el("div",{class:"sectionTitle"},["2. Personnel"]),
        el("div",{class:"grid2"},[
          field("Authorising Person","authorisingPerson","text","Name of person authorising", state.authorisingPerson),
          field("Fire Watcher","fireWatcher","text","Name of fire watcher", state.fireWatcher),
        ])
      ]);

      const sticky = el("div",{class:"stickyBar"},[
        el("div",{class:"actionBar"},[
          el("div",{class:"btnRow"},[
            el("a",{class:"btn btnYellow", href:"daily.html"},["Back"]),
          ]),
          el("div",{class:"btnRow"},[
            el("button",{id:"btnDownload", class:"btn", type:"button", onclick: async()=> {
              hideBanner();
              await onDownload();
            }},["Download PDF"])
          ])
        ])
      ]);

      app.appendChild(head);
      app.appendChild(banner);
      app.appendChild(sDetails);
      app.appendChild(sPersonnel);
      app.appendChild(sticky);

      checkTemplateAndLib("csp");

      function field(labelText, id, type, placeholder, val = ""){
        return el("div",{},[
          el("label",{for:id},[labelText]),
          el("input",{id, type, placeholder, value: val})
        ]);
      }
      function textareaField(labelText, id, placeholder, val = ""){
        const txt = el("textarea",{id, placeholder});
        txt.value = val;
        return el("div",{},[
          el("label",{for:id},[labelText]),
          txt
        ]);
      }

      async function onDownload(){
        const btn = $("#btnDownload");
        btn.disabled = true;
        btn.textContent = "GeneratingΓÇª";
        try{
          const data = {
            projectTitle: $("#projectTitle").value.trim(),
            projectNo: $("#projectNo").value.trim(),
            siteLocation: $("#siteLocation").value.trim(),
            permitNo: $("#permitNo").value.trim(),
            dateISO: $("#dateISO").value,
            workDescription: $("#workDescription").value.trim(),
            authorisingPerson: $("#authorisingPerson").value.trim(),
            fireWatcher: $("#fireWatcher").value.trim(),
            contractorName: $("#contractorName").value.trim(),
          };
          await generateHotWorksPDF(data);
        }catch(err){
          showBanner(String(err && err.message ? err.message : err), "bad");
        }finally{
          btn.disabled = false;
          btn.textContent = "Download PDF";
        }
      }
    }

    const tLower = t.toLowerCase();
    if(tLower === "daily brief" || tLower === "daily briefing"){
      renderDailyBrief();
    }else if(tLower === "hot work permit" || tLower === "hot works permit"){
      renderHotWorkPermit();
    }else if(tLower === "confined space permit"){
      renderConfinedSpacePermit();
    }else if(
      tLower === "ground disturbance permit" ||
      tLower === "break ground (red)" ||
      tLower === "break ground (blue)"
    ){
      renderGroundDisturbancePermit();
    }else if(
      tLower === "excavation inspection checks" ||
      tLower === "excavation checks"
    ){
      renderExcavationInspectionChecks();
    }else{
      renderPlaceholder(t);
    }

// Wrap PDF generation functions to add lazy-loading and better error handling
function wrapPdfGen(fnName) {
  const orig = typeof window[fnName] === 'function' ? window[fnName] : undefined;
  if (!orig) return;
  const _orig = orig;
  window[fnName] = async function(...args) {
    try {
      await loadPdfLib();
      return await _orig.apply(this, args);
    } catch (err) {
      let msg = err && err.message ? err.message : String(err);
      if (msg.includes('pdf-lib') || msg.includes('PDF engine')) {
        msg += '\nTry refreshing the page or check your network/CSP settings.';
      }
      showBanner('PDF generation failed: ' + msg, 'bad');
      throw err;
    }
  };
}

// Apply lazy-loading wrapper to all PDF generation functions
['generateDailyBriefPDF','generateHotWorkPermitPDF','generateHotWorksPDF','generateConfinedSpacePDF','generateGroundDisturbancePDF','generateExcavationChecksPDF'].forEach(wrapPdfGen);

// === Placeholder for future config-driven (JSON schema) forms ===
// To support extensibility, future forms can be defined as JSON schemas and rendered dynamically.
// Example usage (not implemented):
//   const formSchema = { ... };
//   renderSchemaForm(formSchema, targetElement);
//
// See: https://json-schema.org/ and libraries like react-jsonschema-form for inspiration.
function renderSchemaForm(schema, target) {
  // TODO: Implement dynamic form rendering from JSON schema
  // Example: generate fields, validation, and PDF mapping from schema
  // This is a placeholder for future extensibility.
  console.warn('renderSchemaForm is not yet implemented.', schema, target);
}

window.__toolReady = true;
