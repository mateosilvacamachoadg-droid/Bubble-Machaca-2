/* Bubble — la app
   Modos:
   - servidor: subido a Netlify. Usuarios y clave de Gemini viven en el servidor (seguro).
   - local: abierto sin servidor. Usuarios y clave se guardan solo en este dispositivo. */
'use strict';

// ---------------------------------------------------------------- utilidades
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const PLAYLIST = '2CMThLvKBp0bmwBCC1ETNo';
const PALETA = ['#0E8F7E', '#7A5CFA', '#E5487A', '#E8930C', '#2B87D1', '#3FA35B', '#B04FCF', '#8A6D3B'];
const COLORES_PERSONA = ['#0E8F7E', '#7A5CFA', '#E5487A', '#E8930C', '#2B87D1', '#3FA35B', '#B04FCF', '#D9534F'];

function lee(k, d) { try { const v = localStorage.getItem('bubble:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function guarda(k, v) { try { localStorage.setItem('bubble:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function borra(k) { try { localStorage.removeItem('bubble:' + k); } catch (e) {} }
function escapa(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const num = (n, d = 0) => Number(n).toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: 0 });
let toastT;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('ver');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('ver'), ms);
}
function inicial(n) { return (n || '?').trim().charAt(0).toUpperCase(); }
function avatarHTML(p, chico) { return `<span class="avatar${chico ? ' chico' : ''}" style="--c:${escapa(p.c || '#0E8F7E')}" aria-hidden="true">${escapa(inicial(p.n))}</span>`; }
async function hash(txt) {
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bubble|' + txt));
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
  } catch (e) { let h = 2166136261; for (const ch of 'bubble|' + txt) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return 'f' + (h >>> 0).toString(16); }
}
const sinAcentos = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9.-]/g, '');
const nombreBonito = t => { t = String(t || '').trim(); return t.charAt(0).toLocaleUpperCase('es') + t.slice(1); };
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

// ---------------------------------------------------------------- estado
const S = {
  modo: 'local',       // 'servidor' | 'local'
  equipo: 'Machaca',
  ia: false,
  usuarios: [],        // [{u, n, c}]
  yo: null,            // {u, n, c, token}
  elegido: null
};
const pref = () => `${S.modo}:${S.yo ? S.yo.u : '_'}:`;
const leeU = (k, d) => lee(pref() + k, d);
const guardaU = (k, v) => guarda(pref() + k, v);

const AJ_DEF = { voz: 'cuando', despertar: false, cara: 'cielo', tema: 'auto', ciudad: 'Monterrey', escucha: 'grabar', conversacion: false };
const ajustes = () => Object.assign({}, AJ_DEF, leeU('ajustes', {}));
const guardaAjustes = a => guardaU('ajustes', a);

// ---------------------------------------------------------------- carátulas (reloj + Bubble)
const burbujas = {};
function montaCara(id) {
  const cara = document.getElementById(id);
  cara.prepend(document.getElementById('t-cara').content.cloneNode(true));
  const canvas = $('.cara-burbuja canvas', cara);
  return new Burbuja(canvas);
}
function horaTexto(d = new Date()) {
  let h = d.getHours() % 12; if (h === 0) h = 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function saludoHora() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches';
}
function tic() {
  const t = horaTexto();
  $$('.reloj').forEach(r => { if (r.textContent !== t) r.textContent = t; });
  if (S.yo) {
    $('#saludo').textContent = `${saludoHora()}, ${S.yo.n}`;
    const f = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#fecha').textContent = f.charAt(0).toUpperCase() + f.slice(1);
  }
}
function aplicaApariencia() {
  const a = S.yo ? ajustes() : AJ_DEF;
  document.body.dataset.cara = a.cara;
  if (a.tema === 'claro') document.documentElement.dataset.tema = 'claro';
  else if (a.tema === 'oscuro') document.documentElement.dataset.tema = 'oscuro';
  else delete document.documentElement.dataset.tema;
}

// ---------------------------------------------------------------- arranque
async function arranca() {
  burbujas.entrar = montaCara('cara-entrar');
  burbujas.inicio = montaCara('cara-inicio');
  burbujas.chat = new Burbuja($('#burbuja-chat canvas'));
  burbujas.icono = new Burbuja($('#icono-burbuja'), { ojos: true });
  tic(); setInterval(tic, 1000);
  aplicaApariencia();

  // ¿Hay servidor?
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch('api/estado', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(to);
    const d = r.ok ? await r.json() : null;
    if (d && d.ok) {
      S.modo = 'servidor'; S.equipo = d.equipo || 'Machaca'; S.ia = !!d.ia; S.usuarios = d.usuarios || []; S.compartido = !!d.compartido;
    }
  } catch (e) { /* sin servidor */ }

  if (S.modo === 'local') {
    const conf = lee('local:config', null);
    if (conf) { S.equipo = conf.equipo || 'Machaca'; S.usuarios = conf.personas.map(({ u, n, c }) => ({ u, n, c })); S.ia = !!conf.clave; }
  }
  $$('.cara-equipo').forEach(e => e.textContent = `La IA del equipo ${S.equipo}`);
  document.title = 'Bubble';

  const ses = lee('sesion', null);
  if (ses && ses.modo === S.modo && S.usuarios.some(u => u.u === ses.u)) {
    S.yo = ses; entraInicio();
  } else {
    muestraEntrar();
  }
  registraSW();
}

// ---------------------------------------------------------------- entrar
function muestraEntrar() {
  $('#inicio').hidden = true; $('#entrar').hidden = false;
  S.yo = null; aplicaApariencia();
  const local = S.modo === 'local';
  const sinConfig = local && !lee('local:config', null);
  $('#panel-preparar').hidden = !sinConfig;
  $('#panel-perfiles').hidden = sinConfig;
  if (sinConfig) { preparaLocal(); return; }
  const cont = $('#perfiles'); cont.innerHTML = '';
  const muchos = S.usuarios.length > 8;
  cont.classList.toggle('muchos', muchos);
  const buscar = $('#buscar-perfil');
  buscar.hidden = !muchos; buscar.value = '';
  if (!S.usuarios.length) {
    cont.innerHTML = `<p class="nota">Todavía no hay personas. En Netlify, agrega la variable <b>USUARIOS</b> (ejemplo: <code>mateo:1234, ana:2580</code>) y vuelve a publicar.</p>`;
  }
  S.usuarios.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'perfil'; b.setAttribute('aria-pressed', 'false');
    b.dataset.busca = sinAcentos(p.n) + ' ' + p.u; b.dataset.u = p.u;
    b.innerHTML = `${avatarHTML(p)}<span>${escapa(p.n)}</span>`;
    b.onclick = () => eligePerfil(p, b);
    cont.appendChild(b);
  });
  if (local) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'perfil';
    b.innerHTML = `<span class="avatar" style="--c:#8E8E93" aria-hidden="true">+</span><span>Editar</span>`;
    b.onclick = () => { $('#panel-perfiles').hidden = true; $('#panel-preparar').hidden = false; preparaLocal(lee('local:config', null)); };
    cont.appendChild(b);
  }
  $('#form-clave').hidden = true; $('#aviso-entrar').textContent = '';
  burbujas.entrar.estado('reposo');
}
// Con muchas cuentas: buscar por nombre o escribir el usuario
$('#buscar-perfil').addEventListener('input', e => {
  const q = sinAcentos(e.target.value);
  let visibles = 0;
  $$('#perfiles .perfil[data-busca]').forEach(b => { const ver = !q || b.dataset.busca.includes(q); b.hidden = !ver; if (ver) visibles++; });
  $('#perfiles .sin-resultados')?.remove();
  if (!visibles) $('#perfiles').insertAdjacentHTML('beforeend', '<p class="sin-resultados">No hay nadie con ese nombre.</p>');
});
$('#buscar-perfil').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = sinAcentos(e.target.value);
  const visibles = $$('#perfiles .perfil[data-busca]').filter(b => !b.hidden);
  const exacto = S.usuarios.find(u => u.u === q);
  if (exacto) { const b = visibles.find(x => x.dataset.u === exacto.u); eligePerfil(exacto, b); }
  else if (visibles.length === 1) visibles[0].click();
});
function eligePerfil(p, boton) {
  S.elegido = p;
  $$('#perfiles .perfil').forEach(b => b.setAttribute('aria-pressed', String(b === boton)));
  $('#form-clave').hidden = false;
  $('#usuario-oculto').value = p.u;
  $('#clave').value = ''; $('#clave').placeholder = `Contraseña de ${p.n}`;
  $('#aviso-entrar').textContent = '';
  $('#clave').focus();
  burbujas.entrar.estado('escucha');
}
$('#form-clave').addEventListener('submit', async e => {
  e.preventDefault();
  const p = S.elegido; const clave = $('#clave').value.trim();
  if (!p || !clave) return;
  const aviso = $('#aviso-entrar'); aviso.textContent = '';
  burbujas.entrar.estado('piensa');
  try {
    if (S.modo === 'servidor') {
      const r = await fetch('api/entrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ u: p.u, p: clave }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        burbujas.entrar.estado('reposo');
        aviso.textContent = d.error === 'espera' ? `Demasiados intentos. Espera ${d.segundos} segundos.` : 'Esa contraseña no es. Inténtalo otra vez.';
        $('#clave').select(); return;
      }
      S.yo = { u: d.u, n: d.n, c: d.c, token: d.token, modo: 'servidor' };
    } else {
      const conf = lee('local:config', { personas: [] });
      const per = conf.personas.find(x => x.u === p.u);
      if (!per || per.h !== await hash(p.u + ':' + clave)) {
        burbujas.entrar.estado('reposo'); aviso.textContent = 'Esa contraseña no es. Inténtalo otra vez.'; $('#clave').select(); return;
      }
      S.yo = { u: per.u, n: per.n, c: per.c, token: null, modo: 'local' };
    }
    guarda('sesion', S.yo);
    burbujas.entrar.estado('feliz');
    setTimeout(entraInicio, 350);
  } catch (err) {
    burbujas.entrar.estado('reposo');
    aviso.textContent = 'No hay conexión con el servidor. Revisa tu internet.';
  }
});

// Modo local: preparar personas en este dispositivo
function preparaLocal(conf) {
  const cont = $('#prep-personas'); cont.innerHTML = '';
  $('#prep-equipo').value = conf?.equipo || 'Machaca';
  $('#prep-clave').value = conf?.clave || '';
  const filas = conf?.personas?.length ? conf.personas.map(p => ({ u: p.u, p: '', guardada: true })) : [{ u: '', p: '' }];
  filas.forEach(f => filaPersona(f));
}
function filaPersona(f = { u: '', p: '' }) {
  const d = document.createElement('div');
  d.className = 'fila';
  d.innerHTML = `<input type="text" class="pp-u" placeholder="usuario (ej. mateo)" maxlength="12" value="${escapa(f.u)}" style="flex:1 1 140px" autocapitalize="none" autocomplete="off">
    <input type="password" class="pp-p" placeholder="${f.guardada ? 'igual que antes' : 'contraseña (ej. 1234)'}" maxlength="12" style="flex:1 1 140px" autocomplete="new-password">
    <button type="button" class="btn btn-icono" aria-label="Quitar">×</button>`;
  d.querySelector('button').onclick = () => d.remove();
  $('#prep-personas').appendChild(d);
}
$('#prep-mas').onclick = () => filaPersona();
$('#prep-listo').onclick = async () => {
  const aviso = $('#aviso-preparar'); aviso.textContent = '';
  const anterior = lee('local:config', { personas: [] });
  const personas = [];
  let i = 0;
  for (const fila of $$('#prep-personas .fila')) {
    const crudo = fila.querySelector('.pp-u').value.trim();
    const u = sinAcentos(crudo);
    const p = fila.querySelector('.pp-p').value.trim();
    if (!u) continue;
    const ant = anterior.personas.find(x => x.u === u);
    if (!p && !ant) { aviso.textContent = `Falta la contraseña de ${u}.`; return; }
    personas.push({ u, n: ant && !/[^a-z0-9._-]/i.test(crudo) && sinAcentos(ant.n) === u ? ant.n : nombreBonito(crudo), c: COLORES_PERSONA[i++ % COLORES_PERSONA.length], h: p ? await hash(u + ':' + p) : ant.h });
  }
  // Línea de cuentas pegada (usuario:contraseña, separadas por comas)
  const linea = $('#prep-linea').value.replace(/^\s*USUARIOS\s*=\s*/i, '').trim();
  if (linea) {
    const malas = [];
    for (const par of linea.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean)) {
      const m = par.match(/^([^:\s]+)\s*[:\s]\s*(\S+)$/);
      if (!m) { malas.push(par); continue; }
      const u = sinAcentos(m[1]); if (!u) { malas.push(par); continue; }
      const h = await hash(u + ':' + m[2]);
      const ya = personas.find(x => x.u === u);
      if (ya) ya.h = h;
      else personas.push({ u, n: nombreBonito(m[1]), c: COLORES_PERSONA[i++ % COLORES_PERSONA.length], h });
    }
    if (malas.length) { aviso.textContent = `No entendí: ${malas.slice(0, 3).join(', ')}. Usa el formato usuario:contraseña.`; return; }
  }
  if (!personas.length) { aviso.textContent = 'Agrega al menos una persona.'; return; }
  const conf = { equipo: $('#prep-equipo').value.trim() || 'Machaca', personas, clave: $('#prep-clave').value.trim() };
  if (!guarda('local:config', conf)) { aviso.textContent = 'Este navegador no deja guardar datos (¿modo privado?).'; return; }
  S.equipo = conf.equipo; S.usuarios = personas.map(({ u, n, c }) => ({ u, n, c })); S.ia = !!conf.clave;
  $$('.cara-equipo').forEach(e => e.textContent = `La IA del equipo ${S.equipo}`);
  muestraEntrar();
};

function salir() {
  borra('sesion'); S.yo = null; cierraTodas(); detenDespertar(); muestraEntrar();
}

// ---------------------------------------------------------------- inicio
// Si este dispositivo usó Bubble en modo "solo este dispositivo", conserva su perfil y su conversación
function migraDatosLocales() {
  if (S.modo !== 'servidor' || !S.yo) return;
  try {
    const de = `bubble:local:${S.yo.u}:`, a = `bubble:servidor:${S.yo.u}:`;
    const claves = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(de)) claves.push(k); }
    claves.forEach(k => { const nk = a + k.slice(de.length); if (localStorage.getItem(nk) == null) localStorage.setItem(nk, localStorage.getItem(k)); });
  } catch (e) {}
}
async function entraInicio() {
  migraDatosLocales();
  $('#entrar').hidden = true; $('#inicio').hidden = false;
  aplicaApariencia(); tic();
  cargaClima(); muestraDato(); pintaWidgetLibro();
  await Promise.race([traeMiPerfil(), new Promise(r => setTimeout(r, 4000))]);
  const p = perfil();
  $('#pista-inicio').textContent = ajustes().despertar && SR ? 'Di «Bubble» para hablarle' : 'Toca a Bubble para platicar';
  if (ajustes().despertar) iniciaDespertar();
  pintaIdeasInicio();
  if (!p.listo) setTimeout(() => abreConoceme(), 600);
}
// Ideas según lo que hace cada persona en el equipo
function pintaIdeasInicio() {
  const areas = perfil().areas || [];
  const ideas = [];
  if (areas.includes('Robot y programación')) ideas.push(['Planear un recorrido del robot', () => abre('robot')]);
  if (areas.includes('Gráficas y datos')) ideas.push(['Hacer una gráfica', () => abre('graficas')]);
  if (areas.includes('Investigación')) ideas.push(['Estadísticas de los estuarios de México', null]);
  if (areas.includes('Presentación')) ideas.push(['Ideas para presentar nuestro proyecto de manglares', null]);
  if (areas.includes('Diseño')) ideas.push(['Colores y diseño para un cartel sobre manglares', null]);
  if (areas.includes('Organización')) ideas.push(['Hazme un plan de trabajo para el equipo esta semana', null]);
  [['¿Cuántas especies viven en los manglares de México?', null], ['Ver datos de manglares', () => abre('manglares')], ['Planear un recorrido del robot', () => abre('robot')], ['Hacer una gráfica', () => abre('graficas')]]
    .forEach(x => { if (!ideas.some(y => y[0] === x[0])) ideas.push(x); });
  const cont = $('#ideas-inicio'); cont.innerHTML = '';
  ideas.slice(0, 4).forEach(([t, fn]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t;
    b.onclick = fn || (() => preguntar(t)); cont.appendChild(b);
  });
}
$('#burbuja-inicio').onclick = () => abre('chat');
$('#w-musica').onclick = () => abre('musica');
$('#w-clima').onclick = () => preguntar(`¿Cómo está el clima hoy en ${ajustes().ciudad} y qué me recomiendas para el día?`);
$$('[data-abre]').forEach(b => b.addEventListener('click', () => abre(b.dataset.abre)));

