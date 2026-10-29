// Servidor de Bubble (Netlify Function).
// Guarda en secreto la clave de Gemini, revisa usuarios y contraseñas, y guarda
// las fotos y el libro del equipo para que todas las cuentas vean lo mismo.
// Se configura en Netlify → Project configuration → Environment variables
// (el archivo «Actualizar Bubble» lo hace solo):
//   GEMINI_API_KEY   tu clave de Gemini
//   USUARIOS         cuentas (hasta 100), por ejemplo:  Mateo:1234, Renata:5678
//   EQUIPO           (opcional) nombre del equipo. Por defecto: Machaca
//   GEMINI_BUSQUEDA  (opcional) "si" solo si tu clave es de pago y quieres búsqueda de Google
import { createHmac, createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import '../../public/gemini.js';

const lee = (k, d = '') => {
  try { const v = globalThis.Netlify?.env?.get?.(k); if (v != null && v !== '') return v; } catch (e) {}
  return process.env[k] ?? d;
};
// "Iván" → usuario "ivan" (se puede escribir con o sin acento); el nombre en pantalla conserva el acento
const sinAcentos = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9.-]/g, '');
const COLORES = ['#0E8F7E', '#7A5CFA', '#E5487A', '#E8930C', '#2B87D1', '#3FA35B', '#B04FCF', '#D9534F'];

function usuarios() {
  return lee('USUARIOS')
    .replace(/^\s*USUARIOS\s*=\s*/i, '')
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map((par, i) => {
      const m = par.match(/^([^:\s]+)\s*[:\s]\s*(\S+)$/);
      if (!m) return null;
      const crudo = m[1].trim();
      const u = sinAcentos(crudo);
      if (!u) return null;
      return { u, p: m[2].trim(), n: crudo.charAt(0).toLocaleUpperCase('es') + crudo.slice(1), c: COLORES[i % COLORES.length] };
    })
    .filter(Boolean)
    .slice(0, 100);
}
const esAdmin = u => usuarios()[0]?.u === u;

function secreto() {
  return lee('SECRETO') || createHash('sha256').update('bubble|' + lee('GEMINI_API_KEY') + '|' + lee('USUARIOS')).digest('hex');
}
const b64 = s => Buffer.from(s).toString('base64url');
function firma(datos) {
  const cuerpo = b64(JSON.stringify(datos));
  return cuerpo + '.' + createHmac('sha256', secreto()).update(cuerpo).digest('base64url');
}
function verifica(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [cuerpo, f] = token.split('.');
  const bueno = createHmac('sha256', secreto()).update(cuerpo).digest('base64url');
  const a = Buffer.from(f || ''), b = Buffer.from(bueno);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    if (!d.exp || d.exp < Date.now()) return null;
    if (!usuarios().some(x => x.u === d.u)) return null;
    return d;
  } catch (e) { return null; }
}

