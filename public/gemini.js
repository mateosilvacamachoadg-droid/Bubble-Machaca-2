/* Conexión con Gemini (la usan la app y el servidor).
   Plan gratis: Flash-Lite da muchas más preguntas al día que Flash, y la búsqueda
   de Google y las imágenes no son gratis. Por eso:
   - primero usa Flash-Lite y, si un modelo se queda sin preguntas, prueba el siguiente;
   - recuerda qué modelos se agotaron hasta que se reinician;
   - solo usa la búsqueda de Google si se activó a propósito (plan de pago). */
(function () {
  const MODELOS = [
    'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest',
    'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest',
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'
  ];

  // Las preguntas del día se reinician a medianoche, hora del Pacífico.
  function proximoReinicio(ahora = Date.now()) {
    try {
      const p = {};
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(ahora)).forEach(x => { p[x.type] = x.value; });
      const h = (+p.hour) % 24, m = +p.minute, s = +p.second;
      return ahora + ((24 - h) * 3600 - m * 60 - s) * 1000 + 30000;
    } catch (e) { return ahora + 6 * 3600 * 1000; }
  }
  function mensajeGoogle(txt) {
    try { const j = JSON.parse(txt); return String(j.error?.message || txt).slice(0, 220); } catch (e) { return String(txt || '').slice(0, 220); }
  }

  async function llamaGemini({ clave, system, contents, buscar = false, permitirBusqueda = false, adjunto = null, memoria, preferido = '' }) {
    if (!clave) return { error: 'sin_clave' };
    const mem = memoria || { get: () => null, set: () => {} };
    const ahora = Date.now();
    const agotados = mem.get('agotados') || {};
    const bueno = mem.get('bueno');
    const orden = [...new Set([preferido, bueno, ...MODELOS].filter(Boolean))];
    const usarBusqueda = buscar && permitirBusqueda && !mem.get('sinBusqueda');

    // Agrega el audio o la imagen al último mensaje
    let cont = contents;
    if (adjunto && adjunto.datos && adjunto.mime) {
      cont = contents.map((m, i) => i === contents.length - 1
        ? { role: m.role, parts: [{ inlineData: { mimeType: adjunto.mime, data: adjunto.datos } }, ...m.parts] }
        : m);
    }

    let error = 'error', detalle = '', hubo429 = false, reinicio = null;
    for (const modelo of orden) {
      if ((agotados[modelo] || 0) > ahora) { hubo429 = true; reinicio = Math.min(reinicio || Infinity, agotados[modelo]); continue; }
      for (const conBusqueda of usarBusqueda ? [true, false] : [false]) {
        const cuerpo = { systemInstruction: { parts: [{ text: system }] }, contents: cont, generationConfig: { temperature: 0.6 } };
        if (conBusqueda) cuerpo.tools = [{ google_search: {} }];
        let r, txt = '';
        try {
          r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': clave }, body: JSON.stringify(cuerpo)
          });
        } catch (e) { return { error: 'sin_conexion' }; }
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          const c = d.candidates?.[0] || {};
          const texto = (c.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('');
          if (!texto) { error = c.finishReason === 'SAFETY' ? 'seguridad' : 'vacio'; detalle = c.finishReason || ''; break; }
          const g = c.groundingMetadata || {};
          if (bueno !== modelo) mem.set('bueno', modelo);
          return {
            texto, modelo,
            fuentes: (g.groundingChunks || []).map(x => x.web).filter(Boolean).map(w => ({ t: w.title || '', u: w.uri || '' })),
            sugerencias: g.searchEntryPoint?.renderedContent || ''
          };
        }
        txt = await r.text().catch(() => '');
        detalle = mensajeGoogle(txt);
        if (conBusqueda && (r.status === 429 || r.status === 400 || r.status === 403)) { mem.set('sinBusqueda', true); continue; }
        if (r.status === 404) { error = 'modelo'; break; }
        if ((r.status === 400 || r.status === 403) && /API key|API_KEY_INVALID|PERMISSION_DENIED.*key/i.test(txt)) return { error: 'clave_mala', detalle };
        if (r.status === 429) {
          hubo429 = true;
          const retraso = +(txt.match(/"retryDelay"\s*:\s*"(\d+)/) || [])[1] || 0;
          const porDia = /PerDay|per day|daily|limit:\s*0\b/i.test(txt);
          const hasta = porDia ? proximoReinicio(ahora) : ahora + Math.max(20, retraso || 60) * 1000;
          agotados[modelo] = hasta; mem.set('agotados', agotados);
          reinicio = Math.min(reinicio || Infinity, hasta);
          break;
        }
        error = r.status >= 500 ? 'ocupado' : 'gemini_' + r.status;
        break;
      }
    }
    if (hubo429) return { error: 'limite', reinicio: isFinite(reinicio) ? reinicio : null, detalle };
    return { error, detalle };
  }

  globalThis.llamaGemini = llamaGemini;
  globalThis.proximoReinicioGemini = proximoReinicio;
})();
