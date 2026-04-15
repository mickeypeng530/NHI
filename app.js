/* ===== NHI Quick Reference App ===== */

let featuredData = [];   // curated common list
let fullData = [];       // all NHI items
let fuseInstance = null;
let fullFuseInstance = null;
let fullLoaded = false;
let fullLoading = false;

let currentTab = 'all';
let currentQuery = '';
let isFullSearch = false;

// ===== Load Data =====
async function loadData() {
  try {
    const [diagRes, drugRes, procRes] = await Promise.all([
      fetch('data/diagnoses.json'),
      fetch('data/drugs.json'),
      fetch('data/procedures.json'),
    ]);
    const [diags, drugs, procs] = await Promise.all([
      diagRes.json(), drugRes.json(), procRes.json()
    ]);
    featuredData = [...diags, ...drugs, ...procs];
    initFuse(featuredData, true);
    render();
    updateTabCounts();
  } catch (e) {
    document.getElementById('cards').innerHTML =
      `<div class="no-results"><div class="icon">⚠️</div><p>無法載入資料：${e.message}</p></div>`;
  }
}

async function loadFullData() {
  if (fullLoaded || fullLoading) return;
  fullLoading = true;
  const btn = document.getElementById('full-search-btn');
  btn.textContent = '載入中...';
  btn.disabled = true;

  try {
    const [drugRes, procRes] = await Promise.all([
      fetch('data/all_drugs.json'),
      fetch('data/all_procedures.json'),
    ]);
    const [drugs, procs] = await Promise.all([drugRes.json(), procRes.json()]);

    // Get curated diagnoses
    const diags = featuredData.filter(d => d.type === 'diagnosis');
    fullData = [...diags, ...drugs, ...procs];
    initFuse(fullData, false);
    fullLoaded = true;
    fullLoading = false;
    isFullSearch = true;
    btn.textContent = '完整搜尋 ✓';
    btn.classList.add('active');
    btn.disabled = false;
    render();
    updateTabCounts();
  } catch (e) {
    fullLoading = false;
    btn.textContent = '完整搜尋';
    btn.disabled = false;
    alert('載入失敗：' + e.message);
  }
}

// ===== Fuse.js Setup =====
function initFuse(data, isFeatured) {
  const instance = new Fuse(data, {
    keys: [
      { name: 'name_zh',    weight: 0.35 },
      { name: 'name_en',    weight: 0.25 },
      { name: 'brand',      weight: 0.30 },
      { name: 'nhi_code',   weight: 0.30 },
      { name: 'ingredient', weight: 0.15 },
      { name: 'icd10_codes.code', weight: 0.25 },
      { name: 'icd10_codes.eng',  weight: 0.10 },
    ],
    threshold: 0.35,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 1,
  });
  if (isFeatured) fuseInstance = instance;
  else fullFuseInstance = instance;
}

// ===== Get active data and fuse =====
function getActiveData()  { return isFullSearch ? fullData : featuredData; }
function getActiveFuse()  { return isFullSearch ? fullFuseInstance : fuseInstance; }

// ===== Search =====
function getFilteredData() {
  const fuse = getActiveFuse();
  let results = currentQuery.trim()
    ? fuse.search(currentQuery).map(r => r.item)
    : [...getActiveData()];

  if (currentTab !== 'all') {
    results = results.filter(d => d.type === currentTab);
  }
  return results;
}