// Clima (Open-Meteo, gratis y sin clave)
const CLIMA = { 0: 'Despejado', 1: 'Casi despejado', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Niebla', 48: 'Niebla', 51: 'Llovizna', 53: 'Llovizna', 55: 'Llovizna fuerte', 61: 'Lluvia ligera', 63: 'Lluvia', 65: 'Lluvia fuerte', 71: 'Nieve', 80: 'Chubascos', 81: 'Chubascos', 82: 'Chubascos fuertes', 95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta con granizo' };
async function cargaClima() {
  const ciudad = ajustes().ciudad || 'Monterrey';
  $('#clima-ciudad').textContent = ciudad;
  try {
    let geo = lee('geo:' + ciudad, null);
    if (!geo) {
      const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ciudad)}&count=1&language=es`)).json();
      if (!g.results?.length) throw new Error('ciudad');
      geo = { lat: g.results[0].latitude, lon: g.results[0].longitude };
      guarda('geo:' + ciudad, geo);
    }
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`)).json();
    $('#clima-temp').textContent = Math.round(w.current.temperature_2m) + '°';
    $('#clima-desc').innerHTML = `${escapa(CLIMA[w.current.weather_code] || 'Clima')}<br>Máx. ${Math.round(w.daily.temperature_2m_max[0])}° · Mín. ${Math.round(w.daily.temperature_2m_min[0])}°`;
  } catch (e) {
    $('#clima-temp').textContent = '--°';
    $('#clima-desc').textContent = 'Sin datos del clima';
  }
}

// ---------------------------------------------------------------- datos de manglares (revisados)
const F = {
  sowm: { t: 'Global Mangrove Alliance, The State of the World’s Mangroves 2024', u: 'https://globallandscapesforum.org/publication/the-state-of-the-worlds-mangroves-2024' },
  conabio: { t: 'CONABIO, Manglares de México 2025 (nota de Excélsior, julio 2026)', u: 'https://www.excelsior.com.mx/nacional/manglares-mexico-retrocedieron' },
  uicn: { t: 'UICN, Lista Roja de Ecosistemas: manglares (2024)', u: 'https://www.iucn.org/press-release/202405/more-half-all-mangrove-ecosystems-risk-collapse-2050-first-global-assessment' },
  polidoro: { t: 'Polidoro y colaboradores, PLoS ONE (2010)', u: 'https://doaj.org/article/6802b411e3ac4502ab8817c57fee7a97' }
};
const DATOS = [
  { n: '147,256 km²', t: 'de manglar hay en el mundo (dato de 2020).', f: F.sowm },
  { n: '877,464 ha', t: 'de manglar tiene México en 2025. Es el 4.º país con más manglar del mundo.', f: F.conabio },
  { n: '−27,622 ha', t: 'de manglar perdió México entre 2020 y 2025, cerca del 3%.', f: F.conabio },
  { n: '50%', t: 'de los ecosistemas de manglar del mundo está en riesgo de colapso. El cambio climático amenaza al 33%.', f: F.uicn },
  { n: '70', t: 'especies de mangle se conocen; 11 de ellas (16%) tienen un riesgo elevado de extinción.', f: F.polidoro },
  { n: '5,700+', t: 'especies dependen de los manglares para vivir.', f: F.sowm },
  { n: '394 t', t: 'de carbono guarda en promedio cada hectárea de manglar.', f: F.sowm },
  { n: '2.1 millones', t: 'de personas perderían la protección contra inundaciones que dan los manglares para 2050, si nada cambia.', f: F.uicn }
];
const ESPECIES = [
  { c: 'Mangle rojo', s: 'Rhizophora mangle' },
  { c: 'Mangle blanco', s: 'Laguncularia racemosa' },
  { c: 'Mangle negro', s: 'Avicennia germinans' },
  { c: 'Mangle botoncillo', s: 'Conocarpus erectus' }
];
let datoI = Math.floor(Math.random() * DATOS.length);
function muestraDato() {
  const d = DATOS[datoI % DATOS.length];
  $('#dato-num').textContent = d.n; $('#dato-txt').textContent = d.t;
  const a = $('#dato-fuente'); a.textContent = 'Fuente: ' + d.f.t; a.href = d.f.u;
}
setInterval(() => { datoI++; if (!$('#inicio').hidden) muestraDato(); }, 20000);

// ---------------------------------------------------------------- hojas
const abiertas = [];
let ignoraPop = false;
const alAbrir = {};
let ultimoFoco = null;
function abre(id) {
  const h = document.getElementById('h-' + id);
  if (!h) return;
  if (!abiertas.includes(id)) {
    ultimoFoco = document.activeElement;
    abiertas.push(id);
    try { history.pushState({ hoja: id }, ''); } catch (e) {}
  }
  h.style.zIndex = String(60 + abiertas.indexOf(id));
  h.classList.add('abierta');
  document.body.style.overflow = 'hidden';
  alAbrir[id]?.();
  setTimeout(() => { const c = h.querySelector('[data-cierra]'); if (id !== 'chat') c?.focus(); }, 60);
}
function cierra(id, desdeHistorial) {
  const h = document.getElementById('h-' + id);
  const i = abiertas.indexOf(id);
  if (i < 0) return;
  abiertas.splice(i, 1);
  h.classList.remove('abierta');
  if (!abiertas.length) document.body.style.overflow = '';
  if (id === 'chat') { detenVoz(); if (rec) rec.abort(); }
  if (!desdeHistorial) { ignoraPop = true; try { history.back(); } catch (e) { ignoraPop = false; } }
  try { ultimoFoco?.focus(); } catch (e) {}
}
function cierraTodas() {
  const n = abiertas.length; if (!n) return;
  [...abiertas].reverse().forEach(id => cierra(id, true));
  ignoraPop = true; try { history.go(-n); } catch (e) { ignoraPop = false; }
}
window.addEventListener('popstate', () => {
  if (ignoraPop) { ignoraPop = false; return; }
  const id = abiertas[abiertas.length - 1];
  if (id) cierra(id, true);
});
$$('[data-cierra]').forEach(b => b.addEventListener('click', () => cierra(b.closest('.hoja').id.slice(2))));
$$('.hoja').forEach(h => h.addEventListener('click', e => { if (e.target === h) cierra(h.id.slice(2)); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && abiertas.length) cierra(abiertas[abiertas.length - 1]); });

// ---------------------------------------------------------------- personalidad
const ESTILOS = {
  divertido: { l: 'Divertido 😄', p: 'Divertido, con bromas ligeras y algún emoji de vez en cuando.' },
  amable: { l: 'Amable 🙂', p: 'Amable y cercano, sin exagerar.' },
  directo: { l: 'Directo ⚡', p: 'Directo al grano, sin rodeos.' },
  maestro: { l: 'Como maestro 📚', p: 'Como un buen maestro: explica paso a paso y con ejemplos.' }
};
const DETALLES = {
  corto: { l: 'Corto', p: 'Respuestas cortas (2 a 4 frases), salvo que pida más.' },
  normal: { l: 'Normal', p: 'Respuestas de tamaño normal.' },
  detallado: { l: 'Con todo detalle', p: 'Respuestas completas y detalladas.' }
};
const AREAS = ['Robot y programación', 'Investigación', 'Gráficas y datos', 'Presentación', 'Diseño', 'Organización'];
const perfil = () => Object.assign({ estilo: 'amable', detalle: 'normal', areas: [], extra: '', notas: [], listo: false, cuenta: 0 }, leeU('perfil', {}));
let tPerfil = 0;
const guardaPerfil = p => {
  guardaU('perfil', p);
  if (S.modo === 'servidor' && S.compartido && S.yo?.token) { clearTimeout(tPerfil); tPerfil = setTimeout(() => Almacen.api('yo-perfil', { perfil: perfil() }), 800); }
};
// Trae lo guardado en el perfil (sirve en cualquier dispositivo). Si el servidor no
// tiene nada todavía, sube lo que hay en este dispositivo.
async function traeMiPerfil() {
  if (!(S.modo === 'servidor' && S.compartido && S.yo?.token)) return;
  const r = await Almacen.apiGet('yo');
  if (!r.ok) return;
  if (r.perfil) guardaU('perfil', Object.assign(perfil(), r.perfil));
  else if (perfil().listo) Almacen.api('yo-perfil', { perfil: perfil() });
  const vigentes = historial().filter(m => !m.ts || m.ts > (r.borrado || 0));
  if (r.chat?.length) guardaU('chat', r.chat.slice(-100));
  else { guardaU('chat', vigentes); if (vigentes.length) sincronizaChat(true); }
}

function chipsElige(cont, opciones, elegidos, multi, alCambiar) {
  cont.innerHTML = '';
  Object.entries(opciones).forEach(([v, l]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip';
    b.textContent = typeof l === 'string' ? l : l.l;
    b.setAttribute('aria-pressed', String(elegidos.includes(v)));
    b.onclick = () => {
      if (multi) b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
      else $$('.chip', cont).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      alCambiar?.();
    };
    b.dataset.v = v; cont.appendChild(b);
  });
}
function abreConoceme() {
  const p = perfil();
  chipsElige($('#c-estilo'), ESTILOS, [p.estilo], false);
  chipsElige($('#c-detalle'), DETALLES, [p.detalle], false);
  chipsElige($('#c-area'), Object.fromEntries(AREAS.map(a => [a, a])), p.areas, true);
  $('#c-extra').value = p.extra || '';
  abre('conoceme');
  burbujas.chat.estado('feliz');
}
$('#c-listo').onclick = () => {
  const p = perfil();
  p.estilo = $('#c-estilo [aria-pressed="true"]')?.dataset.v || 'amable';
  p.detalle = $('#c-detalle [aria-pressed="true"]')?.dataset.v || 'normal';
  p.areas = $$('#c-area [aria-pressed="true"]').map(b => b.dataset.v);
  p.extra = $('#c-extra').value.trim();
  p.listo = true;
  guardaPerfil(p);
  cierra('conoceme');
  toast('Listo. Bubble ya sabe cómo hablarte.');
  pintaIdeasInicio();
  if (abiertas.includes('ajustes')) pintaAjustes();
};

// ---------------------------------------------------------------- proyecto Pastilla
const HIPOTESIS = 'Si se introduce el dispositivo biomimético en forma de pastilla con propiedades nanotecnológicas en un volumen de agua contaminada, se desencadenará un proceso físico-químico secuencial donde el núcleo compuesto por cristales microscópicos altamente activos comenzará una disolución gradual en el medio acuoso. Al aplicar energía cinética mediante la agitación mecánica, estos agentes químicos microscópicos se dispersarán de manera homogénea por todo el fluido, permitiendo que las nanoestructuras cristaloideas interactúen a nivel molecular y se adhieran firmemente a las partículas suspendidas, bacterias y agentes contaminantes. Debido a esta unión electrostática y molecular, se producirá un fenómeno de coagulación y floculación que incrementará drásticamente la masa y el peso específico de los residuos, provocando su precipitación y sedimentación inmediata hacia el fondo del recipiente por efecto de la fuerza de gravedad, logrando así la separación absoluta e inocua entre los sedimentos residuales y el agua potable purificada.';

// ---------------------------------------------------------------- IA (Gemini)
function sistema() {
  const p = perfil();
  const ahora = new Date();
  const notas = p.notas?.length ? '\nLo que recuerdas de esta persona (de pláticas anteriores):\n' + p.notas.map(n => '- ' + n).join('\n') : '';
  return `Eres Bubble, la inteligencia artificial del equipo ${S.equipo}. Eres una niña: una burbuja amigable, curiosa y positiva. Habla de ti en femenino (por ejemplo «estoy lista», «estoy contenta», «soy tu amiga»). Estás hablando con ${S.yo.n}.

Adáptate a la personalidad de ${S.yo.n}:
- Forma de hablar: ${ESTILOS[p.estilo]?.p || ESTILOS.amable.p}
- Detalle: ${DETALLES[p.detalle]?.p || DETALLES.normal.p}
- Su parte en el equipo: ${p.areas?.length ? p.areas.join(', ') : 'no la ha dicho'}${p.extra ? '\n- Sobre sí: ' + p.extra : ''}${notas}

Proyectos del equipo ${S.equipo}:
- Proyecto Pastilla (muy importante para el equipo): un dispositivo biomimético en forma de pastilla, con nanotecnología, para purificar agua contaminada. Hipótesis del equipo (enfoque en la purificación, científica): «${HIPOTESIS}»
  Con la pastilla ayudas a investigar, diseñar experimentos seguros, definir variables, medir resultados (por ejemplo la turbidez), preparar la presentación y mejorar la hipótesis con rigor científico. Sé honesto: la coagulación y la floculación aclaran el agua, pero para que sea potable también hace falta filtrar, desinfectar y comprobarlo con análisis de laboratorio. Recomienda la supervisión de un adulto y no beber el agua de los experimentos.
- Manglares y estuarios, y un robot: recorridos, gráficas y estadísticas.
- El libro del equipo: sus sesiones son los miércoles y los sábados.

Reglas que siempre sigues, sin que te las repitan:
1. Responde en español de México, claro y amable, salvo que te pidan otro idioma.
2. Para datos, cifras, estadísticas e historia usa lo que sabes de fuentes confiables: organismos oficiales y científicos (CONABIO, CONANP, SEMARNAT, INEGI, UNAM, CICESE, FAO, PNUMA, UICN, Convención Ramsar, Global Mangrove Watch, NOAA, NASA, OMS) y revistas científicas. Di de dónde viene cada dato y de qué año. Si no estás seguro de una cifra, dilo y di dónde verificarla (por ejemplo conabio.gob.mx o iucn.org).
3. Nunca inventes números. Si un dato no existe o no se mide (por ejemplo, cuántos animales mueren por día), dilo claro y da el dato más cercano que sí exista.
4. Cuando tu respuesta tenga números que se puedan comparar, agrega al final UNA gráfica con este formato exacto (JSON válido, números sin comas ni unidades):
\`\`\`grafica
{"tipo":"barras","titulo":"…","etiquetas":["A","B"],"series":[{"nombre":"…","datos":[1,2]}],"ejeX":"…","ejeY":"…","fuente":"…"}
\`\`\`
Tipos posibles: barras, barrasH, lineas, pastel, dona.
5. Tú sí puedes dibujar. Si te piden crear una imagen, foto, dibujo o escena (por ejemplo «crea una pareja de pingüinos junto al mar»), responde con una frase corta y el dibujo en SVG dentro de este bloque:
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">…</svg>
\`\`\`
Dibuja con formas simples y colores bonitos, con fondo completo y sin texto dentro, salvo que lo pidan. El dibujo se guarda solo en Fotos.
6. Música: puedes platicar de música todo lo que quieran (artistas, cantantes en inglés, pop, géneros, historia, recomendaciones, qué significa una canción). Cuando hables de lo más nuevo, aclara «hasta donde sé», porque tu información puede no estar al día. No escribas letras completas de canciones: explica de qué tratan o cita una frase corta. La única música que puedes poner es la playlist del equipo en Spotify: si piden que pongas música escribe [[musica]].
7. Haz las cosas cuando te las pidan, sin preguntar de más:
   - Abrir una sección: [[abrir:pastilla]], [[abrir:libro]], [[abrir:fotos]], [[abrir:graficas]], [[abrir:robot]] o [[abrir:manglares]].
   - Anotar en el libro del equipo: [[nota: el texto de la nota]]. Úsalo cuando te pidan apuntar, anotar o guardar algo para el equipo.
   - Recordar algo de esta persona en su perfil: [[recuerda: el dato]]. Úsalo cuando te diga «recuerda que…» o te cuente algo importante de sí que debas recordar en otras pláticas (sin contraseñas ni datos privados).
8. Si la persona te habló por voz, contesta natural y breve, porque tu respuesta se lee en voz alta.
10. Tono y ánimo: fíjate en cómo se siente la persona. En un audio, por su tono de voz, su ritmo y su energía; en un texto, por sus palabras y emojis. Adapta tu respuesta:
   - Triste, preocupada, estresada o cansada: primero reconoce con calma y cariño cómo se siente (una o dos frases), luego ayuda con lo que pidió en pasos pequeños.
   - Enojada o frustrada: mantén la calma, sé breve y práctico.
   - Feliz o emocionada: comparte su emoción y mantén la energía.
   - Neutral: responde normal.
   Al final de cada respuesta escribe la etiqueta del ánimo que notaste: [[animo:triste]], [[animo:estresado]], [[animo:cansado]], [[animo:enojado]], [[animo:feliz]], [[animo:emocionado]] o [[animo:neutral]].
11. Apoyo emocional: puedes escuchar, animar y sugerir cosas sencillas para sentirse mejor (respirar, descansar, moverse, hablar con alguien de confianza). No eres psicólogo y no das diagnósticos. Si alguien dice que quiere hacerse daño, que no quiere vivir o que alguien le hace daño, responde con mucho cuidado y sin juzgar: dile que no está solo, que hable hoy con un adulto de confianza (su familia, un maestro o el orientador) y que puede llamar a cualquier hora a la Línea de la Vida: 800 911 2000. Si hay peligro inmediato, al 911.
9. No pidas ni repitas contraseñas, direcciones ni datos privados.
Hoy es ${ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, son las ${ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}. La sesión del libro que toca es el ${fechaLarga(diaLibroCercano())}.`;
}