const fallos = new Map();
const json = (datos, status = 200) => new Response(JSON.stringify(datos), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

// Memoria de modelos agotados (dura mientras el servidor esté encendido)
const memoriaGemini = new Map();
const mem = { get: k => memoriaGemini.get(k) ?? null, set: (k, v) => memoriaGemini.set(k, v) };

// ---------- Almacén compartido (Netlify Blobs) ----------
let blobs, consistencia = 'strong';
async function tienda(nombre) {
  if (blobs === undefined) { try { blobs = await import('@netlify/blobs'); } catch (e) { blobs = null; } }
  if (!blobs) return null;
  try { return blobs.getStore({ name: nombre, consistency: consistencia }); } catch (e) { return blobs.getStore(nombre); }
}
async function intenta(fn) {
  try { return await fn(); } catch (e) {
    if (e && e.name === 'BlobsConsistencyError' && consistencia === 'strong') { consistencia = 'eventual'; return await fn(); }
    throw e;
  }
}
const ALBUMES = ['general', 'machaca', 'bubble', 'logo'];
const nuevoId = (album, autor) => `${Date.now().toString(36)}_${randomBytes(4).toString('hex')}_${album}_${autor}`;
function leeId(id) {
  const [ts, , album, autor] = String(id).split('_');
  return { id, ts: parseInt(ts, 36) || 0, album, autor };
}
const idValido = id => /^[a-z0-9]+_[a-f0-9]{8}_[a-z]+_[a-z0-9.-]+$/.test(String(id || ''));
function deDataURL(d, maxBytes) {
  const m = String(d || '').match(/^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const buf = Buffer.from(m[3], 'base64');
  return buf.length && buf.length <= maxBytes ? { tipo: m[1], buf } : null;
}
// Mensajes guardados en el perfil de cada persona
function limpiaMsg(m) {
  if (!m || typeof m !== 'object') return null;
  const id = String(m.id || '').slice(0, 40);
  if (!/^[a-z0-9_]+$/i.test(id)) return null;
  const x = { id, ts: Number(m.ts) || 0, r: m.r === 'yo' ? 'yo' : 'ella', t: String(m.t || '').slice(0, 40000) };
  if (m.voz) x.voz = true;
  if (m.guardado) x.guardado = true;
  if (Array.isArray(m.f) && m.f.length) x.f = m.f.slice(0, 8).map(f => ({ t: String(f?.t || '').slice(0, 120), u: String(f?.u || '').slice(0, 500) }));
  return x;
}
function limpiaPerfil(p) {
  return {
    estilo: String(p.estilo || 'amable').slice(0, 20), detalle: String(p.detalle || 'normal').slice(0, 20),
    areas: (Array.isArray(p.areas) ? p.areas : []).slice(0, 10).map(x => String(x).slice(0, 40)),
    extra: String(p.extra || '').slice(0, 300),
    notas: (Array.isArray(p.notas) ? p.notas : []).slice(0, 12).map(x => String(x).slice(0, 200)),
    listo: !!p.listo, cuenta: Number(p.cuenta) || 0, ts: Date.now()
  };
}
const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
const diaSemana = f => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

export default async (req) => {
  const url = new URL(req.url);
  const ruta = url.pathname.replace(/^.*\/api\//, '');
  const equipo = lee('EQUIPO', 'Machaca');

  if (ruta === 'estado') {
    return json({ ok: true, equipo, ia: !!lee('GEMINI_API_KEY'), compartido: !!(await tienda('equipo')), usuarios: usuarios().map(({ u, n, c }) => ({ u, n, c })) });
  }

  // ----- lecturas con token en la dirección (para fotos y listas) -----
  if (req.method === 'GET') {
    const quien = verifica(url.searchParams.get('t'));
    if (!quien) return json({ error: 'sesion' }, 401);
    const st = await tienda('equipo');
    if (!st) return json({ error: 'almacen' }, 503);
    try {
      if (ruta === 'fotos') {
        const { blobs: lista } = await intenta(() => st.list({ prefix: 'm/' }));
        const fotos = lista.map(b => leeId(b.key.slice(2))).filter(f => f.album !== 'logo').sort((a, b) => b.ts - a.ts);
        return json({ fotos });
      }
      if (ruta === 'foto') {
        const id = url.searchParams.get('id');
        if (!idValido(id)) return json({ error: 'id' }, 400);
        const mini = url.searchParams.get('mini') === '1';
        const r = await intenta(() => st.getWithMetadata((mini ? 'm/' : 'f/') + id, { type: 'arrayBuffer' }));
        if (!r) return json({ error: 'no_existe' }, 404);
        if (url.searchParams.get('info') === '1') return json({ ...leeId(id), desc: r.metadata?.desc || '' });
        return new Response(r.data, { headers: { 'content-type': r.metadata?.tipo || 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' } });
      }
      if (ruta === 'album') {
        return json((await intenta(() => st.get('config/album-machaca', { type: 'json' }))) || { colores: [], logo: null });
      }
      if (ruta === 'libro') {
        const fecha = url.searchParams.get('fecha');
        if (!esFecha(fecha)) return json({ error: 'fecha' }, 400);
        const { blobs: lista } = await intenta(() => st.list({ prefix: `n/${fecha}/` }));
        const notas = (await Promise.all(lista.map(b => intenta(() => st.get(b.key, { type: 'json' })).then(n => n && { ...n, id: b.key.split('/')[2] }).catch(() => null))))
          .filter(Boolean).sort((a, b) => a.ts - b.ts);
        return json({ fecha, notas });
      }
      if (ruta === 'yo') {
        const [perfil, doc] = await Promise.all([
          intenta(() => st.get(`u/${quien.u}/perfil`, { type: 'json' })),
          intenta(() => st.get(`u/${quien.u}/chat`, { type: 'json' }))
        ]);
        return json({ perfil: perfil || null, chat: Array.isArray(doc?.chat) ? doc.chat : [], borrado: Number(doc?.borrado) || 0 });
      }
      if (ruta === 'libro-indice') {
        const { blobs: lista } = await intenta(() => st.list({ prefix: 'n/' }));
        const cuenta = {};
        lista.forEach(b => { const f = b.key.split('/')[1]; cuenta[f] = (cuenta[f] || 0) + 1; });
        return json({ paginas: Object.entries(cuenta).map(([fecha, n]) => ({ fecha, n })).sort((a, b) => b.fecha.localeCompare(a.fecha)) });
      }
    } catch (e) {
      return json({ error: 'almacen', detalle: String(e?.message || e).slice(0, 160) }, 502);
    }
    return json({ error: 'ruta' }, 404);
  }

  if (req.method !== 'POST') return json({ error: 'metodo' }, 405);
  let datos = {};
  try { datos = await req.json(); } catch (e) { return json({ error: 'datos' }, 400); }

  if (ruta === 'entrar') {
    const u = sinAcentos(datos.u);
    const p = String(datos.p || '').trim();
    const f = fallos.get(u) || { n: 0, hasta: 0 };
    if (f.hasta > Date.now()) return json({ error: 'espera', segundos: Math.ceil((f.hasta - Date.now()) / 1000) }, 429);
    const quien = usuarios().find(x => x.u === u);
    const A = Buffer.from(quien ? quien.p : 'x'), B = Buffer.from(p);
    const ok = !!quien && A.length === B.length && timingSafeEqual(A, B);
    if (!ok) {
      f.n += 1;
      if (f.n >= 5) { f.hasta = Date.now() + 60_000; f.n = 0; }
      fallos.set(u, f);
      await new Promise(r => setTimeout(r, 500));
      return json({ error: 'contrasena' }, 401);
    }
    fallos.delete(u);
    return json({ token: firma({ u, exp: Date.now() + 1000 * 60 * 60 * 24 * 180 }), u, n: quien.n, c: quien.c });
  }

  const quien = verifica(datos.token);
  if (!quien) return json({ error: 'sesion' }, 401);

  if (ruta === 'ia') {
    const system = String(datos.system || '').slice(0, 16000);
    const contents = (Array.isArray(datos.contents) ? datos.contents : [])
      .slice(-24)
      .map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.parts?.[0]?.text || m.text || '').slice(0, 12000) }] }))
      .filter(m => m.parts[0].text);
    if (!contents.length) return json({ error: 'vacio' }, 400);
    let adjunto = null;
    const a = datos.adjunto;
    if (a && /^(audio|image)\/[\w.+-]+$/.test(String(a.mime || '')) && typeof a.datos === 'string' && a.datos.length < 5_500_000) adjunto = { mime: a.mime, datos: a.datos };
    const r = await globalThis.llamaGemini({
      clave: lee('GEMINI_API_KEY'), system, contents, adjunto, memoria: mem,
      buscar: datos.buscar !== false, permitirBusqueda: /^(si|sí|true|1)$/i.test(lee('GEMINI_BUSQUEDA')),
      preferido: lee('GEMINI_MODEL')
    });
    return json(r, r.error ? (r.error === 'limite' ? 429 : 502) : 200);
  }

  const st = await tienda('equipo');
  if (!st) return json({ error: 'almacen' }, 503);
  try {
    if (ruta === 'fotos') {
      const album = ALBUMES.includes(datos.album) ? datos.album : 'general';
      const img = deDataURL(datos.imagen, 4_000_000);
      const mini = deDataURL(datos.mini, 400_000);
      if (!img || !mini) return json({ error: 'imagen' }, 400);
      const id = nuevoId(album, quien.u);
      const desc = String(datos.desc || '').slice(0, 300);
      await intenta(() => st.set('f/' + id, img.buf, { metadata: { tipo: img.tipo, desc } }));
      await intenta(() => st.set('m/' + id, mini.buf, { metadata: { tipo: mini.tipo } }));
      return json({ ok: true, foto: leeId(id) });
    }
    if (ruta === 'foto-borrar') {
      if (!idValido(datos.id)) return json({ error: 'id' }, 400);
      const f = leeId(datos.id);
      if (f.autor !== quien.u && !esAdmin(quien.u)) return json({ error: 'permiso' }, 403);
      await intenta(() => st.delete('f/' + f.id)); await intenta(() => st.delete('m/' + f.id));
      return json({ ok: true });
    }
    if (ruta === 'album') {
      const colores = (Array.isArray(datos.colores) ? datos.colores : []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 4);
      const logo = datos.logo && idValido(datos.logo) ? datos.logo : null;
      await intenta(() => st.setJSON('config/album-machaca', { colores, logo, por: quien.u, ts: Date.now() }));
      return json({ ok: true, colores, logo });
    }
    if (ruta === 'nota') {
      const fecha = String(datos.fecha || '');
      if (!esFecha(fecha) || ![3, 6].includes(diaSemana(fecha))) return json({ error: 'fecha' }, 400);
      const texto = String(datos.texto || '').trim().slice(0, 3000);
      if (!texto) return json({ error: 'vacio' }, 400);
      const id = `${Date.now().toString(36)}_${randomBytes(3).toString('hex')}_${quien.u}`;
      const nota = { texto, autor: quien.u, ts: Date.now() };
      await intenta(() => st.setJSON(`n/${fecha}/${id}`, nota));
      return json({ ok: true, nota: { ...nota, id } });
    }
    if (ruta === 'yo-perfil') {
      if (!datos.perfil || typeof datos.perfil !== 'object') return json({ error: 'datos' }, 400);
      await intenta(() => st.setJSON(`u/${quien.u}/perfil`, limpiaPerfil(datos.perfil)));
      return json({ ok: true });
    }
    if (ruta === 'yo-chat') {
      const clave = `u/${quien.u}/chat`;
      const doc = (await intenta(() => st.get(clave, { type: 'json' }))) || { chat: [], borrado: 0 };
      if (datos.borrar) { await intenta(() => st.setJSON(clave, { chat: [], borrado: Date.now() })); return json({ ok: true, chat: [] }); }
      const borrado = Number(doc.borrado) || 0;
      const mapa = new Map();
      [...(Array.isArray(doc.chat) ? doc.chat : []), ...(Array.isArray(datos.chat) ? datos.chat : []).slice(-120).map(limpiaMsg)]
        .forEach(m => { if (m && m.id && m.ts > borrado) mapa.set(m.id, { ...(mapa.get(m.id) || {}), ...m }); });
      const chat = [...mapa.values()].sort((a, b) => a.ts - b.ts).slice(-200);
      await intenta(() => st.setJSON(clave, { chat, borrado }));
      return json({ ok: true, n: chat.length });
    }
    if (ruta === 'nota-borrar') {
      const fecha = String(datos.fecha || ''), id = String(datos.id || '');
      if (!esFecha(fecha) || !/^[a-z0-9]+_[a-f0-9]{6}_[a-z0-9.-]+$/.test(id)) return json({ error: 'id' }, 400);
      const autor = id.split('_')[2];
      if (autor !== quien.u && !esAdmin(quien.u)) return json({ error: 'permiso' }, 403);
      await intenta(() => st.delete(`n/${fecha}/${id}`));
      return json({ ok: true });
    }
  } catch (e) {
    return json({ error: 'almacen', detalle: String(e?.message || e).slice(0, 160) }, 502);
  }
  return json({ error: 'ruta' }, 404);
};

export const config = { path: '/api/*' };
