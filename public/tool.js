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

const pdfLibUrl = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';

// Lazy-load pdf-lib only when needed
async function loadPdfLib() {
  if (window.PDFLib) return window.PDFLib;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = pdfLibUrl;
    script.onload = () => {
      if (window.PDFLib) resolve(window.PDFLib);
      else reject(new Error('PDF engine failed to load. Please check your internet connection or Content-Security-Policy.'));
    };
    script.onerror = () => reject(new Error('Could not load PDF engine (pdf-lib). Please check your internet connection or Content-Security-Policy.'));
    document.head.appendChild(script);
  });
}

// === Main App Logic ===
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
  }else{
    libPill.className = "pill bad";
    libPill.textContent = "PDF engine: BLOCKED (check connection or CSP)";
  }

  const tryFetch = async (url) => {
    try{
      const res = await fetch(url, { method:"HEAD", cache:"no-store" });
      if (!res.ok) throw new Error('Asset missing: ' + url);
      return true;
    }catch(e){
      showBanner('Asset missing or failed to load: ' + url, 'bad');
      return false;
    }
  };

  let ok = false;
  if(mode === "csp"){
    // For CSP, we now generate programmatically, so we just check the logo
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


// Patch all PDF generation functions to lazy-load pdf-lib
// Example for generateDailyBriefPDF, generateHotWorkPermitPDF, generateHotWorksPDF, generateConfinedSpacePDF

// Wrap the original PDF generation functions to ensure pdf-lib is loaded and errors are user-friendly
function wrapPdfGen(fnName) {
  const orig = typeof window[fnName] === 'function' ? window[fnName] : undefined;
  if (!orig) return;
  window[fnName] = async function(...args) {
    try {
      await loadPdfLib();
      return await orig.apply(this, args);
    } catch (err) {
      let msg = err && err.message ? err.message : String(err);
      if (msg.includes('pdf-lib')) msg += '\nTry refreshing or check your network/CSP.';
      showBanner('PDF generation failed: ' + msg, 'bad');
      throw err;
    }
  };
}
['generateDailyBriefPDF','generateHotWorkPermitPDF','generateHotWorksPDF','generateConfinedSpacePDF'].forEach(wrapPdfGen);

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

if(t.toLowerCase() === "daily brief" || t.toLowerCase() === "daily briefing"){
  renderDailyBrief();
}else if(t.toLowerCase() === "hot work permit" || t.toLowerCase() === "hot works permit"){
  renderHotWorkPermit();
}else{
  renderPlaceholder(t);
}