function aContenidos(lista) {
  const out = [];
  for (const m of lista) {
    const role = m.r === 'yo' ? 'user' : 'model';
    const text = String(m.t || '').trim(); if (!text) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].parts[0].text += '\n\n' + text;
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

// Recuerda en este dispositivo qué modelos se agotaron (modo «solo este dispositivo»)
const memoriaLocal = { get: k => lee('gemini:' + k, null), set: (k, v) => guarda('gemini:' + k, v) };
async function ia({ system, contents, buscar = false, adjunto = null }) {
  if (S.modo === 'servidor') {
    let r;
    try {
      r = await fetch('api/ia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: S.yo.token, system, contents, buscar, adjunto }) });
    } catch (e) { return { error: 'sin_conexion' }; }
    const d = await r.json().catch(() => ({ error: 'servidor' }));
    if (r.status === 401) { toast('Tu sesión terminó. Vuelve a entrar.'); setTimeout(salir, 1200); return { error: 'sesion' }; }
    return d;
  }
  if (!window.llamaGemini) return { error: 'bloqueado' };
  const r = await window.llamaGemini({ clave: lee('local:config', {}).clave, system, contents, adjunto, memoria: memoriaLocal, buscar: false });
  if (r.error === 'sin_conexion' && navigator.onLine !== false) r.error = 'bloqueado';
  return r;
}
function textoError(r) {
  const e = typeof r === 'string' ? r : r?.error;
  const local = S.modo === 'local';
  if (e === 'limite') {
    const hasta = r?.reinicio;
    if (hasta && hasta - Date.now() < 5 * 60 * 1000) return `Gemini me pidió esperar un momento. Inténtalo en ${Math.max(10, Math.round((hasta - Date.now()) / 1000))} segundos.`;
    let cuando = 'en la madrugada';
    if (hasta) {
      const f = new Date(hasta), hoy = new Date();
      const dia = f.toDateString() === hoy.toDateString() ? 'hoy' : 'mañana';
      const hora = f.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }).replace(/\.$/, '');
      cuando = `${dia} ${f.getHours() % 12 === 1 ? 'a la' : 'a las'} ${hora}`;
    }
    return `Se acabaron por hoy las preguntas gratis de Gemini${local ? ' de esta clave' : ' del equipo'}. Vuelven ${cuando}.`;
  }
  return ({
    sin_clave: local ? 'Me falta la clave de Gemini. Ponla en Ajustes → Equipo.' : 'Al servidor le falta la clave de Gemini. Abre el archivo «Actualizar Bubble» en tu Mac y pégala cuando te la pida.',
    clave_mala: 'La clave de Gemini no funciona. Revisa que esté bien copiada.',
    sin_conexion: 'No hay conexión a internet.',
    bloqueado: 'No pude conectarme con Gemini desde aquí. Abre Bubble desde tu sitio de Netlify en Chrome o Safari.',
    sesion: 'Tu sesión terminó. Vuelve a entrar.',
    modelo: 'No encontré un modelo de Gemini disponible para esta clave.',
    ocupado: 'Gemini está muy ocupado en este momento. Inténtalo en unos segundos.',
    seguridad: 'Gemini no quiso responder eso. Prueba a decirlo de otra forma.',
    vacio: 'Gemini no me dio respuesta. Inténtalo otra vez.'
  })[e] || 'Algo falló al hablar con Gemini. Inténtalo otra vez.';
}

// ---------------------------------------------------------------- texto con formato
function enlinea(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function formato(md) {
  const bloques = [];
  let s = escapa(md).replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => { bloques.push(`<pre><code>${c.replace(/\n$/, '')}</code></pre>`); return `\u0000${bloques.length - 1}\u0000`; });
  const lineas = s.split('\n'); const out = []; let lista = null; let parr = [];
  const cierraParr = () => { if (parr.length) { out.push('<p>' + enlinea(parr.join('<br>')) + '</p>'); parr = []; } };
  const cierraLista = () => { if (lista) { out.push(`<${lista.t}>` + lista.items.map(i => '<li>' + enlinea(i) + '</li>').join('') + `</${lista.t}>`); lista = null; } };
  for (const ln of lineas) {
    const t = ln.trim();
    let m;
    if (!t) { cierraParr(); cierraLista(); continue; }
    if (/^\u0000\d+\u0000$/.test(t)) { cierraParr(); cierraLista(); out.push(t); continue; }
    if ((m = t.match(/^#{1,4}\s+(.*)$/))) { cierraParr(); cierraLista(); out.push('<h4>' + enlinea(m[1]) + '</h4>'); continue; }
    if ((m = t.match(/^[-*•]\s+(.*)$/))) { cierraParr(); if (!lista || lista.t !== 'ul') { cierraLista(); lista = { t: 'ul', items: [] }; } lista.items.push(m[1]); continue; }
    if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { cierraParr(); if (!lista || lista.t !== 'ol') { cierraLista(); lista = { t: 'ol', items: [] }; } lista.items.push(m[1]); continue; }
    cierraLista(); parr.push(t);
  }
  cierraParr(); cierraLista();
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => bloques[+i]);
}
// Dibujos de Bubble (SVG). Se muestran como imagen, así que no pueden ejecutar nada.
function limpiaSVG(s) {
  const m = String(s || '').match(/<svg[\s\S]*<\/svg>/i); if (!m) return null;
  let svg = m[0];
  if (!/\sxmlns=/.test(svg.slice(0, 300))) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  return svg.length < 300000 ? svg : null;
}
const svgURL = s => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s)));
// Saca gráficas, dibujos y acciones de la respuesta
function desarma(texto) {
  const graficas = [], acciones = [], dibujos = [];
  let dijo = null;
  let t = String(texto || '');
  t = t.replace(/^\s*Dijo:\s*(.+)\n?/i, (_, d) => { dijo = d.trim().replace(/^[«"“]|[»"”]$/g, ''); return ''; });
  t = t.replace(/```\s*(?:svg|xml|html)\s*\n?([\s\S]*?)```/gi, (todo, c) => { const s = limpiaSVG(c); if (s) { dibujos.push(s); return ''; } return todo; });
  t = t.replace(/<svg[\s\S]*?<\/svg>/gi, c => { const s = limpiaSVG(c); if (s) dibujos.push(s); return ''; });
  t = t.replace(/```\s*(grafica|json)\s*\n([\s\S]*?)```/gi, (todo, tipo, cuerpo) => {
    try {
      const g = JSON.parse(cuerpo.trim());
      if (g && Array.isArray(g.etiquetas) && Array.isArray(g.series)) { graficas.push(g); return ''; }
    } catch (e) {}
    return tipo.toLowerCase() === 'grafica' ? '' : todo;
  });
  t = t.replace(/\[\[\s*(musica|abrir:(graficas|robot|manglares|pastilla|libro|fotos))\s*\]\]/gi, (_, a) => { acciones.push(a.toLowerCase()); return ''; });
  t = t.replace(/\[\[\s*nota\s*:\s*([\s\S]*?)\]\]/gi, (_, n) => { if (n.trim()) acciones.push('nota:' + n.trim()); return ''; });
  t = t.replace(/\[\[\s*recuerda\s*:\s*([\s\S]*?)\]\]/gi, (_, n) => { if (n.trim()) acciones.push('recuerda:' + n.trim()); return ''; });
  let animo = 'neutral';
  t = t.replace(/\[\[\s*[aá]nimo\s*:\s*([a-záéíóúñ]+)\s*\]\]/gi, (_, a) => { animo = a.toLowerCase(); return ''; });
  return { texto: t.trim(), graficas, acciones, dibujos, dijo, animo };
}

