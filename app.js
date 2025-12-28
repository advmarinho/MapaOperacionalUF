/* Sonova – Mapa de Lojas
   v7 – Excel + Import CSV enriquecido + Import/Export Cache + Correção manual de localização
   Estratégia de geocoding:
     1) rua/logradouro + número + cidade + UF (sem CEP)
     2) rua/logradouro + número + bairro + cidade + UF (sem CEP)
     3) CEP + cidade + UF (aproximado)
     4) CEP (aproximado)
*/
"use strict";

/* Storage */
const STORAGE_GEO_CACHE_KEY = "sonova_mapa_lojas_geocode_cache_v7";
const STORAGE_VIACEP_KEY = "sonova_mapa_lojas_viacep_cache_v1";
const STORAGE_LAST_COLS = "sonova_mapa_lojas_cols_v3";

/* UI refs */
const SONOVA_BLUE = "#004A99";
const SONOVA_BLUE_2 = "#0A63C6";

const elFile = document.getElementById("fileExcel");
const elSelNome = document.getElementById("selColNome");
const elSelCEP = document.getElementById("selColCEP");
const elSelUF = document.getElementById("selColUF");
const elSelEndereco = document.getElementById("selColEndereco");
const elSelNumero = document.getElementById("selColNumero");
const elSelBairro = document.getElementById("selColBairro");
const elSelComplemento = document.getElementById("selColComplemento");
const elSelHC = document.getElementById("selColHC");

const elBtnMapear = document.getElementById("btnMapear");
const elBtnLimparMapa = document.getElementById("btnLimparMapa");
const elBtnExportCSV = document.getElementById("btnExportCSV");

const elBtnResetCache = document.getElementById("btnResetCache");
const elBtnExportCache = document.getElementById("btnExportCache");

/* Importadores */
const elBtnImportCache = document.getElementById("btnImportCache");
const elInputImportCache = document.getElementById("inputImportCache");
const elBtnImportCSV = document.getElementById("btnImportCSV");
const elInputImportCSV = document.getElementById("inputImportCSV");

const elFiltro = document.getElementById("inpFiltro");
const elGeocoderBase = document.getElementById("inpGeocoderBase");

const elStatus = document.getElementById("lblStatus");
const elContagem = document.getElementById("lblContagem");
const elProgress = document.getElementById("progress");

const elLista = document.getElementById("lista");
const elOriginInfo = document.getElementById("originInfo");
const elHoverInfo = document.getElementById("hoverInfo");

/* Editor (correção manual) */
const elEditNome = document.getElementById("editNome");
const elEditRowId = document.getElementById("editRowId");
const elEditCEP = document.getElementById("editCEP");
const elEditUF = document.getElementById("editUF");
const elEditCidade = document.getElementById("editCidade");
const elEditBairro = document.getElementById("editBairro");
const elEditEndereco = document.getElementById("editEndereco");
const elEditNumero = document.getElementById("editNumero");
const elEditComplemento = document.getElementById("editComplemento");
const elEditHC = document.getElementById("editHC");
const elEditLat = document.getElementById("editLat");
const elEditLon = document.getElementById("editLon");
const elBtnEditTest = document.getElementById("btnEditTest");
const elBtnEditPickMap = document.getElementById("btnEditPickMap");
const elBtnEditSalvar = document.getElementById("btnEditSalvar");
const elBtnEditCancelar = document.getElementById("btnEditCancelar");
const elEditStatus = document.getElementById("editStatus");

const RATE_LIMIT_NOMINATIM_MS = 1100;
const RATE_LIMIT_VIACEP_MS = 250;
const BRAZIL_VIEWBOX = "-74.1,5.5,-34.7,-33.9";

/* Anti-empilhamento visual */
const JITTER_GROUP_DECIMALS = 5;
const JITTER_BASE_METERS = 22;
const JITTER_RING_STEP_METERS = 18;
const JITTER_MAX_METERS = 110;