// ===== Render =====
function render() {
  const data = getFilteredData();
  const container = document.getElementById('cards');
  const info = document.getElementById('results-info');
  const total = getActiveData().length;
  const mode = isFullSearch ? '（完整資料庫）' : '（常用清單）';

  info.textContent = currentQuery
    ? `找到 ${data.length} 筆符合「${currentQuery}」的結果 ${mode}`
    : `共 ${data.length} 筆 ${mode}`;

  if (data.length === 0) {
    container.innerHTML = `<div class="no-results"><div class="icon">🔍</div><p>找不到相關資料</p>${!isFullSearch ? '<p style="margin-top:8px;font-size:0.85rem">試試開啟「完整搜尋」搜尋全部健保碼</p>' : ''}</div>`;
    return;
  }

  container.innerHTML = data.map(item => renderCard(item)).join('');

  container.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => copyText(btn, btn.dataset.copy));
  });
  container.querySelectorAll('.icd-chip').forEach(chip => {
    chip.addEventListener('click', () => copyText(chip, chip.dataset.copy));
  });
  container.querySelectorAll('.payment-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.payment-section');
      section.classList.toggle('open');
    });
  });
}

// ===== Card Templates =====
function renderCard(item) {
  if (item.type === 'diagnosis') return renderDiagCard(item);
  if (item.type === 'drug')      return renderDrugCard(item);
  if (item.type === 'procedure') return renderProcCard(item);
  return '';
}

function renderDiagCard(d) {
  const codes = (d.icd10_codes || []).slice(0, 12);
  const chips = codes.map(c =>
    `<span class="icd-chip" data-copy="${c.code}" title="${c.eng}">
      ${c.code}
      ${c.cht ? `<span class="icd-chip-desc">${c.cht}</span>` : ''}
    </span>`
  ).join('');

  return `
<div class="card">
  <div class="card-header">
    <div class="type-dot diagnosis"></div>
    <div class="card-title-area">
      <div class="card-name-zh">${d.name_zh}</div>
      <div class="card-name-en">${d.name_en}</div>
      <div class="badge-row"><span class="badge badge-diag">診斷</span></div>
    </div>
  </div>
  <div class="card-body">
    <div class="info-row" style="margin-bottom:8px">
      <span class="info-label">ICD-10</span>
      <div class="icd-chips">${chips}</div>
    </div>
    <div style="font-size:0.72rem;color:var(--text-muted)">點擊代碼可複製</div>
  </div>
</div>`;
}

function renderDrugCard(d) {
  const selfPay = d.self_pay;
  const priceHtml = selfPay
    ? `<span class="badge badge-self">自費</span>`
    : `<span class="price-tag">NT$ ${d.price != null ? d.price.toLocaleString() : '—'}</span>`;

  const codeRow = d.nhi_code
    ? `<div class="info-row">
        <span class="info-label">健保碼</span>
        <span class="info-value">
          <code style="font-size:0.85rem">${d.nhi_code}</code>
          <button class="copy-btn" data-copy="${d.nhi_code}">複製</button>
        </span>
       </div>` : '';

  const paySection = d.payment_text
    ? `<div class="payment-section">
        <button class="payment-toggle">給付規定 <span class="toggle-arrow">▼</span></button>
        <div class="payment-text">${escHtml(d.payment_text)}</div>
       </div>` : '';

  const brandDisplay = d.brand
    ? `${d.brand}${d.name_zh && d.name_zh !== d.brand ? ` <span style="font-weight:400;font-size:0.85rem">(${d.name_zh})</span>` : ''}`
    : d.name_zh;

  return `
<div class="card">
  <div class="card-header">
    <div class="type-dot drug"></div>
    <div class="card-title-area">
      <div class="card-name-zh">${brandDisplay}</div>
      <div class="card-name-en">${d.ingredient || d.name_en}</div>
      <div class="badge-row">
        <span class="badge badge-drug">藥物</span>
        ${selfPay ? '<span class="badge badge-self">自費</span>' : ''}
        ${d.form ? `<span class="badge badge-cat">${d.form}</span>` : ''}
      </div>
    </div>
  </div>
  <div class="card-body">
    <div class="info-rows">
      ${codeRow}
      <div class="info-row">
        <span class="info-label">支付價</span>
        <span class="info-value">${priceHtml}</span>
      </div>
    </div>
    ${paySection}
  </div>
</div>`;
}