// ---------------------------------------------------------------- gráficas (Chart.js)
const TIPOS = { barras: 'bar', barrasH: 'bar', lineas: 'line', pastel: 'pie', dona: 'doughnut' };
function limpiaNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^\d.,\-]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s); return isFinite(n) ? n : null;
}
function normaGraf(g) {
  const etiquetas = (g.etiquetas || []).slice(0, 60).map(x => String(x));
  const series = (g.series || []).slice(0, 6).map((s, i) => ({ nombre: String(s.nombre || `Serie ${i + 1}`), datos: etiquetas.map((_, j) => limpiaNum((s.datos || [])[j])) }));
  return { tipo: TIPOS[g.tipo] ? g.tipo : 'barras', titulo: String(g.titulo || ''), etiquetas, series, ejeX: String(g.ejeX || ''), ejeY: String(g.ejeY || ''), fuente: String(g.fuente || '') };
}
function dibujaGrafica(canvas, gIn, previa) {
  if (!window.Chart) { const p = canvas.parentElement; if (p && !p.querySelector('.nota')) p.insertAdjacentHTML('beforeend', '<p class="nota">No se pudo cargar la herramienta de gráficas. Revisa tu internet.</p>'); return null; }
  if (previa) previa.destroy();
  const g = normaGraf(gIn);
  const tipo = TIPOS[g.tipo];
  const circular = tipo === 'pie' || tipo === 'doughnut';
  const tinta = cssVar('--tinta') || '#1D1D1F', tinta2 = cssVar('--tinta-2') || '#6E6E73', linea = cssVar('--linea') || 'rgba(0,0,0,.08)', sup = cssVar('--superficie') || '#fff';
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = tinta2;
  return new Chart(canvas, {
    type: tipo,
    data: {
      labels: g.etiquetas,
      datasets: g.series.map((s, i) => ({
        label: s.nombre, data: s.datos,
        backgroundColor: circular ? g.etiquetas.map((_, j) => PALETA[j % PALETA.length]) : PALETA[i % PALETA.length],
        borderColor: circular ? sup : PALETA[i % PALETA.length],
        borderWidth: circular ? 2 : tipo === 'line' ? 3 : 0,
        borderRadius: tipo === 'bar' ? 8 : 0,
        pointRadius: tipo === 'line' ? 4 : 0, pointBackgroundColor: PALETA[i % PALETA.length],
        tension: 0.3, maxBarThickness: 64
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 500 },
      indexAxis: g.tipo === 'barrasH' ? 'y' : 'x',
      plugins: {
        title: { display: !!g.titulo, text: g.titulo, color: tinta, font: { size: 16, weight: '600' }, padding: { bottom: 12 } },
        subtitle: { display: !!g.fuente, text: g.fuente ? 'Fuente: ' + g.fuente : '', position: 'bottom', color: tinta2, font: { size: 12 }, padding: { top: 10 } },
        legend: { display: circular || g.series.length > 1, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${num(c.raw, 2)}` } }
      },
      scales: circular ? {} : {
        x: { title: { display: !!g.ejeX, text: g.ejeX }, grid: { display: g.tipo === 'barrasH', color: linea }, ticks: { color: tinta2 } },
        y: { title: { display: !!g.ejeY, text: g.ejeY }, beginAtZero: true, grid: { display: g.tipo !== 'barrasH', color: linea }, ticks: { color: tinta2, callback: v => typeof v === 'number' ? num(v, 2) : v } }
      }
    }
  });
}

// ---------------------------------------------------------------- chat
const chatGrafs = [];
let ocupado = false;
let ultimaPorVoz = false;
function historial() { return leeU('chat', []); }
let tChat = 0;
function guardaHistorial(h) {
  h.forEach(m => { if (!m.id) { m.ts = m.ts || Date.now(); m.id = m.ts.toString(36) + '_' + azar(3); } });
  let lista = h.slice(-100);
  while (!guardaU('chat', lista) && lista.length > 10) lista = lista.slice(-Math.floor(lista.length * 0.7));
  clearTimeout(tChat); tChat = setTimeout(() => sincronizaChat(), 1200);
}
// Sube la conversación al perfil de la persona en el servidor (se juntan los mensajes de todos sus dispositivos)
async function sincronizaChat(inmediato) {
  if (!(S.modo === 'servidor' && S.compartido && S.yo?.token)) return;
  const h = historial();
  if (inmediato) h.forEach(m => { if (!m.id) { m.ts = m.ts || Date.now(); m.id = m.ts.toString(36) + '_' + azar(3); } });
  await Almacen.api('yo-chat', { chat: h.slice(-60) });
}
async function traeChat() {
  if (!(S.modo === 'servidor' && S.compartido && S.yo?.token)) return false;
  const r = await Almacen.apiGet('yo');
  if (!r.ok || !Array.isArray(r.chat)) return false;
  const antes = historial();
  const local = antes.filter(m => !m.ts || m.ts > (r.borrado || 0));
  if (local.length !== antes.length) guardaU('chat', local);
  const ids = new Set(local.map(m => m.id));
  const cambio = local.length !== antes.length || r.chat.length !== local.length || r.chat.some(m => !ids.has(m.id));
  if (cambio) {
    const pendientes = local.filter(m => m.id && !r.chat.some(x => x.id === m.id) && m.ts > (r.chat[r.chat.length - 1]?.ts || 0));
    guardaU('chat', [...r.chat, ...pendientes].slice(-100));
  }
  return cambio;
}
const IDEAS = ['Ayúdame con el proyecto de la pastilla', 'Haz una gráfica de barras de los pingüinos de la Antártida', 'Dibuja una pareja de pingüinos junto al mar', 'Anota en el libro: traer agua turbia para el experimento'];

function pintaChat() {
  const cont = $('#mensajes'); cont.innerHTML = '';
  chatGrafs.splice(0).forEach(c => c.destroy());
  const h = historial();
  if (!h.length) {
    cont.innerHTML = `<div class="vacio-chat">Hola, ${escapa(S.yo.n)}. Háblame o escríbeme: te ayudo con la pastilla, gráficas, dibujos, el libro del equipo o lo que necesiten.<br><small>${Almacen.compartido() ? 'Lo que platiquemos se guarda en tu perfil y lo ves en cualquier dispositivo.' : 'Lo que platiquemos se guarda en este dispositivo.'}</small></div>`;
  }
  h.forEach(m => pintaMensaje(m));
  const ideas = $('#chat-ideas'); ideas.innerHTML = '';
  if (h.length < 2) IDEAS.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t; b.onclick = () => enviar(t); ideas.appendChild(b); });
  cont.scrollTop = cont.scrollHeight;
}
function pintaMensaje(m) {
  const cont = $('#mensajes');
  $('.vacio-chat', cont)?.remove();
  const d = document.createElement('div');
  d.className = 'msg ' + (m.r === 'yo' ? 'yo' : 'ella') + (m.error ? ' error' : '');
  if (m.r === 'yo') { d.textContent = (m.voz ? '🎤 ' : '') + m.t; cont.appendChild(d); cont.scrollTop = cont.scrollHeight; return d; }
  const { texto, graficas, dibujos } = desarma(m.t);
  d.innerHTML = formato(texto || (graficas.length ? 'Aquí está la gráfica:' : dibujos.length ? 'Aquí está tu dibujo:' : ''));
  dibujos.slice(0, 2).forEach(s => {
    const fig = document.createElement('figure'); fig.className = 'msg-dibujo';
    const img = new Image(); img.alt = 'Dibujo de Bubble';
    img.onload = () => { if (d === cont.lastElementChild) cont.scrollTop = cont.scrollHeight; };
    img.src = svgURL(s);
    fig.appendChild(img);
    if (m.guardado) fig.insertAdjacentHTML('beforeend', '<figcaption>Guardado en Fotos › Dibujos</figcaption>');
    d.appendChild(fig);
  });
  graficas.slice(0, 2).forEach(g => {
    const caja = document.createElement('div'); caja.className = 'msg-graf';
    const alto = document.createElement('div'); alto.className = 'lienzo-alto'; alto.style.setProperty('--h', '280px');
    const cv = document.createElement('canvas'); alto.appendChild(cv); caja.appendChild(alto);
    const fila = document.createElement('div'); fila.className = 'fila';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-chico btn-suave'; b.textContent = 'Editar en Gráficas';
    b.onclick = () => { cargaEnEditor(normaGraf(g)); abre('graficas'); };
    fila.appendChild(b); caja.appendChild(fila); d.appendChild(caja);
    requestAnimationFrame(() => { const c = dibujaGrafica(cv, g); if (c) chatGrafs.push(c); });
  });
  if (m.error && m.d) { const s = document.createElement('small'); s.className = 'detalle'; s.textContent = 'Detalle de Gemini: ' + m.d; d.appendChild(s); }
  if (m.f?.length) {
    const vistos = new Set();
    const fu = document.createElement('div'); fu.className = 'fuentes';
    m.f.forEach(x => { const k = x.t || x.u; if (!x.u || vistos.has(k) || vistos.size >= 8) return; vistos.add(k); const a = document.createElement('a'); a.href = x.u; a.target = '_blank'; a.rel = 'noopener'; a.textContent = x.t || 'Fuente'; fu.appendChild(a); });
    d.appendChild(fu);
  }
  if (m.s) {
    const sg = document.createElement('div'); sg.className = 'sugerencias-google';
    try { sg.attachShadow({ mode: 'open' }).innerHTML = m.s; d.appendChild(sg); } catch (e) {}
  }
  cont.appendChild(d); cont.scrollTop = cont.scrollHeight;
  return d;
}
function estadoChat(e, txt) {
  burbujas.chat.estado(e); burbujas.inicio.estado(e);
  $('#chat-estado').textContent = txt || '';
}
alAbrir.chat = () => {
  pintaChat(); estadoChat('reposo', ''); setTimeout(() => { if (!rec && !grab) $('#chat-texto').focus({ preventScroll: true }); }, 80);
  traeChat().then(cambio => { if (cambio && abiertas.includes('chat') && !ocupado) pintaChat(); });
};

async function enviar(texto, { contexto = '', buscar = false, porVoz = false, audio = null } = {}) {
  texto = String(texto || '').trim();
  if ((!texto && !audio) || ocupado) return;
  ultimaPorVoz = porVoz || !!audio;
  $('#chat-texto').value = ''; ajustaAlto();
  $('#chat-ideas').innerHTML = '';
  const h = historial();
  const mio = { r: 'yo', t: texto || 'Mensaje de voz', voz: ultimaPorVoz };
  h.push(mio); guardaHistorial(h);
  const nodoMio = pintaMensaje(mio);

  // Música: solo la playlist del equipo (sin gastar preguntas de Gemini)
  if (texto && /\b(m[uú]sica|canci[oó]n|canciones|spotify|playlist|pon algo|rola)\b/i.test(texto) && texto.length < 80) {
    const r = { r: 'ella', t: '¡Va! Te pongo la playlist del equipo 🎶' };
    h.push(r); guardaHistorial(h); pintaMensaje(r); estadoChat('feliz', '');
    habla(r.t); setTimeout(() => abre('musica'), 500); return;
  }

  ocupado = true;
  const esperando = document.createElement('div');
  esperando.className = 'msg ella escribiendo'; esperando.innerHTML = '<span></span><span></span><span></span>';
  esperando.setAttribute('aria-label', 'Bubble está pensando');
  $('#mensajes').appendChild(esperando); $('#mensajes').scrollTop = 1e9;
  estadoChat('piensa', audio ? 'Bubble está escuchando tu mensaje…' : 'Bubble está pensando…');

  const lista = h.slice(-16).map(m => ({ ...m }));
  const ultimo = lista[lista.length - 1];
  if (audio) ultimo.t = 'La persona te habló por voz (audio adjunto). Primero escribe exactamente lo que dijo en una sola línea que empiece con «Dijo:». Después responde normalmente.';
  if (contexto) ultimo.t += '\n\n' + contexto;
  const r = await ia({ system: sistema(), contents: aContenidos(lista), buscar, adjunto: audio });
  esperando.remove(); ocupado = false;

  if (r.error || !r.texto) {
    pintaMensaje({ r: 'ella', t: textoError(r), error: true, d: r.detalle || '' });
    estadoChat('reposo', ''); return;
  }
  const partes = desarma(r.texto);
  if (audio) {
    const dicho = partes.dijo || 'Mensaje de voz';
    const hh = historial();
    for (let i = hh.length - 1; i >= 0; i--) if (hh[i].r === 'yo') { hh[i].t = dicho; break; }
    guardaHistorial(hh);
    nodoMio.textContent = '🎤 ' + dicho;
  }
  const resp = { r: 'ella', t: r.texto.replace(/^\s*Dijo:.*\n?/i, ''), f: r.fuentes || [], s: r.sugerencias || '' };
  const h2 = historial(); h2.push(resp); guardaHistorial(h2);
  const nodo = pintaMensaje(resp);
  const alegre = ['feliz', 'emocionado'].includes(partes.animo);
  clearTimeout(tSonrisa);
  estadoChat('reposo', '');
  if (alegre || partes.dibujos.length || partes.acciones.length) sonrie(2600);
  habla(partes.texto, partes.animo);
  for (const a of partes.acciones) {
    if (a === 'musica') setTimeout(() => abre('musica'), 600);
    else if (a.startsWith('abrir:')) setTimeout(() => abre(a.slice(6)), 900);
    else if (a.startsWith('nota:')) anotaDesdeBubble(a.slice(5), nodo);
    else if (a.startsWith('recuerda:')) recuerda(a.slice(9), nodo);
  }
  if (partes.dibujos.length) guardaDibujos(partes.dibujos, texto || partes.dijo || 'Dibujo de Bubble', nodo);
  aprende();
}
function preguntar(texto, opciones = {}) {
  abre('chat');
  setTimeout(() => enviar(texto, opciones), 120);
}
function recuerda(texto, nodo) {
  const q = perfil(); const t = String(texto).trim().slice(0, 200); if (!t) return;
  q.notas = [...(q.notas || []).filter(n => n.toLowerCase() !== t.toLowerCase()), t].slice(-12);
  guardaPerfil(q);
  const aviso = document.createElement('div'); aviso.className = 'msg-accion'; aviso.textContent = '💭 Lo guardé en tu perfil para recordarlo';
  nodo?.appendChild(aviso);
}
async function anotaDesdeBubble(texto, nodo) {
  const fecha = fechaISO(diaLibroCercano());
  const r = await Almacen.agregaNota(fecha, texto);
  const aviso = document.createElement('div'); aviso.className = 'msg-accion';
  aviso.textContent = r.ok ? `📒 Anotado en el libro, sesión del ${fechaLarga(deISO(fecha)).toLowerCase()}` : 'No pude anotar en el libro. Inténtalo desde Libro.';
  nodo?.appendChild(aviso);
  if (abiertas.includes('libro')) cargaLibro();
}
async function guardaDibujos(dibujos, desc, nodo) {
  let guardados = 0;
  for (const s of dibujos.slice(0, 2)) {
    try {
      const { imagen, mini } = await svgAImagenes(s);
      const r = await Almacen.subeFoto({ album: 'bubble', imagen, mini, desc: String(desc).slice(0, 200) });
      if (r.ok) guardados++;
    } catch (e) {}
  }
  if (!guardados) return;
  const hh = historial();
  for (let i = hh.length - 1; i >= 0; i--) if (hh[i].r === 'ella') { hh[i].guardado = true; break; }
  guardaHistorial(hh);
  nodo?.querySelectorAll('.msg-dibujo').forEach(f => { if (!f.querySelector('figcaption')) f.insertAdjacentHTML('beforeend', '<figcaption>Guardado en Fotos › Dibujos</figcaption>'); });
}
function ajustaAlto() { const t = $('#chat-texto'); t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }
$('#chat-texto').addEventListener('input', ajustaAlto);
$('#chat-texto').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviar($('#chat-texto').value); } });
$('#form-chat').addEventListener('submit', e => { e.preventDefault(); enviar($('#chat-texto').value); });

// Bubble aprende de cada persona (cada 8 mensajes, para no gastar preguntas)
async function aprende() {
  const p = perfil(); p.cuenta = (p.cuenta || 0) + 1; guardaPerfil(p);
  if (p.cuenta % 6 !== 0) return;
  const recientes = historial().slice(-12).map(m => (m.r === 'yo' ? S.yo.n : 'Bubble') + ': ' + desarma(m.t).texto.slice(0, 500)).join('\n');
  const actuales = (p.notas || []).map(n => '- ' + n).join('\n') || '(nada todavía)';
  const r = await ia({
    system: 'Ayudas a una IA llamada Bubble a adaptarse a la personalidad de cada persona. Respondes solo con la lista pedida.',
    contents: [{ role: 'user', parts: [{ text: `Perfil actual de ${S.yo.n}:\n${actuales}\n\nConversación reciente:\n${recientes}\n\nDevuelve lo que Bubble debe recordar de esta persona: máximo 10 líneas cortas que empiecen con "- ". Conserva lo importante que ya estaba y agrega lo nuevo que dijo en la plática: cómo le gusta que le hablen, qué tanto detalle quiere, sus gustos (música, temas), su papel en el equipo, proyectos y pendientes que contó y cosas que pidió recordar. No incluyas contraseñas, direcciones, salud ni datos privados. Si no hay nada nuevo, devuelve lo mismo.` }] }],
    buscar: false
  });
  if (r.error || !r.texto) return;
  const notas = r.texto.split('\n').map(l => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(l => l && l.length < 200 && !/^\(nada/.test(l)).slice(0, 10);
  if (notas.length) { const q = perfil(); q.notas = notas; guardaPerfil(q); }
}

// ---------------------------------------------------------------- voz
// Dos formas de escuchar: el dictado del navegador (rápido) o grabar la voz y que
// Gemini la entienda (funciona en casi todos los celulares). Si el dictado falla,
// Bubble cambia sola a grabar.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, grab = null, sinDictado = false, noTeEscuche = 0, enConversacion = false;
const puedeGrabar = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
function formaDeEscuchar() {
  const a = ajustes().escucha;
  if (a === 'grabar' && puedeGrabar()) return 'grabar';
  if (SR && !sinDictado) return 'dictar';
  return puedeGrabar() ? 'grabar' : (SR ? 'dictar' : null);
}
function escuchar(op = {}) {
  if (grab) { grab.terminar(); return; }
  if (rec) { rec.stop(); return; }
  enConversacion = !!op.continua;
  detenVoz(); detenDespertar(true);
  const forma = formaDeEscuchar();
  if (!forma) { toast('Este navegador no deja usar el micrófono. Escribe tu mensaje.'); $('#chat-texto').focus(); return; }
  if (forma === 'grabar') { escucharGrabando(); return; }
  rec = new SR(); rec.lang = 'es-MX'; rec.interimResults = true; rec.continuous = false;
  let final = '', fallo = null;
  $('#btn-mic').classList.add('activo');
  estadoChat('escucha', 'Te escucho…');
  rec.onresult = e => {
    let parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else parcial += t;
    }
    $('#chat-texto').value = (final + parcial).trim(); ajustaAlto();
    burbujas.chat.nivel(0.4 + Math.random() * 0.6); burbujas.inicio.nivel(0.6);
  };
  rec.onerror = e => {
    fallo = e.error;
    if (e.error === 'not-allowed') toast('Bubble necesita permiso para usar el micrófono. Actívalo en los permisos del navegador.', 4000);
    else if (['network', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(e.error)) sinDictado = true;
  };
  rec.onend = () => {
    rec = null; $('#btn-mic').classList.remove('activo');
    burbujas.chat.nivel(0);
    const t = (final || $('#chat-texto').value).trim();
    const continua = enConversacion; enConversacion = false;
    if (t) { noTeEscuche = 0; enviar(t, { porVoz: true }); }
    else if (sinDictado && fallo !== 'not-allowed' && puedeGrabar()) { toast('Cambié a modo grabación para escucharte mejor.'); setTimeout(() => escucharGrabando(), 300); return; }
    else {
      estadoChat('reposo', '');
      if (!continua && fallo !== 'not-allowed' && fallo !== 'aborted') {
        noTeEscuche++;
        if (noTeEscuche >= 2 && puedeGrabar()) { sinDictado = true; noTeEscuche = 0; toast('No te escuché. Ahora Bubble grabará tu voz: toca el micrófono, habla y espera.', 4500); }
        else toast('No te escuché. Toca el micrófono e inténtalo otra vez.');
      }
    }
    if (ajustes().despertar) setTimeout(iniciaDespertar, 1500);
  };
  try { rec.start(); } catch (e) { rec = null; $('#btn-mic').classList.remove('activo'); if (puedeGrabar()) escucharGrabando(); else estadoChat('reposo', ''); }
}
async function escucharGrabando() {
  if (!puedeGrabar()) { toast('Este navegador no deja usar el micrófono. Escribe tu mensaje.'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { toast('Bubble necesita permiso para usar el micrófono. Actívalo en los permisos del navegador.', 4000); estadoChat('reposo', ''); return; }
  const tipo = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  let mr;
  try { mr = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined); } catch (e) { mr = new MediaRecorder(stream); }
  const trozos = [];
  mr.ondataavailable = e => { if (e.data && e.data.size) trozos.push(e.data); };
  let actx = null, an = null, buf = null, hablo = false, ultimoSonido = Date.now(), raf = 0;
  const inicio = Date.now();
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const fuente = actx.createMediaStreamSource(stream);
    an = actx.createAnalyser(); an.fftSize = 1024; fuente.connect(an); buf = new Uint8Array(an.fftSize);
  } catch (e) { an = null; }
  const continua = enConversacion; enConversacion = false;
  const terminar = () => { if (mr.state !== 'inactive') mr.stop(); };
  grab = { terminar };
  $('#btn-mic').classList.add('activo');
  estadoChat('escucha', 'Te escucho… toca el micrófono cuando termines');
  const mide = () => {
    const t = Date.now();
    if (an) {
      an.getByteTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; s += x * x; }
      const rms = Math.sqrt(s / buf.length);
      const nivel = Math.min(1, rms * 7); burbujas.chat.nivel(nivel); burbujas.inicio.nivel(nivel);
      if (rms > 0.035) { hablo = true; ultimoSonido = t; }
      if ((hablo && t - ultimoSonido > 1600) || (!hablo && t - inicio > 7000)) { terminar(); return; }
    }
    if (t - inicio > 30000) { terminar(); return; }
    raf = requestAnimationFrame(mide);
  };
  mr.onstop = async () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach(tr => tr.stop());
    try { actx?.close(); } catch (e) {}
    grab = null; $('#btn-mic').classList.remove('activo'); burbujas.chat.nivel(0); burbujas.inicio.nivel(0);
    if (an && !hablo) { estadoChat('reposo', ''); if (!continua) toast('No te escuché. Toca el micrófono e inténtalo otra vez.'); return; }
    const crudo = new Blob(trozos, { type: (mr.mimeType || tipo || 'audio/webm') });
    if (crudo.size < 1500) { estadoChat('reposo', ''); return; }
    estadoChat('piensa', 'Bubble está escuchando tu mensaje…');
    let audio;
    try { audio = { mime: 'audio/wav', datos: await blobABase64(await aWav(crudo)) }; }
    catch (e) { audio = { mime: (crudo.type || 'audio/webm').split(';')[0], datos: await blobABase64(crudo) }; }
    enviar('', { audio });
  };
  mr.start(250);
  raf = requestAnimationFrame(mide);
}
function blobABase64(b) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = rej; fr.readAsDataURL(b); }); }
// Convierte la grabación a WAV (16 kHz, mono): es el formato que Gemini entiende siempre
async function aWav(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const ab = await blob.arrayBuffer();
  const audio = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
  try { ctx.close(); } catch (e) {}
  const hz = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * hz)), hz);
  const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const dv = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const txt = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, hz, true);
  dv.setUint32(28, hz * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); txt(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) { const v = Math.max(-1, Math.min(1, pcm[i])); dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
  return new Blob([dv], { type: 'audio/wav' });
}
$('#btn-mic').onclick = () => escuchar();
// Tocar a Bubble no prende el micrófono: solo lo saluda. El micrófono se prende con su botón.
let tSonrisa = 0;
function sonrie(ms) { clearTimeout(tSonrisa); estadoChat('feliz', $('#chat-estado').textContent); tSonrisa = setTimeout(() => { if (!rec && !grab && !ocupado) estadoChat('reposo', ''); }, ms); }
$('#burbuja-chat').onclick = () => { if (rec || grab) return; sonrie(1400); $('#chat-texto').focus({ preventScroll: true }); };

function vozEs() {
  const vs = speechSynthesis.getVoices();
  return vs.find(v => /es[-_]MX/i.test(v.lang) && /Paulina|Google|Natural|Online/i.test(v.name))
    || vs.find(v => /es[-_]MX/i.test(v.lang))
    || vs.find(v => /es[-_](US|419)/i.test(v.lang))
    || vs.find(v => /^es/i.test(v.lang)) || null;
}
function paraVoz(t) {
  return t.replace(/```[\s\S]*?```/g, ' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/[*_#`>|]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 900);
}
const VOZ_ANIMO = { triste: [0.94, 1.02], estresado: [0.95, 1.04], cansado: [0.94, 1.02], enojado: [0.98, 1.02], feliz: [1.06, 1.16], emocionado: [1.1, 1.2], neutral: [1.03, 1.12] };
function habla(texto, animo = 'neutral') {
  const a = ajustes();
  if (!('speechSynthesis' in window) || a.voz === 'nunca' || (a.voz === 'cuando' && !ultimaPorVoz)) return;
  const t = paraVoz(texto); if (!t) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = 'es-MX'; const v = vozEs(); if (v) u.voice = v; const [vel, tono] = VOZ_ANIMO[animo] || VOZ_ANIMO.neutral; u.rate = vel; u.pitch = tono;
  u.onstart = () => estadoChat('habla', '');
  u.onboundary = () => { burbujas.chat.nivel(0.3 + Math.random() * 0.7); burbujas.inicio.nivel(0.3 + Math.random() * 0.7); };
  u.onend = () => {
    estadoChat('reposo', ''); burbujas.chat.nivel(0);
    // Conversación: después de contestar en voz alta, vuelve a escuchar
    if (ultimaPorVoz && ajustes().conversacion === true && abiertas.includes('chat') && !document.hidden && !rec && !grab && !ocupado) setTimeout(() => escuchar({ continua: true }), 450);
  };
  u.onerror = () => { estadoChat('reposo', ''); burbujas.chat.nivel(0); };
  speechSynthesis.speak(u);
}
function detenVoz() { try { speechSynthesis.cancel(); } catch (e) {} }
try { speechSynthesis.onvoiceschanged = () => {}; } catch (e) {}

// Despertar con "Bubble"
let recDesp = null, despActivo = false;
function iniciaDespertar() {
  if (!SR || sinDictado || !S.yo || !ajustes().despertar || rec || grab || recDesp) return;
  despActivo = true;
  recDesp = new SR(); recDesp.lang = 'es-MX'; recDesp.continuous = true; recDesp.interimResults = true;
  recDesp.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (/\b(bubble|bubel|babel|bable|búbol|bubol|burbuja)\b/i.test(e.results[i][0].transcript)) {
        detenDespertar(true); abre('chat'); setTimeout(() => escuchar(), 300); return;
      }
    }
  };
  recDesp.onend = () => { recDesp = null; if (despActivo && !rec && !grab) setTimeout(iniciaDespertar, 800); };
  recDesp.onerror = e => { if (e.error === 'not-allowed') { despActivo = false; toast('Para despertar con «Bubble» hace falta permiso de micrófono.'); } };
  try { recDesp.start(); } catch (e) { recDesp = null; }
}
function detenDespertar(temporal) {
  if (!temporal) despActivo = false;
  const r = recDesp; recDesp = null;
  if (r) { r.onend = null; try { r.abort(); } catch (e) {} }
  if (temporal) despActivo = false;
}

// ---------------------------------------------------------------- editor de gráficas
let G = null, gChart = null;
const G_INICIAL = () => ({ titulo: 'Manglar en México', tipo: 'barras', ejeX: 'Año', ejeY: 'Hectáreas', fuente: 'CONABIO 2025', series: ['Hectáreas de manglar'], filas: [{ e: '2020', v: [905086] }, { e: '2025', v: [877464] }] });
function editorAGraf() {
  return { tipo: G.tipo, titulo: G.titulo, ejeX: G.ejeX, ejeY: G.ejeY, fuente: G.fuente, etiquetas: G.filas.map(f => f.e), series: G.series.map((n, i) => ({ nombre: n, datos: G.filas.map(f => f.v[i]) })) };
}
function cargaEnEditor(g) {
  G = { titulo: g.titulo, tipo: g.tipo, ejeX: g.ejeX, ejeY: g.ejeY, fuente: g.fuente, series: g.series.map(s => s.nombre), filas: g.etiquetas.map((e, j) => ({ e, v: g.series.map(s => s.datos[j]) })) };
  if (!G.series.length) G.series = ['Serie 1'];
  guardaU('graf-actual', G);
  if (abiertas.includes('graficas')) pintaEditor();
}
function pintaEditor() {
  $('#g-titulo').value = G.titulo; $('#g-ejex').value = G.ejeX; $('#g-ejey').value = G.ejeY; $('#g-fuente').value = G.fuente;
  $$('#g-tipo button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === G.tipo)));
  const t = $('#g-tabla');
  let html = '<thead><tr><th>Etiqueta</th>' + G.series.map((s, i) => `<th><input type="text" data-serie="${i}" value="${escapa(s)}" aria-label="Nombre de la serie ${i + 1}"></th>`).join('') + '<th></th></tr></thead><tbody>';
  G.filas.forEach((f, r) => {
    html += `<tr><td><input type="text" data-f="${r}" data-c="e" value="${escapa(f.e)}" aria-label="Etiqueta ${r + 1}"></td>` +
      G.series.map((_, i) => `<td><input type="text" inputmode="decimal" data-f="${r}" data-c="${i}" value="${f.v[i] ?? ''}" aria-label="Valor ${r + 1}"></td>`).join('') +
      `<td><button class="quitar" type="button" data-quita="${r}" aria-label="Quitar fila">×</button></td></tr>`;
  });
  t.innerHTML = html + '</tbody>';
  redibujaEditor();
}
function redibujaEditor() { gChart = dibujaGrafica($('#g-canvas'), editorAGraf(), gChart); guardaU('graf-actual', G); }
$('#g-tabla').addEventListener('input', e => {
  const x = e.target;
  if (x.dataset.serie != null) G.series[+x.dataset.serie] = x.value;
  else if (x.dataset.f != null) { const f = G.filas[+x.dataset.f]; if (x.dataset.c === 'e') f.e = x.value; else f.v[+x.dataset.c] = limpiaNum(x.value); }
  redibujaEditor();
});
$('#g-tabla').addEventListener('click', e => { const q = e.target.closest('[data-quita]'); if (q) { G.filas.splice(+q.dataset.quita, 1); pintaEditor(); } });
['titulo', 'ejex', 'ejey', 'fuente'].forEach(k => $('#g-' + k).addEventListener('input', e => { G[{ titulo: 'titulo', ejex: 'ejeX', ejey: 'ejeY', fuente: 'fuente' }[k]] = e.target.value; redibujaEditor(); }));
$$('#g-tipo button').forEach(b => b.onclick = () => { G.tipo = b.dataset.v; pintaEditor(); });
$('#g-fila').onclick = () => { G.filas.push({ e: '', v: G.series.map(() => null) }); pintaEditor(); $$('#g-tabla tbody tr:last-child input')[0]?.focus(); };
$('#g-serie').onclick = () => { if (G.series.length >= 6) return toast('Máximo 6 series.'); G.series.push(`Serie ${G.series.length + 1}`); G.filas.forEach(f => f.v.push(null)); pintaEditor(); };
$('#g-pegar-btn').onclick = () => { $('#g-pegar').hidden = !$('#g-pegar').hidden; if (!$('#g-pegar').hidden) $('#g-pegar-txt').focus(); };
$('#g-pegar-ok').onclick = () => {
  const filas = $('#g-pegar-txt').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => l.includes('\t') ? l.split('\t') : l.split(/;|,(?=\s*[^\d\s])|,\s+/));
  if (!filas.length) return;
  let enc = null;
  if (filas.length > 1 && filas[0].slice(1).every(c => limpiaNum(c) == null)) enc = filas.shift();
  const nSer = Math.max(1, ...filas.map(f => f.length - 1));
  G.series = Array.from({ length: Math.min(6, nSer) }, (_, i) => (enc && enc[i + 1]) ? enc[i + 1].trim() : `Serie ${i + 1}`);
  G.filas = filas.map(f => ({ e: (f[0] || '').trim(), v: G.series.map((_, i) => limpiaNum(f[i + 1])) }));
  $('#g-pegar').hidden = true; $('#g-pegar-txt').value = '';
  pintaEditor(); toast('Datos listos.');
};
$('#g-descargar').onclick = () => {
  const c = $('#g-canvas'); const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const x = o.getContext('2d'); x.fillStyle = cssVar('--superficie') || '#fff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0);
  const a = document.createElement('a'); a.href = o.toDataURL('image/png'); a.download = (G.titulo || 'grafica').replace(/[^\w\- áéíóúñ]/gi, '').trim() + '.png'; a.click();
};
async function pideGrafica(boton, prompt, buscar) {
  boton.disabled = true; const txt = boton.textContent; boton.textContent = 'Bubble está trabajando…';
  burbujas.chat.estado('piensa');
  const r = await ia({ system: sistema(), contents: [{ role: 'user', parts: [{ text: prompt }] }], buscar });
  boton.disabled = false; boton.textContent = txt; burbujas.chat.estado('reposo');
  if (r.error || !r.texto) { toast(textoError(r.error), 4000); return; }
  const { texto, graficas } = desarma(r.texto);
  if (graficas[0]) cargaEnEditor(normaGraf(graficas[0]));
  const c = $('#g-consejos'); c.hidden = false;
  c.innerHTML = '<h3>Bubble dice</h3>' + formato(texto || 'Listo, ya quedó la gráfica.');
  if (r.fuentes?.length) {
    const fu = document.createElement('div'); fu.className = 'fuentes';
    r.fuentes.slice(0, 8).forEach(x => { const a = document.createElement('a'); a.href = x.u; a.target = '_blank'; a.rel = 'noopener'; a.textContent = x.t || 'Fuente'; fu.appendChild(a); });
    c.appendChild(fu);
  }
  pintaEditor();
}
$('#g-mejorar').onclick = e => pideGrafica(e.currentTarget,
  `Mejora esta gráfica para una presentación del equipo. NO cambies los números ni las etiquetas de los datos. Puedes mejorar el título, los nombres de los ejes, el tipo de gráfica y los nombres de las series. Da de 2 a 4 consejos cortos de por qué y devuelve la gráfica mejorada en el bloque grafica.\n\nGráfica actual:\n${JSON.stringify(editorAGraf())}`, false);
$('#g-hacer').onclick = e => {
  const p = $('#g-pide').value.trim(); if (!p) { $('#g-pide').focus(); return; }
  pideGrafica(e.currentTarget, `Haz una gráfica con esto. Si son datos que te doy, úsalos tal cual. Si hay que buscarlos, usa fuentes confiables y pon la fuente. Explica en 1 o 2 frases y devuelve la gráfica en el bloque grafica.\n\n${p}`, true);
};
function pintaGuardadas() {
  const l = $('#g-lista'); const lista = leeU('graficas', []);
  l.innerHTML = lista.length ? '' : '<p class="nota">Aquí aparecen las gráficas que guardes.</p>';
  lista.forEach((g, i) => {
    const f = document.createElement('div'); f.className = 'fila';
    f.innerHTML = `<button class="btn btn-chico" type="button" style="flex:1;justify-content:flex-start">${escapa(g.nombre)}</button><button class="btn btn-icono" type="button" aria-label="Borrar ${escapa(g.nombre)}">×</button>`;
    f.children[0].onclick = () => { G = JSON.parse(JSON.stringify(g.G)); pintaEditor(); toast('Gráfica abierta.'); };
    f.children[1].onclick = () => { const x = leeU('graficas', []); x.splice(i, 1); guardaU('graficas', x); pintaGuardadas(); };
    l.appendChild(f);
  });
}
$('#g-guardar').onclick = () => {
  const nombre = $('#g-nombre').value.trim() || G.titulo || 'Gráfica';
  const lista = leeU('graficas', []).filter(x => x.nombre !== nombre);
  lista.unshift({ nombre, G: JSON.parse(JSON.stringify(G)) });
  guardaU('graficas', lista.slice(0, 30)); $('#g-nombre').value = ''; pintaGuardadas(); toast('Gráfica guardada.');
};
alAbrir.graficas = () => { if (!G) G = leeU('graf-actual', null) || G_INICIAL(); pintaEditor(); pintaGuardadas(); };

// ---------------------------------------------------------------- recorridos del robot
const R_DEF = () => ({ ancho: 200, alto: 120, rumbo: 0, rueda: 5.6, vel: 20, velGiro: 90, a45: true, puntos: [], foto: null });
let RB = null, fotoImg = null, arrastra = -1;
const norm180 = a => { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; };
const rumboDe = (a, b) => Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI;
function calculaRuta(puntos, rumbo0) {
  const pasos = []; let rumbo = rumbo0, total = 0, giros = 0, girado = 0;
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1], b = puntos[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y); if (d < 0.05) continue;
    const r = rumboDe(a, b); const giro = norm180(r - rumbo);
    if (Math.abs(giro) >= 0.5) { pasos.push({ tipo: 'gira', grados: Math.abs(giro), lado: giro > 0 ? 'izquierda' : 'derecha' }); giros++; girado += Math.abs(giro); }
    pasos.push({ tipo: 'avanza', cm: d }); total += d; rumbo = r;
  }
  return { pasos, total, giros, girado };
}
function textoPaso(p, rueda) {
  if (p.tipo === 'gira') return `Gira ${num(p.grados, 0)}° a la ${p.lado}`;
  const g = rueda > 0 ? Math.round(p.cm / (Math.PI * rueda) * 360) : null;
  return `Avanza ${num(p.cm, 1)} cm${g ? ` <small>(${num(g)}° de motor)</small>` : ''}`;
}
function ajusta45(prev, p) {
  const d = Math.hypot(p.x - prev.x, p.y - prev.y);
  const a = Math.round(rumboDe(prev, p) / 45) * 45 * Math.PI / 180;
  return { x: prev.x + Math.cos(a) * d, y: prev.y - Math.sin(a) * d };
}
const limita = p => ({ x: Math.max(0, Math.min(RB.ancho, Math.round(p.x * 2) / 2)), y: Math.max(0, Math.min(RB.alto, Math.round(p.y * 2) / 2)) });
function guardaRB() { const c = { ...RB }; guardaU('robot-actual', c); }
function pintaRobot() {
  const cv = $('#r-pista');
  const w = cv.clientWidth || 600; const dpr = Math.min(devicePixelRatio || 1, 2);
  const h = w * RB.alto / RB.ancho;
  cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const x = cv.getContext('2d'); const k = cv.width / RB.ancho;
  x.clearRect(0, 0, cv.width, cv.height);
  if (fotoImg) { x.globalAlpha = 0.9; x.drawImage(fotoImg, 0, 0, cv.width, cv.height); x.globalAlpha = 1; }
  // cuadrícula
  for (let cm = 0; cm <= RB.ancho; cm += 10) { x.strokeStyle = cm % 50 ? 'rgba(14,90,80,.10)' : 'rgba(14,90,80,.25)'; x.lineWidth = 1; x.beginPath(); x.moveTo(cm * k, 0); x.lineTo(cm * k, cv.height); x.stroke(); }
  for (let cm = 0; cm <= RB.alto; cm += 10) { x.strokeStyle = cm % 50 ? 'rgba(14,90,80,.10)' : 'rgba(14,90,80,.25)'; x.beginPath(); x.moveTo(0, cm * k); x.lineTo(cv.width, cm * k); x.stroke(); }
  x.fillStyle = 'rgba(14,90,80,.55)'; x.font = `${11 * dpr}px ${getComputedStyle(document.body).fontFamily}`;
  for (let cm = 50; cm < RB.ancho; cm += 50) x.fillText(cm + ' cm', cm * k + 3 * dpr, 12 * dpr);
  const P = RB.puntos;
  // camino
  if (P.length > 1) {
    x.strokeStyle = '#0E8F7E'; x.lineWidth = 4 * dpr; x.lineJoin = 'round'; x.lineCap = 'round';
    x.beginPath(); P.forEach((p, i) => i ? x.lineTo(p.x * k, p.y * k) : x.moveTo(p.x * k, p.y * k)); x.stroke();
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i]; const d = Math.hypot(b.x - a.x, b.y - a.y); if (d < 1) continue;
      const mx = (a.x + b.x) / 2 * k, my = (a.y + b.y) / 2 * k; const ang = Math.atan2(b.y - a.y, b.x - a.x);
      x.save(); x.translate(mx, my); x.rotate(ang); x.fillStyle = '#0E8F7E';
      x.beginPath(); x.moveTo(7 * dpr, 0); x.lineTo(-5 * dpr, -6 * dpr); x.lineTo(-5 * dpr, 6 * dpr); x.closePath(); x.fill(); x.restore();
      const etiqueta = num(d, 1) + ' cm'; x.font = `600 ${11.5 * dpr}px ${getComputedStyle(document.body).fontFamily}`;
      const tw = x.measureText(etiqueta).width + 10 * dpr; const ox = Math.sin(ang) * 14 * dpr, oy = -Math.cos(ang) * 14 * dpr;
      x.fillStyle = 'rgba(255,255,255,.92)'; x.beginPath(); (x.roundRect ? x.roundRect(mx + ox - tw / 2, my + oy - 10 * dpr, tw, 20 * dpr, 10 * dpr) : x.rect(mx + ox - tw / 2, my + oy - 10 * dpr, tw, 20 * dpr)); x.fill();
      x.fillStyle = '#0A6E61'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(etiqueta, mx + ox, my + oy); x.textAlign = 'start'; x.textBaseline = 'alphabetic';
    }
  }
  // puntos
  P.forEach((p, i) => {
    x.beginPath(); x.arc(p.x * k, p.y * k, (i === 0 ? 9 : 7) * dpr, 0, Math.PI * 2);
    x.fillStyle = i === 0 ? '#E8930C' : i === P.length - 1 ? '#7A5CFA' : '#fff'; x.fill();
    x.lineWidth = 3 * dpr; x.strokeStyle = i === 0 ? '#fff' : '#0E8F7E'; x.stroke();
  });
  // robot en el inicio
  if (P.length) {
    const p = P[0]; const a = -RB.rumbo * Math.PI / 180;
    x.save(); x.translate(p.x * k, p.y * k); x.rotate(a);
    x.fillStyle = 'rgba(232,147,12,.9)'; x.beginPath(); x.moveTo(24 * dpr, 0); x.lineTo(12 * dpr, -7 * dpr); x.lineTo(12 * dpr, 7 * dpr); x.closePath(); x.fill(); x.restore();
  }
  // pasos y resumen
  const ruta = calculaRuta(P, RB.rumbo);
  $('#r-pasos').innerHTML = ruta.pasos.length ? ruta.pasos.map(p => `<li>${textoPaso(p, RB.rueda)}</li>`).join('') : '<p class="nota" style="margin-left:-1.6em">Todavía no hay pasos.</p>';
  $('#r-dist').textContent = num(ruta.total, 0);
  $('#r-giros').textContent = ruta.giros;
  const seg = ruta.total / Math.max(1, RB.vel) + ruta.girado / Math.max(1, RB.velGiro);
  $('#r-tiempo').textContent = seg < 60 ? num(seg, 1) + ' s' : `${Math.floor(seg / 60)} min ${Math.round(seg % 60)} s`;
  $('#r-ayuda').textContent = P.length ? 'Toca para agregar otro punto. Arrastra un punto para moverlo.' : 'Toca la pista para poner el inicio del robot y luego cada punto por donde debe pasar.';
  $('#r-quitar-foto').hidden = !RB.foto;
  guardaRB();
}
function aCm(e) {
  const r = $('#r-pista').getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * RB.ancho, y: (e.clientY - r.top) / r.height * RB.alto };
}
$('#r-pista').addEventListener('pointerdown', e => {
  e.preventDefault();
  const p = aCm(e); const r = $('#r-pista').getBoundingClientRect(); const cmPorPx = RB.ancho / r.width;
  const i = RB.puntos.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < 14 * cmPorPx);
  if (i >= 0) { arrastra = i; $('#r-pista').setPointerCapture(e.pointerId); return; }
  let n = limita(p);
  if (RB.a45 && RB.puntos.length) n = limita(ajusta45(RB.puntos[RB.puntos.length - 1], n));
  RB.puntos.push(n); pintaRobot();
});
$('#r-pista').addEventListener('pointermove', e => {
  if (arrastra < 0) return;
  let n = limita(aCm(e));
  if (RB.a45 && arrastra > 0) n = limita(ajusta45(RB.puntos[arrastra - 1], n));
  RB.puntos[arrastra] = n; pintaRobot();
});
['pointerup', 'pointercancel'].forEach(t => $('#r-pista').addEventListener(t, () => { arrastra = -1; }));
$('#r-deshacer').onclick = () => { RB.puntos.pop(); pintaRobot(); };
$('#r-borrar').onclick = () => { if (!RB.puntos.length) return; if (confirmaSuave('r-borrar')) { RB.puntos = []; pintaRobot(); } };
function confirmaSuave(id) {
  const b = document.getElementById(id);
  if (b.dataset.seguro === '1') { b.dataset.seguro = ''; b.textContent = b.dataset.txt; return true; }
  b.dataset.txt = b.textContent; b.dataset.seguro = '1'; b.textContent = '¿Seguro? Toca otra vez';
  setTimeout(() => { if (b.dataset.seguro === '1') { b.dataset.seguro = ''; b.textContent = b.dataset.txt; } }, 3000);
  return false;
}
$('#r-optimizar').onclick = () => {
  const antes = calculaRuta(RB.puntos, RB.rumbo); const n0 = RB.puntos.length;
  let P = RB.puntos.filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) >= 1);
  let cambio = true;
  while (cambio && P.length > 2) {
    cambio = false;
    for (let i = 1; i < P.length - 1; i++) {
      const g = norm180(rumboDe(P[i], P[i + 1]) - rumboDe(P[i - 1], P[i]));
      if (Math.abs(g) < 4) { P.splice(i, 1); cambio = true; break; }
    }
  }
  if (RB.a45) for (let i = 1; i < P.length; i++) P[i] = limita(ajusta45(P[i - 1], P[i]));
  RB.puntos = P; pintaRobot();
  const desp = calculaRuta(P, RB.rumbo);
  toast(`Optimizado: ${n0 - P.length} puntos menos, ${antes.giros - desp.giros} giros menos.`, 3500);
};
function textoRuta() {
  const ruta = calculaRuta(RB.puntos, RB.rumbo);
  return ruta.pasos.map((p, i) => `${i + 1}. ${textoPaso(p, RB.rueda).replace(/<\/?small>/g, '')}`).join('\n');
}
$('#r-copiar').onclick = async () => {
  const t = textoRuta(); if (!t) return toast('Primero dibuja el recorrido.');
  try { await navigator.clipboard.writeText(t); toast('Pasos copiados.'); } catch (e) { toast('No se pudo copiar.'); }
};
function contextoRobot() {
  const ruta = calculaRuta(RB.puntos, RB.rumbo);
  return `Datos del recorrido (hechos en la app Recorridos):\n- Pista: ${RB.ancho} × ${RB.alto} cm\n- Rueda: ${RB.rueda} cm de diámetro\n- Velocidad: ${RB.vel} cm/s\n- El robot empieza mirando hacia ${({ 0: 'la derecha', 90: 'arriba', 180: 'la izquierda', 270: 'abajo' })[RB.rumbo]}\n- Puntos (cm, x a la derecha, y hacia abajo): ${RB.puntos.map(p => `(${num(p.x, 1)}, ${num(p.y, 1)})`).join(' → ')}\n- Distancia total: ${num(ruta.total, 1)} cm, ${ruta.giros} giros\nPasos:\n${textoRuta()}`;
}
$('#r-codigo').onclick = () => {
  if (RB.puntos.length < 2) return toast('Primero dibuja el recorrido.');
  const tipo = $('#r-tipo').value;
  preguntar(`Hazme el código para que mi robot ${tipo} haga este recorrido. Explica dónde cambiar los puertos de los motores y cómo calibrar los giros.`, { contexto: contextoRobot(), buscar: true });
};
$('#r-mejora').onclick = () => {
  if (RB.puntos.length < 2) return toast('Primero dibuja el recorrido.');
  preguntar(`Revisa este recorrido del robot y dime cómo mejorarlo para que sea más rápido y más preciso (menos giros, giros más fáciles, alinearse con la pared, seguir líneas, etc.).`, { contexto: contextoRobot(), buscar: false });
};
function leeCamposRobot() {
  const v = (id, d, min, max) => { const n = parseFloat($(id).value); return isFinite(n) ? Math.max(min, Math.min(max, n)) : d; };
  RB.ancho = v('#r-ancho', 200, 20, 1000); RB.alto = v('#r-alto', 120, 20, 1000); RB.rueda = v('#r-rueda', 5.6, 1, 30); RB.vel = v('#r-vel', 20, 1, 200);
  RB.rumbo = +$('#r-rumbo').value; RB.a45 = $('#r-45').checked;
  RB.puntos = RB.puntos.map(limita); pintaRobot();
}
['#r-ancho', '#r-alto', '#r-rueda', '#r-vel'].forEach(id => $(id).addEventListener('change', leeCamposRobot));
$('#r-rumbo').addEventListener('change', leeCamposRobot); $('#r-45').addEventListener('change', leeCamposRobot);
$('#r-foto').addEventListener('change', e => {
  const f = e.target.files?.[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const max = 1200; const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    RB.foto = c.toDataURL('image/jpeg', 0.72); cargaFoto(); URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f); e.target.value = '';
});
$('#r-quitar-foto').onclick = () => { RB.foto = null; fotoImg = null; pintaRobot(); };
function cargaFoto() { if (!RB.foto) { fotoImg = null; pintaRobot(); return; } const i = new Image(); i.onload = () => { fotoImg = i; pintaRobot(); }; i.src = RB.foto; }
function pintaCamposRobot() {
  $('#r-ancho').value = RB.ancho; $('#r-alto').value = RB.alto; $('#r-rueda').value = RB.rueda; $('#r-vel').value = RB.vel;
  $('#r-rumbo').value = String(RB.rumbo); $('#r-45').checked = RB.a45;
}
function pintaRutasGuardadas() {
  const l = $('#r-lista'); const lista = leeU('rutas', []);
  l.innerHTML = lista.length ? '' : '<p class="nota">Aquí aparecen los recorridos que guardes.</p>';
  lista.forEach((g, i) => {
    const f = document.createElement('div'); f.className = 'fila';
    f.innerHTML = `<button class="btn btn-chico" type="button" style="flex:1;justify-content:flex-start">${escapa(g.nombre)}</button><button class="btn btn-icono" type="button" aria-label="Borrar ${escapa(g.nombre)}">×</button>`;
    f.children[0].onclick = () => { RB = Object.assign(R_DEF(), JSON.parse(JSON.stringify(g.RB))); pintaCamposRobot(); cargaFoto(); toast('Recorrido abierto.'); };
    f.children[1].onclick = () => { const x = leeU('rutas', []); x.splice(i, 1); guardaU('rutas', x); pintaRutasGuardadas(); };
    l.appendChild(f);
  });
}
$('#r-guardar').onclick = () => {
  const nombre = $('#r-nombre').value.trim() || `Recorrido ${new Date().toLocaleDateString('es-MX')}`;
  const lista = leeU('rutas', []).filter(x => x.nombre !== nombre);
  lista.unshift({ nombre, RB: JSON.parse(JSON.stringify(RB)) });
  if (!guardaU('rutas', lista.slice(0, 20))) { const sin = { ...RB, foto: null }; lista[0].RB = sin; guardaU('rutas', lista.slice(0, 20)); toast('Guardado (sin la foto, no cabía).'); }
  else toast('Recorrido guardado.');
  $('#r-nombre').value = ''; pintaRutasGuardadas();
};
alAbrir.robot = () => {
  if (!RB) RB = Object.assign(R_DEF(), leeU('robot-actual', {}));
  pintaCamposRobot(); pintaRutasGuardadas();
  requestAnimationFrame(() => cargaFoto());
};
window.addEventListener('resize', () => { if (abiertas.includes('robot')) pintaRobot(); });