/* Helpers */
function normalizeHeader(h){ return (h===null||h===undefined) ? "" : String(h).trim(); }
function safeStr(v){ return (v===null||v===undefined) ? "" : String(v).trim(); }
function isCEP(v){ return /\b\d{5}-?\d{3}\b/.test(safeStr(v)); }
function normalizeCEP(v){
  const m = safeStr(v).match(/\b(\d{5})-?(\d{3})\b/);
  return m ? `${m[1]}-${m[2]}` : "";
}
function cepDigits(cep){ const c = normalizeCEP(cep); return c ? c.replace("-","") : ""; }
function cleanNumero(v){
  const s = safeStr(v);
  if (!s) return "";
  const m = s.match(/[0-9][0-9A-Za-z\.\-\/]*/);
  return m ? m[0].replaceAll(",", ".") : "";
}
function toNumberBR(v){
  const s = safeStr(v);
  if (!s) return 0;
  const t = s.replace(/\s/g,"").replace(/\./g,"").replace(",",".");
  const n = Number(t);
  return isFinite(n) ? n : 0;
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function setStatus(a,b){ elStatus.textContent=a||""; elContagem.textContent=b||""; }
function setProgress(p){ elProgress.style.width = `${Math.max(0,Math.min(100,p))}%`; }
function setEditStatus(msg){ elEditStatus.textContent = safeStr(msg); }
function escapeHtml(str){
  return String(str).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function sanitizeAddress(addr){
  let s = safeStr(addr);
  s = s.replace(/\bn[º°]\b/gi,"numero").replace(/\bn\.\b/gi,"numero");
  s = s.replace(/\bloja\b\s*[\w\-\/]+/gi,"").replace(/\bandar\b\s*[\w\-\/]+/gi,"")
       .replace(/\bsala\b\s*[\w\-\/]+/gi,"").replace(/\bconj(?:unto)?\b\s*[\w\-\/]+/gi,"")
       .replace(/\bcj\b\s*[\w\-\/]+/gi,"").replace(/\bbloco\b\s*[\w\-\/]+/gi,"");
  return s.replace(/\s{2,}/g," ").trim();
}

/* Cache */
function loadJsonCache(key){
  try{
    const raw=localStorage.getItem(key);
    if(!raw) return {};
    const obj=JSON.parse(raw);
    return (obj&&typeof obj==="object")?obj:{};
  }catch(e){ return {}; }
}
function saveJsonCache(key,obj){ localStorage.setItem(key, JSON.stringify(obj)); }

/* chave de cache – alinhada com o que já existia */
function makeCacheKey(item){
  const cep = normalizeCEP(item.cep);
  const num = cleanNumero(item.numero);
  const uf = safeStr(item.uf).toUpperCase();
  const end = safeStr(item.endereco).toUpperCase();
  const bairro = safeStr(item.bairro).toUpperCase();
  const city = safeStr(item.cidade).toUpperCase();
  return `${cep}::${num}::${uf}::${city}::${end}::${bairro}`.slice(0,420);
}
function makeCacheKeyFromFields(fields){
  return makeCacheKey({
    cep: fields.cep, numero: fields.numero, uf: fields.uf,
    cidade: fields.cidade, endereco: fields.endereco, bairro: fields.bairro
  });
}

/* Leaflet (mapa clean) */
const map = L.map("map",{ center:[-14.2,-51.9], zoom:4, worldCopyJump:true });
L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  { maxZoom: 19, attribution: "© OpenStreetMap © CARTO" }
).addTo(map);

/* Cluster quadrado Sonova */
const cluster = L.markerClusterGroup({
  showCoverageOnHover:false,
  spiderfyOnMaxZoom:true,
  chunkedLoading:true,
  iconCreateFunction: function(c){
    const count = c.getChildCount();
    const size = count < 10 ? 38 : (count < 100 ? 44 : 50);
    return L.divIcon({
      html: `<div class="sonova-cluster-inner">${count}</div>`,
      className: "sonova-cluster",
      iconSize: [size, size]
    });
  }
});
map.addLayer(cluster);

let markersById = new Map();
let currentData = [];
let originMarker = null;
let hoverLine = null;

/* Editor state */
let editItem = null;
let editPreviewMarker = null;
let editLastGeo = null;
let editPickingMap = false;

/* Pins */
function getHcScale(hc){
  const n = Number(hc);
  if (!isFinite(n) || n <= 0) return 1.0;
  const capped = Math.min(n, 25);
  const scale = 0.95 + (capped / 25) * 0.40; // 0.95..1.35
  return Math.max(0.90, Math.min(1.35, scale));
}
function makePinIcon(fill, scale){
  const color = fill || SONOVA_BLUE;
  const s = Math.round(34 * (scale || 1));
  const anchorX = Math.round(s/2);
  const anchorY = Math.round(s*0.94);
  const popupY = -Math.round(s*0.88);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">
      <circle class="pin-pulse" cx="12" cy="12" r="8" fill="${color}"></circle>
      <path class="pin-core" fill="${color}" d="M12 2c-3.86 0-7 3.14-7 7 0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
    </svg>
  `.trim();

  return L.divIcon({
    className:"sonova-pin",
    html: svg,
    iconSize: [s, s],
    iconAnchor: [anchorX, anchorY],
    popupAnchor: [0, popupY]
  });
}

function clearMap(){
  cluster.clearLayers();
  markersById.clear();
  originMarker = null;
  if (hoverLine){ map.removeLayer(hoverLine); hoverLine=null; }
  elOriginInfo.textContent = "Origem: não definida";
  elHoverInfo.textContent = "Passe o mouse em um marcador";
}

/* Distância */
function haversineKm(lat1, lon1, lat2, lon2){
  const R=6371, toRad=(d)=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function formatKm(km){
  if(!isFinite(km)) return "";
  if(km<10) return `${km.toFixed(2)} km`;
  if(km<100) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/* Geocoding */
function buildNominatimUrlStructured(params){
  const base = safeStr(elGeocoderBase.value) || "https://nominatim.openstreetmap.org/search";
  const qs = new URLSearchParams();
  qs.set("format","json"); qs.set("limit","1"); qs.set("countrycodes","br"); qs.set("addressdetails","0");
  qs.set("viewbox", BRAZIL_VIEWBOX); qs.set("bounded","1");
  Object.keys(params).forEach(k=>{ const v=safeStr(params[k]); if(v) qs.set(k,v); });
  return `${base}?${qs.toString()}`;
}
async function fetchJson(url){
  try{
    const res=await fetch(url,{ method:"GET", headers:{ "Accept":"application/json" } });
    if(!res.ok) return {ok:false,status:res.status,data:null};
    const data=await res.json();
    return {ok:true,status:res.status,data};
  }catch(e){ return {ok:false,status:0,data:null}; }
}
async function geocodeStructured(params){
  const url=buildNominatimUrlStructured(params);
  const r=await fetchJson(url);
  if(!r.ok) return null;
  const data=r.data;
  if(!Array.isArray(data)||data.length===0) return null;
  const lat=Number(data[0].lat), lon=Number(data[0].lon);
  if(!isFinite(lat)||!isFinite(lon)) return null;
  return { lat, lon, q:url };
}
async function viaCepLookup(cep){
  const c=cepDigits(cep);
  if(!c || c.length!==8) return null;
  const cache=loadJsonCache(STORAGE_VIACEP_KEY);
  if(cache[c]) return cache[c];
  const url=`https://viacep.com.br/ws/${c}/json/`;
  try{
    const res=await fetch(url,{ method:"GET", headers:{ "Accept":"application/json" } });
    if(!res.ok) return null;
    const data=await res.json();
    if(!data || data.erro) return null;
    const out={ cep:normalizeCEP(data.cep||cep), uf:safeStr(data.uf), localidade:safeStr(data.localidade), bairro:safeStr(data.bairro), logradouro:safeStr(data.logradouro) };
    cache[c]=out; saveJsonCache(STORAGE_VIACEP_KEY, cache);
    return out;
  }catch(e){ return null; }
}
function buildStreet(logradouro, numero){
  const log=sanitizeAddress(logradouro);
  const num=cleanNumero(numero);
  if(!log && !num) return "";
  if(log && num) return `${log}, ${num}`;
  return log || num;
}
async function geocodeBest(item){
  const cep=normalizeCEP(item.cep);
  const numero=cleanNumero(item.numero);
  const bairroPlan=safeStr(item.bairro);
  const endPlan=safeStr(item.endereco);
  const ufPlan=safeStr(item.uf);

  const via=await viaCepLookup(cep);
  const city=safeStr(item.cidade) || safeStr(via && via.localidade);
  const state=ufPlan || safeStr(via && via.uf);
  const bairro=bairroPlan || safeStr(via && via.bairro);
  const logradouro=endPlan || safeStr(via && via.logradouro);
  const street=buildStreet(logradouro, numero);
  const country="Brazil";

  /* 1) rua+número + cidade + UF (SEM CEP) */
  if(street && city && state){
    const g1=await geocodeStructured({ street, city, state, country });
    if(g1) return { ...g1, mode:"street_num" };
  }

  /* 2) rua+número + bairro + cidade + UF (SEM CEP) */
  if(street && bairro && city && state){
    const g2=await geocodeStructured({ street:`${street} - ${bairro}`, city, state, country });
    if(g2) return { ...g2, mode:"street_num_bairro" };
  }

  /* 3) CEP + cidade + UF (aproximado) */
  if(cep && city && state){
    const g3=await geocodeStructured({ postalcode:cep, city, state, country });
    if(g3) return { ...g3, mode:"postalcode_city_state" };
  }

  /* 4) CEP (aproximado) */
  if(cep){
    const g4=await geocodeStructured({ postalcode:cep, country });
    if(g4) return { ...g4, mode:"postalcode_only" };
  }

  return null;
}

/* Excel */
function sheetToObjects(workbook){
  const sheetName=workbook.SheetNames[0];
  const sheet=workbook.Sheets[sheetName];
  const rows=XLSX.utils.sheet_to_json(sheet,{ defval:"" });
  return rows.map(row=>{ const out={}; Object.keys(row).forEach(k=>out[normalizeHeader(k)]=row[k]); return out; });
}
function detectColumn(headers,names){
  const lower=headers.map(h=>h.toLowerCase());
  for(const n of names){
    const idx=lower.indexOf(n.toLowerCase());
    if(idx>=0) return headers[idx];
  }
  return null;
}
function buildColumnSelect(selectEl, headers, selected){
  if(!selectEl) return;
  selectEl.innerHTML="";
  const optEmpty=document.createElement("option");
  optEmpty.value=""; optEmpty.textContent="(não usar)";
  selectEl.appendChild(optEmpty);
  headers.forEach(h=>{ const opt=document.createElement("option"); opt.value=h; opt.textContent=h; selectEl.appendChild(opt); });
  selectEl.value=selected||"";
}
function inferColumns(headers, sampleRows){
  const colCEP=detectColumn(headers,["cep"]);
  const colUF=detectColumn(headers,["uf","estado"]);
  const colEnd=detectColumn(headers,["logradouro","endereço","endereco","rua","endereco_limpo","endereço_limpo"]);
  const colNome=detectColumn(headers,["id","loja","unidade","nome"]);
  const colNum=detectColumn(headers,["numero","número","num"]);
  const colBairro=detectColumn(headers,["bairro"]);
  const colComp=detectColumn(headers,["complemento","compl","comp"]);
  const colHC=detectColumn(headers,["hc","headcount","qtd","qtd_colab","qtd_colaboradores","colaboradores"]);

  let cepByContent=colCEP;
  if(!cepByContent){
    for(const h of headers){
      const any=sampleRows.slice(0,20).some(r=>isCEP(r[h]));
      if(any){ cepByContent=h; break; }
    }
  }

  let last=null;
  try{ last=JSON.parse(localStorage.getItem(STORAGE_LAST_COLS)||"null"); }catch(e){ last=null; }

  function pick(key, fallback){
    return (last && last[key] && headers.includes(last[key])) ? last[key] : (fallback||"");
  }

  return {
    nome: pick("nome", colNome),
    cep: pick("cep", cepByContent),
    uf: pick("uf", colUF),
    endereco: pick("endereco", colEnd),
    numero: pick("numero", colNum),
    bairro: pick("bairro", colBairro),
    complemento: pick("complemento", colComp),
    hc: pick("hc", colHC)
  };
}
function enableControls(enabled){
  [
    elSelNome, elSelCEP, elSelUF, elSelEndereco, elSelNumero, elSelBairro, elSelComplemento, elSelHC,
    elBtnMapear, elFiltro, elGeocoderBase, elBtnExportCSV
  ].forEach(el=>{ if(el) el.disabled=!enabled; });
}

/* Lista */
function formatHC(hc){
  const n = Number(hc);
  if(!isFinite(n) || n<=0) return "";
  return `HC: ${Math.round(n)}`;
}
function getFilteredData(){
  const filtro=safeStr(elFiltro.value).toLowerCase();
  if(!filtro) return currentData || [];
  return (currentData||[]).filter(it=>{
    const s = `${safeStr(it.nome)} ${safeStr(it.uf)} ${safeStr(it.cidade)} ${safeStr(it.bairro)} ${normalizeCEP(it.cep)} ${cleanNumero(it.numero)} ${safeStr(it.endereco)} ${safeStr(it.complemento)} ${safeStr(it.hc)} ${safeStr(it._mode)}`.toLowerCase();
    return s.includes(filtro);
  });
}
function renderList(data){
  elLista.innerHTML="";
  const max=Math.min(400,data.length);
  for(let i=0;i<max;i++){
    const it=data[i];
    const div=document.createElement("div");
    div.className="item";

    const row=document.createElement("div");
    row.className="item-row";

    const left=document.createElement("div");

    const t=document.createElement("div");
    t.className="item-title";
    const num=cleanNumero(it.numero);
    const hcTxt = formatHC(it.hc);
    const mode = safeStr(it._mode);
    const modeTxt = mode ? ` | ${mode}` : "";
    t.textContent=`${safeStr(it.nome)||"(sem nome)"}  |  ${normalizeCEP(it.cep)}${num ? " | "+num : ""}${hcTxt ? " | "+hcTxt : ""}${modeTxt}`;
    left.appendChild(t);

    const s=document.createElement("div");
    s.className="item-sub";
    const subParts = [];
    if(safeStr(it.uf)) subParts.push(safeStr(it.uf));
    if(safeStr(it.cidade)) subParts.push(safeStr(it.cidade));
    if(safeStr(it.bairro)) subParts.push(safeStr(it.bairro));
    if(safeStr(it.endereco)) subParts.push(safeStr(it.endereco));
    s.textContent = subParts.join("  |  ");
    left.appendChild(s);

    const btn=document.createElement("button");
    btn.type="button";
    btn.className="btn-mini";
    btn.textContent="Corrigir";
    btn.addEventListener("click",(ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      openEditor(it._rowId);
    });

    row.appendChild(left);
    row.appendChild(btn);

    div.appendChild(row);

    div.addEventListener("click",()=>{
      const mk=markersById.get(it._rowId);
      if(mk){ map.setView(mk.getLatLng(), Math.max(12,map.getZoom())); mk.openPopup(); }
    });

    elLista.appendChild(div);
  }
}

/* Popup */
function buildPopupHtml(it){
  const nome=safeStr(it.nome)||"(sem nome)";
  const cep=normalizeCEP(it.cep);
  const uf=safeStr(it.uf);
  const city=safeStr(it.cidade);
  const end=safeStr(it.endereco);
  const num=cleanNumero(it.numero);
  const comp=safeStr(it.complemento);
  const bairro=safeStr(it.bairro);
  const hc = Number(it.hc);

  const lines=[];
  lines.push(`<div style="font-weight:800;color:${SONOVA_BLUE};font-size:14px;margin-bottom:6px;">${escapeHtml(nome)}</div>`);

  const endFull=[end,num].filter(Boolean).join(", ");
  if(endFull) lines.push(`<div style="font-size:12px;margin-bottom:4px;">${escapeHtml(endFull)}</div>`);
  if(bairro) lines.push(`<div style="font-size:12px;color:#111827;margin-bottom:4px;">${escapeHtml(bairro)}</div>`);
  if(comp) lines.push(`<div style="font-size:12px;color:#111827;margin-bottom:4px;">${escapeHtml(comp)}</div>`);

  const meta=[uf,city,cep].filter(Boolean).join(" | ");
  if(meta) lines.push(`<div style="font-size:12px;color:#6b7280;margin-bottom:6px;">${escapeHtml(meta)}</div>`);

  if(isFinite(hc) && hc>0){
    lines.push(`<div style="font-size:12px;color:#111827;margin-top:6px;font-weight:700;">HC: ${Math.round(hc)}</div>`);
  }

  const approx = String(it._mode||"").startsWith("postalcode");
  if(it._mode) lines.push(`<div style="font-size:11px;color:#6b7280;margin-top:6px;">${approx ? "Localização aproximada (CEP)" : "Localização precisa (rua + número)"} | Modo: ${escapeHtml(it._mode)}</div>`);

  lines.push(`<div class="popup-actions"><button type="button" class="btn-mini btn-popup-edit" data-rowid="${it._rowId}">Corrigir</button></div>`);

  return `<div style="max-width:360px;">${lines.join("")}</div>`;
}

/* Jitter visual */
function metersToDegrees(lat, meters){
  const dLat=meters/111320;
  const dLon=meters/(111320*Math.cos(lat*Math.PI/180));
  return { dLat, dLon };
}
function applyVisualJitter(data){
  const groups=new Map();
  for(const it of data){
    const lat=Number(it.lat), lon=Number(it.lon);
    if(!isFinite(lat)||!isFinite(lon)) continue;
    const k=`${lat.toFixed(JITTER_GROUP_DECIMALS)},${lon.toFixed(JITTER_GROUP_DECIMALS)}`;
    if(!groups.has(k)) groups.set(k,[]);
    groups.get(k).push(it);
  }
  for(const items of groups.values()){
    if(items.length<=1){
      const it=items[0];
      it.vlat=Number(it.lat); it.vlon=Number(it.lon);
      continue;
    }
    const lat0=Number(items[0].lat), lon0=Number(items[0].lon);
    const n=items.length, maxPerRing=10;
    for(let i=0;i<n;i++){
      const ring=Math.floor(i/maxPerRing);
      const idx=i%maxPerRing;
      const count=Math.min(maxPerRing, n-ring*maxPerRing);
      let radius=JITTER_BASE_METERS + ring*JITTER_RING_STEP_METERS;
      if(radius>JITTER_MAX_METERS) radius=JITTER_MAX_METERS;
      const angle=(2*Math.PI*idx)/count;
      const { dLat,dLon }=metersToDegrees(lat0,radius);
      items[i].vlat = lat0 + dLat*Math.sin(angle);
      items[i].vlon = lon0 + dLon*Math.cos(angle);
      items[i]._jitter = radius;
    }
  }
}

/* Markers */
function addMarker(it){
  const lat = isFinite(Number(it.vlat)) ? Number(it.vlat) : Number(it.lat);
  const lon = isFinite(Number(it.vlon)) ? Number(it.vlon) : Number(it.lon);
  if(!isFinite(lat)||!isFinite(lon)) return;

  const scale = getHcScale(it.hc);
  const iconDefault = makePinIcon(SONOVA_BLUE, scale);
  const iconOrigin = makePinIcon(SONOVA_BLUE_2, scale);

  const mk=L.marker([lat,lon],{ icon: iconDefault });
  mk.__iconDefault = iconDefault;
  mk.__iconOrigin = iconOrigin;

  mk.bindPopup(buildPopupHtml(it));

  mk.on("popupopen",(ev)=>{
    try{
      const el = ev && ev.popup && ev.popup.getElement ? ev.popup.getElement() : null;
      if(!el) return;
      const btn = el.querySelector(".btn-popup-edit");
      if(btn){
        btn.addEventListener("click",(e)=>{
          e.preventDefault(); e.stopPropagation();
          openEditor(it._rowId);
        });
      }
    }catch(e){ /* noop */ }
  });

  mk.on("click",()=>{
    if(originMarker) originMarker.setIcon(originMarker.__iconDefault || makePinIcon(SONOVA_BLUE, 1));
    originMarker=mk;
    originMarker.setIcon(originMarker.__iconOrigin || makePinIcon(SONOVA_BLUE_2, 1));

    const nome=safeStr(it.nome)||"(sem nome)";
    const cep=normalizeCEP(it.cep);
    const num=cleanNumero(it.numero);
    const hcTxt = formatHC(it.hc);
    elOriginInfo.textContent = `Origem: ${nome} | ${cep}${num ? " | "+num : ""}${hcTxt ? " | "+hcTxt : ""}`;
  });

  mk.on("mouseover",()=>{
    if(!originMarker){
      elHoverInfo.textContent="Passe o mouse em outro marcador após definir a origem (clique em uma loja)";
      return;
    }
    const a = originMarker.__realLatLng || originMarker.getLatLng();
    const bReal = L.latLng(Number(it.lat), Number(it.lon));
    const km = haversineKm(a.lat,a.lng,bReal.lat,bReal.lng);

    const nome=safeStr(it.nome)||"(sem nome)";
    const cep=normalizeCEP(it.cep);
    const num=cleanNumero(it.numero);
    const hcTxt = formatHC(it.hc);

    elHoverInfo.textContent=`Destino: ${nome} | ${cep}${num ? " | "+num : ""}${hcTxt ? " | "+hcTxt : ""} | Distância: ${formatKm(km)}`;

    if(hoverLine){ map.removeLayer(hoverLine); hoverLine=null; }
    hoverLine=L.polyline([originMarker.getLatLng(), L.latLng(lat,lon)],{ weight:2, opacity:0.7, dashArray:"6 6" }).addTo(map);
  });

  mk.on("mouseout",()=>{ if(hoverLine){ map.removeLayer(hoverLine); hoverLine=null; }});

  mk.__realLatLng = L.latLng(Number(it.lat), Number(it.lon));

  cluster.addLayer(mk);
  markersById.set(it._rowId,mk);
}

function updateMarkerFromItem(it){
  const mk = markersById.get(it._rowId);
  if(!mk) return;

  mk.setPopupContent(buildPopupHtml(it));

  const lat = Number(it.lat), lon = Number(it.lon);
  if(isFinite(lat) && isFinite(lon)){
    it.vlat = lat; it.vlon = lon;
    mk.__realLatLng = L.latLng(lat, lon);
    mk.setLatLng([lat, lon]);
  }
}

/* Export CSV */
function toCsvValue(v){ return `"${safeStr(v).replaceAll('"','""')}"`; }
function exportCSV(){
  if(!currentData||currentData.length===0) return;
  const cols=["nome","cep","uf","cidade","bairro","endereco","numero","complemento","hc","lat","lon","_mode","_q"];
  const lines=[cols.join(",")];
  for(const it of currentData){
    lines.push(cols.map(c=>toCsvValue(it[c])).join(","));
  }
  const blob=new Blob([lines.join("\n")],{ type:"text/csv;charset=utf-8" });
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="sonova_lojas_enriquecido.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
function exportCache(){
  const cache=loadJsonCache(STORAGE_GEO_CACHE_KEY);
  const blob=new Blob([JSON.stringify(cache,null,2)],{ type:"application/json;charset=utf-8" });
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download="sonova_geocode_cache.json";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}
function resetCache(){
  localStorage.removeItem(STORAGE_GEO_CACHE_KEY);
  localStorage.removeItem(STORAGE_VIACEP_KEY);
  setStatus("Cache removido","");
}

/* Pipeline: mapear (com geocoding + cache) */
async function mapear(){
  if(!currentData||currentData.length===0){ setStatus("Nenhum dado carregado",""); return; }
  clearMap(); setProgress(0);

  const geoCache=loadJsonCache(STORAGE_GEO_CACHE_KEY);
  const data=getFilteredData();

  renderList(data);
  setStatus("Mapeando",`Registros: ${data.length}`);

  const total=data.length;
  let ok=0, fail=0;

  for(let i=0;i<data.length;i++){
    const it=data[i];
    const key=makeCacheKey(it);

    if(geoCache[key] && isFinite(geoCache[key].lat) && isFinite(geoCache[key].lon)){
      it.lat=geoCache[key].lat; it.lon=geoCache[key].lon;
      it._mode=geoCache[key].mode || "cache";
      it._q=geoCache[key].q || "";
      ok++;
    }else{
      setStatus("Geocoding (rua + número)", `Linha ${i+1}/${total} | OK: ${ok} | Falhas: ${fail}`);
      const geo=await geocodeBest(it);
      if(geo){
        it.lat=geo.lat; it.lon=geo.lon; it._mode=geo.mode; it._q=geo.q;
        geoCache[key]={ lat:geo.lat, lon:geo.lon, mode:geo.mode, q:geo.q, ts:Date.now() };
        saveJsonCache(STORAGE_GEO_CACHE_KEY, geoCache);
        ok++;
      }else{
        it._mode="falha"; it._q="";
        fail++;
      }
      await sleep(RATE_LIMIT_NOMINATIM_MS);
      await sleep(RATE_LIMIT_VIACEP_MS);
    }
    setProgress(((i+1)/total)*100);
  }

  applyVisualJitter(data);

  let plotted=0;
  for(const it of data){
    if(isFinite(Number(it.lat)) && isFinite(Number(it.lon))){ addMarker(it); plotted++; }
  }

  setStatus("Concluído", `Total: ${total} | Marcadas: ${plotted} | Sem coordenadas: ${total-plotted}`);

  if(plotted>0){
    const group=new L.featureGroup(Array.from(markersById.values()));
    const bounds=group.getBounds();
    if(bounds && bounds.isValid && bounds.isValid()) map.fitBounds(bounds.pad(0.12));
    else map.setView([-14.2,-51.9],4);
  }
}

/* Plot sem geocoding (CSV já enriquecido) */
function plotOnly(data){
  clearMap();
  setProgress(100);

  applyVisualJitter(data);

  let plotted=0;
  for(const it of data){
    if(isFinite(Number(it.lat)) && isFinite(Number(it.lon))){ addMarker(it); plotted++; }
  }

  setStatus("Base importada", `Total: ${data.length} | Marcadas: ${plotted} | Sem coordenadas: ${data.length-plotted}`);

  if(plotted>0){
    const group=new L.featureGroup(Array.from(markersById.values()));
    const bounds=group.getBounds();
    if(bounds && bounds.isValid && bounds.isValid()) map.fitBounds(bounds.pad(0.12));
    else map.setView([-14.2,-51.9],4);
  }
}

/* CSV parser (sem libs) */
function parseCSV(text){
  const rows=[];
  let row=[];
  let cur="";
  let inQuotes=false;

  for(let i=0;i<text.length;i++){
    const ch=text[i];
    const next=text[i+1];

    if(inQuotes){
      if(ch === '"' && next === '"'){
        cur += '"';
        i++;
        continue;
      }
      if(ch === '"'){
        inQuotes=false;
        continue;
      }
      cur += ch;
      continue;
    }

    if(ch === '"'){
      inQuotes=true;
      continue;
    }

    if(ch === ","){
      row.push(cur);
      cur="";
      continue;
    }

    if(ch === "\n"){
      row.push(cur);
      cur="";
      const allEmpty = row.every(c=>safeStr(c)==="");
      if(!allEmpty) rows.push(row);
      row=[];
      continue;
    }

    if(ch === "\r"){
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  const allEmpty = row.every(c=>safeStr(c)==="");
  if(!allEmpty) rows.push(row);

  return rows;
}

/* Import CSV enriquecido */
async function importEnrichedCSV(file){
  if(!file) return;

  setStatus("Importando CSV",""); setProgress(0); clearMap(); elLista.innerHTML="";
  const text = await file.text();
  const rows = parseCSV(text);

  if(!rows || rows.length < 2){
    setStatus("CSV inválido","Sem dados");
    return;
  }

  const headers = rows[0].map(h=>normalizeHeader(h));
  const dataRows = rows.slice(1);

  function idxOf(name){
    const n = name.toLowerCase();
    return headers.findIndex(h=>String(h).toLowerCase()===n);
  }

  const iNome = idxOf("nome");
  const iCEP = idxOf("cep");
  const iUF = idxOf("uf");
  const iCidade = idxOf("cidade");
  const iBairro = idxOf("bairro");
  const iEnd = idxOf("endereco");
  const iNum = idxOf("numero");
  const iComp = idxOf("complemento");
  const iHC = idxOf("hc");
  const iLat = idxOf("lat");
  const iLon = idxOf("lon");
  const iMode = idxOf("_mode");
  const iQ = idxOf("_q");

  currentData = dataRows.map((r,idx)=>({
    _rowId: idx+1,
    nome: safeStr(iNome>=0 ? r[iNome] : ""),
    cep: normalizeCEP(iCEP>=0 ? r[iCEP] : ""),
    uf: safeStr(iUF>=0 ? r[iUF] : ""),
    cidade: safeStr(iCidade>=0 ? r[iCidade] : ""),
    bairro: safeStr(iBairro>=0 ? r[iBairro] : ""),
    endereco: safeStr(iEnd>=0 ? r[iEnd] : ""),
    numero: safeStr(iNum>=0 ? r[iNum] : ""),
    complemento: safeStr(iComp>=0 ? r[iComp] : ""),
    hc: toNumberBR(iHC>=0 ? r[iHC] : 0),
    lat: safeStr(iLat>=0 ? r[iLat] : ""),
    lon: safeStr(iLon>=0 ? r[iLon] : ""),
    vlat:"", vlon:"",
    _mode: safeStr(iMode>=0 ? r[iMode] : "import"),
    _q: safeStr(iQ>=0 ? r[iQ] : "")
  }));

  /* atualiza cache com os pontos importados (facilita reuso) */
  const geoCache = loadJsonCache(STORAGE_GEO_CACHE_KEY);
  let saved=0;
  for(const it of currentData){
    const lat=Number(it.lat), lon=Number(it.lon);
    if(!isFinite(lat)||!isFinite(lon)) continue;
    const key = makeCacheKey(it);
    geoCache[key] = { lat, lon, mode: it._mode || "import", q: it._q || "", ts: Date.now() };
    saved++;
  }
  saveJsonCache(STORAGE_GEO_CACHE_KEY, geoCache);

  enableControls(true);
  renderList(getFilteredData());
  plotOnly(getFilteredData());
  setStatus("CSV importado", `Linhas: ${currentData.length} | Cache atualizado: ${saved}`);
}

/* Import cache JSON */
async function importCacheJson(file){
  if(!file) return;
  setStatus("Importando cache",""); setProgress(0);

  try{
    const text = await file.text();
    const incoming = JSON.parse(text);
    if(!incoming || typeof incoming !== "object"){
      setStatus("Cache inválido","JSON não é objeto");
      return;
    }

    const existing = loadJsonCache(STORAGE_GEO_CACHE_KEY);
    let merged=0;
    for(const k of Object.keys(incoming)){
      const v = incoming[k];
      if(v && isFinite(Number(v.lat)) && isFinite(Number(v.lon))){
        existing[k] = v;
        merged++;
      }
    }
    saveJsonCache(STORAGE_GEO_CACHE_KEY, existing);
    setStatus("Cache importado", `Registros mesclados: ${merged}`);
  }catch(e){
    setStatus("Falha ao importar cache","Verifique o JSON");
  }
}

/* Editor */
function clearEditPreview(){
  if(editPreviewMarker){
    try{ map.removeLayer(editPreviewMarker); }catch(e){ /* noop */ }
    editPreviewMarker=null;
  }
  editLastGeo=null;
  editPickingMap=false;
}
function openEditor(rowId){
  const it = (currentData||[]).find(x=>Number(x._rowId)===Number(rowId));
  if(!it){
    setEditStatus("Não foi possível abrir a correção: item não encontrado.");
    return;
  }
  editItem = it;
  clearEditPreview();
  fillEditorFromItem(it);
  setEditStatus("Pronto para corrigir. Você pode testar o geocoding ou definir no mapa.");
  try{
    const card = document.getElementById("cardEditor");
    if(card) card.scrollIntoView({ behavior:"smooth", block:"start" });
  }catch(e){ /* noop */ }
}
function closeEditor(){
  editItem = null;
  clearEditPreview();
  fillEditorEmpty();
  setEditStatus("");
}
function fillEditorEmpty(){
  [
    elEditNome, elEditRowId, elEditCEP, elEditUF, elEditCidade, elEditBairro,
    elEditEndereco, elEditNumero, elEditComplemento, elEditHC, elEditLat, elEditLon
  ].forEach(el=>{ if(el) el.value=""; });
}
function fillEditorFromItem(it){
  elEditNome.value = safeStr(it.nome);
  elEditRowId.value = String(it._rowId);
  elEditCEP.value = normalizeCEP(it.cep);
  elEditUF.value = safeStr(it.uf).toUpperCase();
  elEditCidade.value = safeStr(it.cidade);
  elEditBairro.value = safeStr(it.bairro);
  elEditEndereco.value = safeStr(it.endereco);
  elEditNumero.value = safeStr(it.numero);
  elEditComplemento.value = safeStr(it.complemento);
  elEditHC.value = String(Number(it.hc||0) || 0);

  const lat = isFinite(Number(it.lat)) ? Number(it.lat) : "";
  const lon = isFinite(Number(it.lon)) ? Number(it.lon) : "";
  elEditLat.value = lat!=="" ? String(lat) : "";
  elEditLon.value = lon!=="" ? String(lon) : "";
}
function readEditorFields(){
  return {
    rowId: Number(elEditRowId.value),
    nome: safeStr(elEditNome.value),
    cep: normalizeCEP(elEditCEP.value),
    uf: safeStr(elEditUF.value).toUpperCase(),
    cidade: safeStr(elEditCidade.value),
    bairro: safeStr(elEditBairro.value),
    endereco: safeStr(elEditEndereco.value),
    numero: safeStr(elEditNumero.value),
    complemento: safeStr(elEditComplemento.value),
    hc: toNumberBR(elEditHC.value),
    lat: safeStr(elEditLat.value),
    lon: safeStr(elEditLon.value),
  };
}
function previewPoint(lat, lon){
  clearEditPreview();
  const icon = makePinIcon(SONOVA_BLUE_2, 1.10);
  editPreviewMarker = L.marker([lat,lon],{ icon }).addTo(map);
  map.setView([lat,lon], Math.max(14, map.getZoom()));
}
async function testGeocodeFromEditor(){
  if(!editItem){
    setEditStatus("Selecione uma loja para corrigir (botão Corrigir na lista).");
    return;
  }

  const f = readEditorFields();
  setEditStatus("Testando geocoding...");
  setStatus("Geocoding (teste manual)", `RowId: ${f.rowId}`);

  const temp = {
    cep: f.cep, uf: f.uf, cidade: f.cidade,
    bairro: f.bairro, endereco: f.endereco, numero: f.numero
  };

  const geo = await geocodeBest(temp);
  if(!geo){
    setEditStatus("Não foi possível encontrar coordenadas com esses dados. Ajuste endereço/cidade/UF ou use 'Definir no mapa'.");
    return;
  }

  editLastGeo = { lat: geo.lat, lon: geo.lon, mode: `manual_${geo.mode}`, q: geo.q };
  elEditLat.value = String(geo.lat);
  elEditLon.value = String(geo.lon);
  previewPoint(geo.lat, geo.lon);
  setEditStatus(`Teste OK. Modo: ${editLastGeo.mode}. Se estiver correto, clique em 'Salvar correção'.`);
}
function pickFromMap(){
  if(!editItem){
    setEditStatus("Selecione uma loja para corrigir (botão Corrigir na lista).");
    return;
  }
  if(editPickingMap){
    setEditStatus("Já está aguardando clique no mapa.");
    return;
  }

  editPickingMap = true;
  setEditStatus("Clique no mapa para definir a posição correta.");
  setStatus("Correção manual", "Aguardando clique no mapa");

  map.once("click",(e)=>{
    editPickingMap=false;
    if(!e || !e.latlng) return;

    const lat = Number(e.latlng.lat);
    const lon = Number(e.latlng.lng);
    if(!isFinite(lat) || !isFinite(lon)){
      setEditStatus("Coordenadas inválidas no clique.");
      return;
    }
    editLastGeo = { lat, lon, mode:"manual_map_click", q:"" };
    elEditLat.value = String(lat);
    elEditLon.value = String(lon);
    previewPoint(lat, lon);
    setEditStatus("Posição capturada. Agora clique em 'Salvar correção'.");
  });
}

function saveCorrection(){
  if(!editItem){
    setEditStatus("Selecione uma loja para corrigir (botão Corrigir na lista).");
    return;
  }

  const f = readEditorFields();
  const lat = Number(f.lat);
  const lon = Number(f.lon);

  if(!isFinite(lat) || !isFinite(lon)){
    setEditStatus("Latitude/Longitude inválidas. Use 'Testar geocoding' ou 'Definir no mapa'.");
    return;
  }

  const geoCache = loadJsonCache(STORAGE_GEO_CACHE_KEY);

  const oldKey = makeCacheKey(editItem);

  /* atualiza item */
  editItem.nome = f.nome || editItem.nome;
  editItem.cep = f.cep;
  editItem.uf = f.uf;
  editItem.cidade = f.cidade;
  editItem.bairro = f.bairro;
  editItem.endereco = f.endereco;
  editItem.numero = f.numero;
  editItem.complemento = f.complemento;
  editItem.hc = f.hc;

  editItem.lat = lat;
  editItem.lon = lon;

  const mode = (editLastGeo && editLastGeo.mode) ? editLastGeo.mode : "manual";
  const q = (editLastGeo && editLastGeo.q) ? editLastGeo.q : "";
  editItem._mode = mode;
  editItem._q = q;

  const newKey = makeCacheKey(editItem);

  /* grava no cache tanto a chave antiga quanto a nova para "corrigir" mesmo que a planilha volte com os dados antigos */
  const payload = { lat, lon, mode, q, ts: Date.now() };
  geoCache[newKey] = payload;
  geoCache[oldKey] = payload;
  saveJsonCache(STORAGE_GEO_CACHE_KEY, geoCache);

  /* atualiza marcador */
  updateMarkerFromItem(editItem);
  renderList(getFilteredData());

  clearEditPreview();
  setEditStatus("Correção salva no cache. Se você exportar o cache, essa correção pode ser reutilizada em outro PC.");
  setStatus("Correção salva", `RowId: ${editItem._rowId}`);
}

/* Load Excel */
elFile.addEventListener("change", async ()=>{
  const file = elFile.files && elFile.files[0];
  if(!file){ setStatus("Aguardando arquivo",""); enableControls(false); return; }

  setStatus("Lendo Excel",""); setProgress(0); clearMap(); elLista.innerHTML="";
  const arrayBuffer=await file.arrayBuffer();
  const workbook=XLSX.read(arrayBuffer,{ type:"array" });
  const rows=sheetToObjects(workbook);
  if(!rows||rows.length===0){ setStatus("Excel vazio ou inválido",""); enableControls(false); return; }

  const headers=Object.keys(rows[0]).map(normalizeHeader).filter(Boolean);
  const selected=inferColumns(headers, rows);

  buildColumnSelect(elSelNome, headers, selected.nome);
  buildColumnSelect(elSelCEP, headers, selected.cep);
  buildColumnSelect(elSelUF, headers, selected.uf);
  buildColumnSelect(elSelEndereco, headers, selected.endereco);
  buildColumnSelect(elSelNumero, headers, selected.numero);
  buildColumnSelect(elSelBairro, headers, selected.bairro);
  buildColumnSelect(elSelComplemento, headers, selected.complemento);
  buildColumnSelect(elSelHC, headers, selected.hc);

  enableControls(true);

  currentData = rows.map((r,idx)=>({
    _rowId: idx+1,
    nome: safeStr(selected.nome ? r[selected.nome] : ""),
    cep: normalizeCEP(selected.cep ? r[selected.cep] : ""),
    uf: safeStr(selected.uf ? r[selected.uf] : ""),
    endereco: safeStr(selected.endereco ? r[selected.endereco] : ""),
    numero: safeStr(selected.numero ? r[selected.numero] : ""),
    bairro: safeStr(selected.bairro ? r[selected.bairro] : ""),
    complemento: safeStr(selected.complemento ? r[selected.complemento] : ""),
    hc: selected.hc ? toNumberBR(r[selected.hc]) : 0,
    cidade: safeStr(r["CIDADE"] || r["Cidade"] || r["city"] || ""),
    lat:"", lon:"", vlat:"", vlon:"",
    _mode:"", _q:""
  }));

  setStatus("Arquivo carregado", `Linhas: ${currentData.length}`);

  localStorage.setItem(STORAGE_LAST_COLS, JSON.stringify({
    nome: elSelNome.value, cep: elSelCEP.value, uf: elSelUF.value, endereco: elSelEndereco.value,
    numero: elSelNumero.value, bairro: elSelBairro.value, complemento: elSelComplemento.value, hc: elSelHC.value
  }));

  renderList(getFilteredData());
});

function rebuildSelection(){
  localStorage.setItem(STORAGE_LAST_COLS, JSON.stringify({
    nome: elSelNome.value, cep: elSelCEP.value, uf: elSelUF.value, endereco: elSelEndereco.value,
    numero: elSelNumero.value, bairro: elSelBairro.value, complemento: elSelComplemento.value, hc: elSelHC.value
  }));
}
[elSelNome, elSelCEP, elSelUF, elSelEndereco, elSelNumero, elSelBairro, elSelComplemento, elSelHC].forEach(el=>{
  if(el) el.addEventListener("change", rebuildSelection);
});

/* Buttons */
elBtnMapear.addEventListener("click", async()=>{ await mapear(); });
elBtnLimparMapa.addEventListener("click", ()=>{ clearMap(); setStatus("Mapa limpo",""); setProgress(0); });
elBtnExportCSV.addEventListener("click", exportCSV);
elBtnResetCache.addEventListener("click", resetCache);
elBtnExportCache.addEventListener("click", exportCache);

/* Import buttons */
if(elBtnImportCache && elInputImportCache){
  elBtnImportCache.addEventListener("click", ()=>{ elInputImportCache.click(); });
  elInputImportCache.addEventListener("change", async ()=>{
    const file = elInputImportCache.files && elInputImportCache.files[0];
    if(!file) return;
    await importCacheJson(file);
    elInputImportCache.value="";
  });
}
if(elBtnImportCSV && elInputImportCSV){
  elBtnImportCSV.addEventListener("click", ()=>{ elInputImportCSV.click(); });
  elInputImportCSV.addEventListener("change", async ()=>{
    const file = elInputImportCSV.files && elInputImportCSV.files[0];
    if(!file) return;
    await importEnrichedCSV(file);
    elInputImportCSV.value="";
  });
}

/* Editor buttons */
if(elBtnEditTest) elBtnEditTest.addEventListener("click", async ()=>{ await testGeocodeFromEditor(); });
if(elBtnEditPickMap) elBtnEditPickMap.addEventListener("click", pickFromMap);
if(elBtnEditSalvar) elBtnEditSalvar.addEventListener("click", saveCorrection);
if(elBtnEditCancelar) elBtnEditCancelar.addEventListener("click", closeEditor);

/* Filtro (atualiza lista, não refaz mapa) */
elFiltro.addEventListener("input", ()=>{
  renderList(getFilteredData());
});

setStatus("Aguardando arquivo","");
fillEditorEmpty();

/* Expor função para debug no console */
window.openEditor = openEditor;