function renderProcCard(p) {
  const ppfAmt = p.ppf != null ? p.ppf : (p.points > 0 ? Math.round(p.points * 0.4) : null);
  const nthDot = (p.points > 0 || ppfAmt)
    ? `${p.points > 0 ? `<span class="points-tag">${p.points.toLocaleString()} 點</span>` : ''}
       ${ppfAmt ? `<span style="font-size:0.9rem;font-weight:700;color:#c55800">PPF NT$${ppfAmt.toLocaleString()}</span>` : ''}`
    : '<span style="color:var(--text-muted)">—</span>';

  const paySection = p.payment_text
    ? `<div class="payment-section">
        <button class="payment-toggle">給付規定 <span class="toggle-arrow">▼</span></button>
        <div class="payment-text">${escHtml(p.payment_text)}</div>
       </div>` : '';

  return `
<div class="card">
  <div class="card-header">
    <div class="type-dot procedure"></div>
    <div class="card-title-area">
      <div class="card-name-zh">${p.name_zh}</div>
      <div class="card-name-en">${p.name_en}</div>
      <div class="badge-row">
        <span class="badge badge-proc">處置</span>
        ${p.category ? `<span class="badge badge-cat">${p.category}</span>` : ''}
      </div>
    </div>
  </div>
  <div class="card-body">
    <div class="info-rows">
      <div class="info-row">
        <span class="info-label">健保碼</span>
        <span class="info-value">
          <code style="font-size:0.85rem">${p.nhi_code}</code>
          ${p.nhi_code !== '未列項目' ? `<button class="copy-btn" data-copy="${p.nhi_code}">複製</button>` : ''}
        </span>
      </div>
      <div class="info-row">
        <span class="info-label">點數</span>
        <span class="info-value">${nthDot}</span>
      </div>
    </div>
    ${paySection}
  </div>
</div>`;
}

// ===== Helpers =====
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function copyText(el, text) {
  navigator.clipboard.writeText(text).then(() => {
    el.classList.add('copied');
    const orig = el.textContent;
    el.textContent = '已複製';
    setTimeout(() => { el.classList.remove('copied'); el.textContent = orig; }, 1500);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1500);
  });
}

function updateTabCounts() {
  const data = getActiveData();
  const counts = { all: data.length, diagnosis: 0, drug: 0, procedure: 0 };
  data.forEach(d => { if (counts[d.type] != null) counts[d.type]++; });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tab = btn.dataset.tab;
    const countEl = btn.querySelector('.count');
    if (countEl && counts[tab] != null) countEl.textContent = counts[tab].toLocaleString();
  });
}

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search');
  const clearBtn    = document.getElementById('clear-search');
  const fullBtn     = document.getElementById('full-search-btn');

  searchInput.addEventListener('input', e => {
    currentQuery = e.target.value;
    render();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    currentQuery = '';
    render();
    searchInput.focus();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      render();
    });
  });

  fullBtn.addEventListener('click', () => {
    if (!fullLoaded) {
      loadFullData();
    } else {
      isFullSearch = !isFullSearch;
      fullBtn.textContent = isFullSearch ? '完整搜尋 ✓' : '常用清單';
      fullBtn.classList.toggle('active', isFullSearch);
      render();
      updateTabCounts();
    }
  });

  // Dark mode toggle
  const themeBtn = document.getElementById('theme-btn');
  const applyTheme = (dark) => {
    if (dark) {
      document.documentElement.setAttribute('data-dark', '1');
    } else {
      document.documentElement.removeAttribute('data-dark');
    }
    themeBtn.textContent = dark ? '☀️' : '🌙';
  };
  applyTheme(localStorage.getItem('dark') === '1');
  themeBtn.addEventListener('click', () => {
    const dark = !document.documentElement.hasAttribute('data-dark');
    localStorage.setItem('dark', dark ? '1' : '0');
    applyTheme(dark);
  });

  loadData();
});