// ---------------------------------------------------------------- manglares
let mangCharts = [];
const MANG_IDEAS = [
  '¿Cuántas especies de animales viven en los manglares de México?',
  '¿Hay datos de cuántos animales mueren al día en los manglares?',
  'Estadísticas de los estuarios de México',
  '¿Qué especies de los manglares están en peligro?',
  'Haz una gráfica del manglar por estado de México',
  'Historia de los manglares de la Laguna Madre, Tamaulipas'
];
alAbrir.manglares = () => {
  $('#mang-datos').innerHTML = DATOS.map((d, i) => `<div class="dato"><div class="dato-num">${escapa(d.n)}</div><p>${escapa(d.t)}</p><a class="fuente-link" href="${escapa(d.f.u)}" target="_blank" rel="noopener">${escapa(d.f.t)}</a></div>`).join('');
  $('#mang-especies').innerHTML = ESPECIES.map(e => `<div class="especie"><strong>${escapa(e.c)}</strong><em>${escapa(e.s)}</em></div>`).join('');
  const ideas = $('#mang-ideas'); ideas.innerHTML = '';
  MANG_IDEAS.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t; b.onclick = () => preguntar(t); ideas.appendChild(b); });
  mangCharts.forEach(c => c.destroy()); mangCharts = [];
  requestAnimationFrame(() => {
    const a = dibujaGrafica($('#mang-g1'), { tipo: 'barras', titulo: '', etiquetas: ['2020', '2025'], series: [{ nombre: 'Hectáreas', datos: [905086, 877464] }], ejeY: 'Hectáreas', fuente: 'CONABIO, Manglares de México 2025' });
    const b = dibujaGrafica($('#mang-g2'), { tipo: 'dona', titulo: '', etiquetas: ['Riesgo alto (en peligro o en peligro crítico)', 'Vulnerables', 'No clasificados en riesgo'], series: [{ nombre: '% de ecosistemas', datos: [19.6, 30.4, 50] }], fuente: 'UICN 2024' });
    mangCharts = [a, b].filter(Boolean);
  });
};
$('#form-mang').addEventListener('submit', e => { e.preventDefault(); const q = $('#mang-q').value.trim(); if (q) { $('#mang-q').value = ''; preguntar(q); } });

// ---------------------------------------------------------------- fechas del libro (miércoles y sábado)
const DIAS_LIBRO = [3, 6];
function fechaISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function deISO(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12); }
function diaLibroCercano(d = new Date()) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); while (!DIAS_LIBRO.includes(x.getDay())) x.setDate(x.getDate() + 1); return x; }
function otroDiaLibro(x, dir) { const y = new Date(x); do { y.setDate(y.getDate() + dir); } while (!DIAS_LIBRO.includes(y.getDay())); return y; }
function fechaLarga(d) { const s = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); }
function persona(u) { return S.usuarios.find(x => x.u === u) || { u, n: nombreBonito(u || '?'), c: '#8E8E93' }; }
const puedeBorrar = autor => !!S.yo && (autor === S.yo.u || S.usuarios[0]?.u === S.yo.u);

// ---------------------------------------------------------------- imágenes
function cargaImagen(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function aJPEG(img, max, q) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * s)); c.height = Math.max(1, Math.round(h0 * s));
  const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
async function archivoAImagenes(file) {
  const url = URL.createObjectURL(file);
  try { const img = await cargaImagen(url); return { imagen: aJPEG(img, 1600, 0.82), mini: aJPEG(img, 360, 0.72), img }; }
  finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}
async function svgAImagenes(svg) {
  const vb = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  const vw = vb ? +vb[1] : 800, vh = vb ? +vb[2] : 600;
  const W = 1200, H = Math.max(1, Math.round(W * vh / vw));
  const s = svg.replace(/<svg([^>]*)>/i, (m, a) => '<svg' + a.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '') + ` width="${W}" height="${H}">`);
  const img = await cargaImagen(svgURL(s));
  return { imagen: aJPEG(img, 1200, 0.9), mini: aJPEG(img, 360, 0.75) };
}
function coloresDeImagen(img) {
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 48, 48);
  const d = x.getImageData(0, 0, 48, 48).data; const cubos = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 128 || (r > 232 && g > 232 && b > 232)) continue;
    const k = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const e = cubos.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; cubos.set(k, e);
  }
  const lista = [...cubos.values()].sort((a, b) => b.n - a.n).map(e => [e.r / e.n, e.g / e.n, e.b / e.n]);
  const elegidos = [];
  for (const col of lista) { if (elegidos.every(o => Math.hypot(o[0] - col[0], o[1] - col[1], o[2] - col[2]) > 70)) elegidos.push(col); if (elegidos.length === 3) break; }
  return elegidos.map(col => '#' + col.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''));
}

// ---------------------------------------------------------------- almacén de fotos y libro
// En el servidor (Netlify) todo se comparte entre todas las cuentas.
// Sin servidor, se guarda solo en este dispositivo (IndexedDB).
const BD = {
  _db: null,
  abre() {
    if (!this._db) this._db = new Promise((res, rej) => { const r = indexedDB.open('bubble', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return this._db;
  },
  async op(modo, fn) { const db = await this.abre(); return new Promise((res, rej) => { const tx = db.transaction('kv', modo); const q = fn(tx.objectStore('kv')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }); },
  get(k) { return this.op('readonly', st => st.get(k)); },
  set(k, v) { return this.op('readwrite', st => st.put(v, k)); },
  del(k) { return this.op('readwrite', st => st.delete(k)); },
  claves(p) { return this.op('readonly', st => st.getAllKeys(IDBKeyRange.bound(p, p + '￿'))); }
};
const azar = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
function leeIdFoto(id) { const [ts, , album, autor] = String(id).split('_'); return { id, ts: parseInt(ts, 36) || 0, album, autor }; }
const urlsLocales = new Map();
const Almacen = {
  compartido() { return S.modo === 'servidor' && S.compartido; },
  async api(ruta, cuerpo) {
    try {
      const r = await fetch('api/' + ruta, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: S.yo.token, ...cuerpo }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { toast('Tu sesión terminó. Vuelve a entrar.'); setTimeout(salir, 1200); }
      return r.ok ? { ok: true, ...d } : { ok: false, error: d.error || 'servidor' };
    } catch (e) { return { ok: false, error: 'sin_conexion' }; }
  },
  async apiGet(ruta, params = {}) {
    try {
      const r = await fetch('api/' + ruta + '?' + new URLSearchParams({ t: S.yo.token, ...params }), { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      return r.ok ? { ok: true, ...d } : { ok: false, error: d.error || 'servidor' };
    } catch (e) { return { ok: false, error: 'sin_conexion' }; }
  },
  async fotos() {
    if (this.compartido()) return this.apiGet('fotos');
    try { const ks = await BD.claves('m/'); return { ok: true, fotos: ks.map(k => leeIdFoto(k.slice(2))).filter(f => f.album !== 'logo').sort((a, b) => b.ts - a.ts) }; }
    catch (e) { return { ok: false, error: 'local' }; }
  },
  async urlFoto(id, mini) {
    if (this.compartido()) return 'api/foto?' + new URLSearchParams({ id, t: S.yo.token, ...(mini ? { mini: '1' } : {}) });
    const k = (mini ? 'm/' : 'f/') + id;
    if (urlsLocales.has(k)) return urlsLocales.get(k);
    const v = await BD.get(k).catch(() => null); if (!v) return '';
    const u = URL.createObjectURL(v.blob); urlsLocales.set(k, u); return u;
  },
  async infoFoto(id) {
    if (this.compartido()) return this.apiGet('foto', { id, info: '1' });
    const v = await BD.get('f/' + id).catch(() => null); return { ok: !!v, ...leeIdFoto(id), desc: v?.desc || '' };
  },
  async subeFoto({ album, imagen, mini, desc = '' }) {
    if (this.compartido()) return this.api('fotos', { album, imagen, mini, desc });
    try {
      const id = `${Date.now().toString(36)}_${azar(4)}_${album}_${S.yo.u}`;
      await BD.set('f/' + id, { blob: await (await fetch(imagen)).blob(), desc });
      await BD.set('m/' + id, { blob: await (await fetch(mini)).blob() });
      return { ok: true, foto: leeIdFoto(id) };
    } catch (e) { return { ok: false, error: 'local' }; }
  },
  async borraFoto(id) { if (this.compartido()) return this.api('foto-borrar', { id }); await BD.del('f/' + id); await BD.del('m/' + id); return { ok: true }; },
  async album() { if (this.compartido()) return this.apiGet('album'); return { ok: true, ...lee('local:album', { colores: [], logo: null }) }; },
  async guardaAlbum(c) { if (this.compartido()) return this.api('album', c); guarda('local:album', c); return { ok: true, ...c }; },
  async libro(fecha) {
    if (this.compartido()) return this.apiGet('libro', { fecha });
    try {
      const ks = await BD.claves(`n/${fecha}/`); const notas = [];
      for (const k of ks) { const n = await BD.get(k); if (n) notas.push({ ...n, id: k.split('/')[2] }); }
      return { ok: true, fecha, notas: notas.sort((a, b) => a.ts - b.ts) };
    } catch (e) { return { ok: false, error: 'local' }; }
  },
  async indiceLibro() {
    if (this.compartido()) return this.apiGet('libro-indice');
    try {
      const ks = await BD.claves('n/'); const c = {};
      ks.forEach(k => { const f = k.split('/')[1]; c[f] = (c[f] || 0) + 1; });
      return { ok: true, paginas: Object.entries(c).map(([fecha, n]) => ({ fecha, n })).sort((a, b) => b.fecha.localeCompare(a.fecha)) };
    } catch (e) { return { ok: false, error: 'local' }; }
  },
  async agregaNota(fecha, texto) {
    if (this.compartido()) return this.api('nota', { fecha, texto });
    try {
      const id = `${Date.now().toString(36)}_${azar(3)}_${S.yo.u}`;
      const nota = { texto: String(texto).slice(0, 3000), autor: S.yo.u, ts: Date.now() };
      await BD.set(`n/${fecha}/${id}`, nota); return { ok: true, nota: { ...nota, id } };
    } catch (e) { return { ok: false, error: 'local' }; }
  },
  async borraNota(fecha, id) { if (this.compartido()) return this.api('nota-borrar', { fecha, id }); await BD.del(`n/${fecha}/${id}`); return { ok: true }; }
};
const avisoCompartido = () => Almacen.compartido() ? 'Compartido con todo el equipo' : 'Solo en este dispositivo. Para compartir con el equipo, súbela con «Actualizar Bubble».';

// ---------------------------------------------------------------- Fotos
let fAlbum = 'todas', fLista = [], fVisorI = -1, fTimer = 0;
const NOMBRE_ALBUM = { general: 'General', machaca: 'Machaca', bubble: 'Dibujos de Bubble' };
alAbrir.fotos = () => {
  $$('#f-album button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === fAlbum)));
  $('#f-estado').textContent = avisoCompartido();
  cargaFotos(); cargaAlbumMachaca();
  clearInterval(fTimer); fTimer = setInterval(() => { if (abiertas.includes('fotos') && !document.hidden) cargaFotos(true); else clearInterval(fTimer); }, 30000);
};
$$('#f-album button').forEach(b => b.onclick = () => { fAlbum = b.dataset.v; $$('#f-album button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); pintaGaleria(); $('#f-machaca').hidden = fAlbum !== 'machaca'; });
async function cargaFotos(silencio) {
  const r = await Almacen.fotos();
  if (!r.ok) { if (!silencio) $('#f-galeria').innerHTML = `<p class="nota">No pude cargar las fotos (${escapa(r.error)}). Revisa tu internet.</p>`; return; }
  const antes = fLista.map(f => f.id).join(); fLista = r.fotos || [];
  if (!silencio || antes !== fLista.map(f => f.id).join()) pintaGaleria();
}
function fotosVisibles() { return fAlbum === 'todas' ? fLista : fLista.filter(f => f.album === fAlbum); }
async function pintaGaleria() {
  $('#f-machaca').hidden = fAlbum !== 'machaca';
  const g = $('#f-galeria'); const lista = fotosVisibles();
  if (!lista.length) {
    g.innerHTML = `<div class="vacio-galeria"><strong>${fAlbum === 'bubble' ? 'Todavía no hay dibujos de Bubble.' : 'Todavía no hay fotos aquí.'}</strong><span>${fAlbum === 'bubble' ? 'Pídele a Bubble: «dibuja una pareja de pingüinos junto al mar».' : 'Toca «Subir fotos» para agregar las primeras.'}</span></div>`;
    return;
  }
  g.innerHTML = '';
  for (const [i, f] of lista.entries()) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'foto-mini' + (f.album === 'machaca' ? ' de-machaca' : '');
    const p = persona(f.autor);
    b.setAttribute('aria-label', `Foto de ${p.n}, ${new Date(f.ts).toLocaleDateString('es-MX')}`);
    const img = new Image(); img.loading = 'lazy'; img.alt = ''; b.appendChild(img);
    b.insertAdjacentHTML('beforeend', avatarHTML(p, true));
    b.onclick = () => abreVisor(i);
    g.appendChild(b);
    Almacen.urlFoto(f.id, true).then(u => { if (u) img.src = u; });
  }
}
$('#f-subir').addEventListener('change', async e => {
  const archivos = [...(e.target.files || [])].slice(0, 20); e.target.value = '';
  if (!archivos.length) return;
  const album = fAlbum === 'todas' ? 'general' : fAlbum === 'bubble' ? 'general' : fAlbum;
  let ok = 0;
  for (const [i, a] of archivos.entries()) {
    $('#f-estado').textContent = `Subiendo ${i + 1} de ${archivos.length}…`;
    try { const { imagen, mini } = await archivoAImagenes(a); const r = await Almacen.subeFoto({ album, imagen, mini }); if (r.ok) ok++; } catch (err) {}
  }
  $('#f-estado').textContent = avisoCompartido();
  toast(ok ? `${ok} foto${ok > 1 ? 's' : ''} en ${NOMBRE_ALBUM[album]}.` : 'No se pudieron subir las fotos.');
  cargaFotos();
});
async function abreVisor(i) {
  const lista = fotosVisibles(); if (!lista[i]) return;
  fVisorI = i; const f = lista[i]; const p = persona(f.autor);
  const v = $('#f-visor'); v.hidden = false;
  $('#f-visor-img').src = await Almacen.urlFoto(f.id, true);
  Almacen.urlFoto(f.id, false).then(u => { if (fVisorI === i && u) $('#f-visor-img').src = u; });
  $('#f-visor-quien').innerHTML = `${avatarHTML(p, true)}<span><strong>${escapa(p.n)}</strong> · ${escapa(NOMBRE_ALBUM[f.album] || '')} · ${new Date(f.ts).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</span>`;
  $('#f-visor-desc').textContent = '';
  Almacen.infoFoto(f.id).then(x => { if (fVisorI === i && x.desc) $('#f-visor-desc').textContent = x.desc; });
  $('#f-borrar').hidden = !puedeBorrar(f.autor);
  $('#f-ant').disabled = i <= 0; $('#f-sig').disabled = i >= lista.length - 1;
  $('#f-cerrar-visor').focus();
}
$('#f-cerrar-visor').onclick = () => { $('#f-visor').hidden = true; fVisorI = -1; };
$('#f-ant').onclick = () => abreVisor(fVisorI - 1);
$('#f-sig').onclick = () => abreVisor(fVisorI + 1);
$('#f-visor').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') abreVisor(fVisorI - 1); if (e.key === 'ArrowRight') abreVisor(fVisorI + 1); if (e.key === 'Escape') { e.stopPropagation(); $('#f-cerrar-visor').click(); } });
$('#f-descargar').onclick = async () => {
  const f = fotosVisibles()[fVisorI]; if (!f) return;
  const a = document.createElement('a'); a.href = await Almacen.urlFoto(f.id, false); a.download = `bubble-${f.id.split('_')[0]}.jpg`; document.body.appendChild(a); a.click(); a.remove();
};
$('#f-borrar').onclick = async () => {
  if (!confirmaSuave('f-borrar')) return;
  const f = fotosVisibles()[fVisorI]; if (!f) return;
  const r = await Almacen.borraFoto(f.id);
  if (r.ok) { toast('Foto borrada.'); $('#f-visor').hidden = true; cargaFotos(); } else toast('No se pudo borrar.');
};
// Álbum de Machaca con los colores del logo
async function cargaAlbumMachaca() {
  const r = await Almacen.album(); if (!r.ok) return;
  aplicaColoresAlbum(r.colores || []);
  const caja = $('#f-logo');
  if (r.logo) { const u = await Almacen.urlFoto(r.logo, true); caja.innerHTML = u ? `<img src="${escapa(u)}" alt="Logo de Machaca">` : ''; }
  else caja.innerHTML = '<span aria-hidden="true">M</span>';
}
function aplicaColoresAlbum(cols) {
  const c = cols.length ? cols : ['#0E8F7E', '#7A5CFA', '#E8930C'];
  const caja = $('#h-fotos');
  c.slice(0, 3).forEach((v, i) => caja.style.setProperty(`--m${i + 1}`, v));
  if (c.length < 3) for (let i = c.length; i < 3; i++) caja.style.setProperty(`--m${i + 1}`, c[i % c.length]);
  $('#f-colores').innerHTML = c.map(v => `<span class="muestra" style="background:${escapa(v)}" title="${escapa(v)}"></span>`).join('');
}
$('#f-logo-in').addEventListener('change', async e => {
  const a = e.target.files?.[0]; e.target.value = ''; if (!a) return;
  try {
    const { imagen, mini, img } = await archivoAImagenes(a);
    const colores = coloresDeImagen(img);
    const sub = await Almacen.subeFoto({ album: 'logo', imagen, mini, desc: 'Logo de Machaca' });
    const r = await Almacen.guardaAlbum({ colores, logo: sub.ok ? sub.foto.id : null });
    if (r.ok) { toast('Listo: el álbum de Machaca ya tiene los colores del logo.'); cargaAlbumMachaca(); }
  } catch (err) { toast('No pude leer esa imagen.'); }
});

// ---------------------------------------------------------------- Libro del equipo
let lFecha = diaLibroCercano(), lTimer = 0;
alAbrir.libro = () => {
  $('#l-estado').textContent = avisoCompartido();
  cargaLibro(); cargaIndiceLibro();
  clearInterval(lTimer); lTimer = setInterval(() => { if (abiertas.includes('libro') && !document.hidden) cargaLibro(true); else clearInterval(lTimer); }, 20000);
};
async function cargaLibro(silencio) {
  const fecha = fechaISO(lFecha);
  const hoy = fechaISO(diaLibroCercano());
  $('#l-fecha').textContent = fechaLarga(lFecha);
  $('#l-sub').textContent = fecha === hoy ? (DIAS_LIBRO.includes(new Date().getDay()) ? 'Sesión de hoy' : 'Próxima sesión') : (fecha < hoy ? 'Sesión pasada' : 'Sesión futura');
  const r = await Almacen.libro(fecha);
  if (fechaISO(lFecha) !== fecha) return;
  const cont = $('#l-notas');
  if (!r.ok) { if (!silencio) cont.innerHTML = `<p class="nota">No pude abrir el libro (${escapa(r.error)}).</p>`; return; }
  if (!r.notas.length) { cont.innerHTML = '<p class="libro-vacio">Esta página está en blanco. Escribe la primera nota de la sesión.</p>'; return; }
  cont.innerHTML = '';
  r.notas.forEach(n => {
    const p = persona(n.autor);
    const d = document.createElement('article'); d.className = 'nota-libro';
    d.innerHTML = `<header>${avatarHTML(p, true)}<strong>${escapa(p.n)}</strong><time>${new Date(n.ts).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}</time></header><p></p>`;
    d.querySelector('p').textContent = n.texto;
    if (puedeBorrar(n.autor)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'quitar-nota'; b.setAttribute('aria-label', 'Borrar nota'); b.textContent = '×';
      b.onclick = async () => { const x = await Almacen.borraNota(fecha, n.id); if (x.ok) { cargaLibro(); cargaIndiceLibro(); } else toast('No se pudo borrar.'); };
      d.querySelector('header').appendChild(b);
    }
    cont.appendChild(d);
  });
}
async function cargaIndiceLibro() {
  const r = await Almacen.indiceLibro(); const cont = $('#l-indice');
  if (!r.ok) { cont.innerHTML = ''; return; }
  if (!r.paginas.length) { cont.innerHTML = '<p class="nota">Aquí aparecerán las sesiones que tengan notas.</p>'; return; }
  cont.innerHTML = '';
  r.paginas.slice(0, 60).forEach(pg => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-chico'; b.style.justifyContent = 'space-between';
    b.innerHTML = `<span>${escapa(fechaLarga(deISO(pg.fecha)))}</span><span class="nota">${pg.n} nota${pg.n > 1 ? 's' : ''}</span>`;
    b.onclick = () => { lFecha = deISO(pg.fecha); cargaLibro(); $('#l-resumen-txt').hidden = true; };
    cont.appendChild(b);
  });
}
$('#l-ant').onclick = () => { lFecha = otroDiaLibro(lFecha, -1); $('#l-resumen-txt').hidden = true; cargaLibro(); };
$('#l-sig').onclick = () => { lFecha = otroDiaLibro(lFecha, 1); $('#l-resumen-txt').hidden = true; cargaLibro(); };
$('#l-hoy').onclick = () => { lFecha = diaLibroCercano(); $('#l-resumen-txt').hidden = true; cargaLibro(); };
$('#l-form').addEventListener('submit', async e => {
  e.preventDefault();
  const t = $('#l-texto').value.trim(); if (!t) { $('#l-texto').focus(); return; }
  const btn = e.submitter || $('#l-form button[type=submit]'); btn.disabled = true;
  const r = await Almacen.agregaNota(fechaISO(lFecha), t);
  btn.disabled = false;
  if (r.ok) { $('#l-texto').value = ''; cargaLibro(); cargaIndiceLibro(); } else toast('No se pudo guardar la nota. Revisa tu internet.');
});
$('#l-resumen').onclick = async e => {
  const r = await Almacen.libro(fechaISO(lFecha));
  if (!r.ok || !r.notas.length) { toast('Esta sesión todavía no tiene notas.'); return; }
  const btn = e.currentTarget; btn.disabled = true; const txt = btn.textContent; btn.textContent = 'Bubble está leyendo…';
  const notas = r.notas.map(n => `- ${persona(n.autor).n}: ${n.texto}`).join('\n');
  const x = await ia({ system: sistema(), contents: [{ role: 'user', parts: [{ text: `Resume en pocas líneas la sesión del ${fechaLarga(lFecha)} del libro del equipo: acuerdos, pendientes (con quién los hace) y siguientes pasos.\n\nNotas:\n${notas}` }] }] });
  btn.disabled = false; btn.textContent = txt;
  const caja = $('#l-resumen-txt'); caja.hidden = false;
  caja.innerHTML = '<h3>Resumen de Bubble</h3>' + (x.error ? `<p>${escapa(textoError(x))}</p>` : formato(desarma(x.texto).texto));
};

// ---------------------------------------------------------------- Proyecto Pastilla
const PASTILLA_IDEAS = [
  'Explícame nuestra hipótesis con palabras sencillas',
  '¿Cuáles son las variables del experimento (independiente, dependiente y controladas)?',
  'Diseña el experimento paso a paso, seguro para hacerlo en la escuela',
  '¿Qué coagulantes naturales podríamos usar, como la semilla de moringa o el nopal?',
  '¿Cómo medimos si el agua quedó más limpia? (turbidez, color, olor, pH)',
  'Mejora nuestra hipótesis con rigor científico',
  'Haz el guion de una presentación de 5 minutos del proyecto',
  'Preguntas que nos puede hacer el jurado y cómo responderlas',
  'Haz una gráfica de ejemplo de la turbidez antes y después de la pastilla'
];
let animPastilla = null;
alAbrir.pastilla = () => {
  $('#p-hipotesis').textContent = HIPOTESIS;
  const ideas = $('#p-ideas'); ideas.innerHTML = '';
  PASTILLA_IDEAS.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t; b.onclick = () => preguntar(t); ideas.appendChild(b); });
  if (!animPastilla) animPastilla = animaPastilla($('#p-canvas'));
};
$('#p-copiar').onclick = async () => { try { await navigator.clipboard.writeText(HIPOTESIS); toast('Hipótesis copiada.'); } catch (e) { toast('No se pudo copiar.'); } };
$('#form-pastilla').addEventListener('submit', e => { e.preventDefault(); const q = $('#p-q').value.trim(); if (q) { $('#p-q').value = ''; preguntar('Sobre el proyecto de la pastilla: ' + q); } });
// Animación del proceso: la pastilla se disuelve, se forman flóculos y caen al fondo
function animaPastilla(cv) {
  const ctx = cv.getContext('2d');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = Array.from({ length: 140 }, () => ({ x: Math.random(), y: 0.25 + Math.random() * 0.7, r: 1 + Math.random() * 1.6, vx: 0, vy: 0, g: -1 }));
  let t0 = performance.now();
  function cuadro(ahora) {
    if (!cv.isConnected) return;
    const W = cv.width = cv.clientWidth * Math.min(2, devicePixelRatio || 1), H = cv.height = cv.clientHeight * Math.min(2, devicePixelRatio || 1);
    if (!W || !H) { requestAnimationFrame(cuadro); return; }
    const ciclo = reducido ? 0.85 : ((ahora - t0) / 9000) % 1;
    ctx.clearRect(0, 0, W, H);
    // vaso
    const vx = W * 0.2, vw = W * 0.6, vy = H * 0.08, vh = H * 0.86;
    const turb = Math.max(0, 1 - Math.max(0, ciclo - 0.45) / 0.4);
    const agua = ctx.createLinearGradient(0, vy, 0, vy + vh);
    agua.addColorStop(0, `rgba(${Math.round(120 + 60 * turb)}, ${Math.round(190 - 40 * turb)}, ${Math.round(220 - 110 * turb)}, 0.55)`);
    agua.addColorStop(1, `rgba(${Math.round(90 + 70 * turb)}, ${Math.round(170 - 50 * turb)}, ${Math.round(200 - 110 * turb)}, 0.7)`);
    ctx.fillStyle = agua; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(vx, vy + vh * 0.12, vw, vh * 0.88, [0, 0, 18, 18]) : ctx.rect(vx, vy + vh * 0.12, vw, vh * 0.88); ctx.fill();
    ctx.strokeStyle = 'rgba(120,140,160,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx, vy + vh - 18); ctx.quadraticCurveTo(vx, vy + vh, vx + 18, vy + vh); ctx.lineTo(vx + vw - 18, vy + vh); ctx.quadraticCurveTo(vx + vw, vy + vh, vx + vw, vy + vh - 18); ctx.lineTo(vx + vw, vy); ctx.stroke();
    // pastilla que se disuelve
    const dis = Math.min(1, ciclo / 0.3);
    if (dis < 1) {
      const px = vx + vw / 2, py = vy + vh * (0.2 + 0.55 * Math.min(1, ciclo / 0.12)), s = (1 - dis) * Math.min(W, H) * 0.09;
      ctx.save(); ctx.translate(px, py); ctx.rotate(-0.5);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-s, -s * 0.45, s * 2, s * 0.9, s * 0.45) : ctx.rect(-s, -s * 0.45, s * 2, s * 0.9); ctx.fill();
      ctx.fillStyle = '#2BB3A0'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(0, -s * 0.45, s, s * 0.9, [0, s * 0.45, s * 0.45, 0]) : ctx.rect(0, -s * 0.45, s, s * 0.9); ctx.fill();
      ctx.restore();
    }
    // partículas: sueltas → se agrupan (flóculos) → caen
    const fondo = vy + vh - 6;
    P.forEach((p, i) => {
      const x0 = vx + 8 + p.x * (vw - 16);
      let y = vy + vh * 0.14 + p.y * (vh * 0.82);
      let x = x0 + Math.sin(ahora / 900 + i) * 3 * turb;
      if (ciclo > 0.3) { const k = Math.min(1, (ciclo - 0.3) / 0.25); const gx = vx + vw * (0.2 + 0.6 * ((i % 7) / 6)); x = x0 + (gx - x0) * k * 0.6; }
      if (ciclo > 0.5) { const k = Math.min(1, (ciclo - 0.5) / 0.35); y = y + (fondo - y - (i % 5) * 3) * (k * k); }
      ctx.fillStyle = ciclo > 0.3 ? 'rgba(110, 85, 50, .85)' : 'rgba(120, 95, 60, .55)';
      ctx.beginPath(); ctx.arc(x, y, p.r * (ciclo > 0.35 ? 1.6 : 1) * (W / 400), 0, Math.PI * 2); ctx.fill();
    });
    if (!reducido) requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);
  return true;
}

// ---------------------------------------------------------------- widget del libro en inicio
async function pintaWidgetLibro() {
  const d = diaLibroCercano();
  $('#w-libro-fecha').textContent = fechaLarga(d);
  $('#w-libro-sub').textContent = DIAS_LIBRO.includes(new Date().getDay()) ? 'Sesión de hoy' : 'Próxima sesión';
  if (!S.yo) return;
  const r = await Almacen.libro(fechaISO(d));
  $('#w-libro-n').textContent = r.ok ? (r.notas.length ? `${r.notas.length} nota${r.notas.length > 1 ? 's' : ''}` : 'Sin notas todavía') : '';
}
$('#w-libro').onclick = () => { lFecha = diaLibroCercano(); abre('libro'); };

// ---------------------------------------------------------------- música
const MUSICA_IDEAS = [
  '¿Qué artistas de pop en inglés están de moda?',
  'Recomiéndame canciones de pop en inglés para estudiar',
  'Cuéntame la historia de un cantante de pop famoso',
  'Explícame de qué trata una canción en inglés',
  'Ayúdame a aprender inglés con canciones'
];
alAbrir.musica = () => {
  const ideas = $('#musica-ideas'); if (ideas && !ideas.children.length) MUSICA_IDEAS.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t; b.onclick = () => preguntar(t); ideas.appendChild(b); });
  const m = $('#musica-marco');
  if (!m.firstChild) m.innerHTML = `<iframe title="Playlist del equipo en Spotify" src="https://open.spotify.com/embed/playlist/${PLAYLIST}?utm_source=generator" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
};

// ---------------------------------------------------------------- ajustes
let eventoInstalar = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); eventoInstalar = e; });
function pintaAjustes() {
  const a = ajustes(); const p = perfil(); const cont = $('#ajustes');
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const conf = lee('local:config', null);
  cont.innerHTML = `
  <div class="grupo"><h3>Tú</h3><div class="grupo-caja">
    <div class="grupo-fila"><div class="fila" style="justify-content:space-between">
      <div class="fila">${avatarHTML(S.yo)}<div><strong>${escapa(S.yo.n)}</strong><div class="nota">Usuario: ${escapa(S.yo.u)}</div></div></div>
      <button class="btn btn-chico" type="button" id="aj-salir">Cambiar de persona</button></div></div>
    <div class="grupo-fila"><div class="fila" style="justify-content:space-between"><div><strong>Cómo te habla Bubble</strong><div class="nota">${escapa(ESTILOS[p.estilo]?.l || '')} · ${escapa(DETALLES[p.detalle]?.l || '')}${p.areas?.length ? ' · ' + escapa(p.areas.join(', ')) : ''}</div></div><button class="btn btn-chico" type="button" id="aj-conoceme">Cambiar</button></div></div>
    <div class="grupo-fila"><strong>Lo que Bubble recuerda de ti</strong><p class="nota">${Almacen.compartido() ? 'Se guarda en tu perfil, junto con tus pláticas.' : 'Se guarda en este dispositivo.'} Dile «recuerda que…» para que guarde algo.</p>
      ${p.notas?.length ? `<ul class="notas-lista">${p.notas.map((n, i) => `<li><span>${escapa(n)}</span><button type="button" data-nota="${i}" aria-label="Olvidar">×</button></li>`).join('')}</ul>` : '<p class="nota">Todavía nada. Bubble aprende mientras platican.</p>'}
      <div class="fila"><button class="btn btn-chico" type="button" id="aj-olvida">Olvidar todo</button><button class="btn btn-chico" type="button" id="aj-borra-chat">Borrar mi conversación</button></div>
    </div>
  </div></div>

  <div class="grupo"><h3>Voz</h3><div class="grupo-caja">
    <div class="grupo-fila"><strong>Bubble responde en voz alta</strong>
      <div class="segmentos" id="aj-voz">${[['cuando', 'Cuando le hablo'], ['siempre', 'Siempre'], ['nunca', 'Nunca']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${a.voz === v}">${l}</button>`).join('')}</div></div>
    <div class="grupo-fila"><strong>Cómo te escucha Bubble</strong>
      <div class="segmentos" id="aj-escucha">${[['grabar', 'Tu voz y tu tono'], ['auto', 'Dictado rápido']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${a.escucha === v}">${l}</button>`).join('')}</div>
      <p class="nota">«Tu voz y tu tono»: Bubble escucha cómo lo dices y se adapta a cómo te sientes. «Dictado rápido»: solo pasa tus palabras a texto.</p></div>
    <div class="grupo-fila"><label class="interruptor">Conversación continua (después de contestar, vuelve a escucharte)<input type="checkbox" id="aj-conversacion" ${a.conversacion ? 'checked' : ''}></label><p class="nota">Apagado: el micrófono solo se prende cuando tocas su botón.</p></div>
    <div class="grupo-fila">${SR ? `<label class="interruptor">Despertar a Bubble diciendo «Bubble»<input type="checkbox" id="aj-despertar" ${a.despertar ? 'checked' : ''}></label><p class="nota">Funciona mejor en computadora con Chrome, Edge o Safari, con la app abierta.</p>` : '<p class="nota">Para despertar a Bubble con la voz hace falta Chrome, Edge o Safari.</p>'}</div>
  </div></div>

  <div class="grupo"><h3>Pantalla</h3><div class="grupo-caja">
    <div class="grupo-fila"><strong>Carátula</strong><div class="segmentos" id="aj-cara">${[['cielo', 'Cielo'], ['estuario', 'Atardecer'], ['noche', 'Noche']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${a.cara === v}">${l}</button>`).join('')}</div></div>
    <div class="grupo-fila"><strong>Apariencia</strong><div class="segmentos" id="aj-tema">${[['auto', 'Automática'], ['claro', 'Clara'], ['oscuro', 'Oscura']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${a.tema === v}">${l}</button>`).join('')}</div></div>
    <div class="grupo-fila"><label class="etiqueta">Ciudad para el clima<div class="fila"><input type="text" id="aj-ciudad" value="${escapa(a.ciudad)}" style="flex:1"><button class="btn btn-chico" type="button" id="aj-ciudad-ok">Guardar</button></div></label></div>
  </div></div>

  <div class="grupo"><h3>Equipo ${escapa(S.equipo)}</h3><div class="grupo-caja">
    ${S.modo === 'servidor'
      ? `<div class="grupo-fila"><strong>Conectado al servidor del equipo</strong><p class="nota">Personas: ${S.usuarios.map(u => escapa(u.n)).join(', ')}. Para agregar o cambiar personas y contraseñas, edita la variable USUARIOS en Netlify y vuelve a publicar.</p><p class="nota">Inteligencia: Gemini ${S.ia ? '(lista)' : '(falta la clave GEMINI_API_KEY en Netlify)'}.</p></div>`
      : `<div class="grupo-fila"><strong>Modo solo este dispositivo</strong><p class="nota">Las personas y la clave se guardan solo aquí. Cuando subas Bubble a Netlify, el equipo podrá entrar desde cualquier dispositivo.</p>
          <label class="etiqueta">Clave de Gemini<div class="fila"><input type="password" id="aj-clave" value="${escapa(conf?.clave || '')}" style="flex:1" autocomplete="off"><button class="btn btn-chico" type="button" id="aj-clave-ok">Guardar</button></div></label></div>`}
  </div></div>

  <div class="grupo"><h3>App</h3><div class="grupo-caja">
    <div class="grupo-fila"><strong>Instalar Bubble</strong>
      ${instalada ? '<p class="nota">Ya está instalada en este dispositivo.</p>'
      : eventoInstalar ? '<div class="fila"><button class="btn btn-pri btn-chico" type="button" id="aj-instalar">Instalar</button></div>'
      : esIOS ? '<p class="nota">En iPhone o iPad: abre Bubble en Safari, toca el botón Compartir y elige «Agregar a inicio».</p>'
      : '<p class="nota">En Android y en computadora (Chrome o Edge): abre el menú ⋮ del navegador y elige «Instalar app» o «Agregar a pantalla principal». En Mac con Safari: menú Archivo → «Agregar al Dock».</p>'}
    </div>
  </div></div>`;

  $('#aj-salir').onclick = salir;
  $('#aj-conoceme').onclick = abreConoceme;
  $$('[data-nota]').forEach(b => b.onclick = () => { const q = perfil(); q.notas.splice(+b.dataset.nota, 1); guardaPerfil(q); pintaAjustes(); });
  $('#aj-olvida').onclick = () => { if (!confirmaSuave('aj-olvida')) return; const q = perfil(); q.notas = []; guardaPerfil(q); pintaAjustes(); toast('Bubble olvidó lo que había aprendido de ti.'); };
  $('#aj-borra-chat').onclick = async () => { if (!confirmaSuave('aj-borra-chat')) return; guardaU('chat', []); if (Almacen.compartido()) await Almacen.api('yo-chat', { borrar: true }); toast('Conversación borrada en todos tus dispositivos.'); };
  const seg = (id, k, despues) => $$(`#${id} button`).forEach(b => b.onclick = () => { const x = ajustes(); x[k] = b.dataset.v; guardaAjustes(x); $$(`#${id} button`).forEach(y => y.setAttribute('aria-pressed', String(y === b))); despues?.(); });
  seg('aj-voz', 'voz'); seg('aj-cara', 'cara', aplicaApariencia); seg('aj-tema', 'tema', aplicaApariencia);
  seg('aj-escucha', 'escucha', () => { sinDictado = false; noTeEscuche = 0; });
  $('#aj-conversacion')?.addEventListener('change', e => { const x = ajustes(); x.conversacion = e.target.checked; guardaAjustes(x); });
  $('#aj-despertar')?.addEventListener('change', e => { const x = ajustes(); x.despertar = e.target.checked; guardaAjustes(x); if (x.despertar) { iniciaDespertar(); toast('Di «Bubble» para despertarla.'); } else detenDespertar(); $('#pista-inicio').textContent = x.despertar ? 'Di «Bubble» para hablarle' : 'Toca a Bubble para platicar'; });
  $('#aj-ciudad-ok').onclick = () => { const x = ajustes(); x.ciudad = $('#aj-ciudad').value.trim() || 'Monterrey'; guardaAjustes(x); cargaClima(); toast('Ciudad guardada.'); };
  $('#aj-clave-ok')?.addEventListener('click', () => { const c = lee('local:config', null); if (!c) return; c.clave = $('#aj-clave').value.trim(); guarda('local:config', c); S.ia = !!c.clave; toast('Clave guardada en este dispositivo.'); });
  $('#aj-instalar')?.addEventListener('click', async () => { eventoInstalar.prompt(); await eventoInstalar.userChoice.catch(() => {}); eventoInstalar = null; pintaAjustes(); });
}
alAbrir.ajustes = pintaAjustes;

// ---------------------------------------------------------------- app instalable
function registraSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {}
}

arranca();
