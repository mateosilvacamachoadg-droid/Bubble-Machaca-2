/* Bubble — el personaje.
   Mezcla de tres cosas: una burbuja de jabón (borde tornasol y brillos),
   el resplandor de colores de un asistente (luz que gira por dentro)
   y los ojos de Aria (parpadean y miran).
   Uso:  const b = new Burbuja(canvas);  b.estado('escucha');  b.nivel(0.6);
   Estados: reposo · escucha · piensa · habla · feliz                    */
(function () {
  const TAU = Math.PI * 2;
  const instancias = new Set();
  const reducido = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();

  // Colores del resplandor interior (aqua, violeta, rosa, menta, ámbar)
  const LUCES = [
    [80, 220, 255],
    [150, 110, 255],
    [255, 95, 185],
    [90, 245, 190],
    [255, 200, 110]
  ];

  class Burbuja {
    constructor(canvas, opciones = {}) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.off = document.createElement('canvas');
      this.octx = this.off.getContext('2d');
      this.t = Math.random() * 100;
      this._estado = 'reposo';
      this._nivel = 0;      // 0..1 (voz o micrófono)
      this.nivelSuave = 0;
      this.ojos = opciones.ojos !== false;
      this.mira = { x: 0, y: 0, ax: 0, ay: 0, prox: 0 };
      this.parpadeo = { prox: 1.5 + Math.random() * 3, fase: 0 };
      this.escala = 1;
      this.giro = 1;
      this.estatico = !!opciones.estatico;
      this.ajusta();
      instancias.add(this);
      if (this.estatico) this.dibuja(0);
    }
    estado(e) { if (e) this._estado = e; return this._estado; }
    nivel(n) { this._nivel = Math.max(0, Math.min(1, n || 0)); }
    destruye() { instancias.delete(this); }

    ajusta() {
      const r = this.c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.max(40, Math.round((r.width || this.c.width || 200) * dpr));
      const h = Math.max(40, Math.round((r.height || this.c.height || 200) * dpr));
      if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
      if (this.off.width !== w || this.off.height !== h) { this.off.width = w; this.off.height = h; }
    }

    visible() {
      if (this.estatico) return false;
      if (!this.c.isConnected) return false;
      return this.c.offsetParent !== null || getComputedStyle(this.c).position === 'fixed';
    }

    forma(cx, cy, R, amp, t) {
      const p = new Path2D();
      const N = 72;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU;
        const k = 1
          + amp * 0.55 * Math.sin(2 * a + t * 1.3)
          + amp * 0.35 * Math.sin(3 * a - t * 0.9 + 1.2)
          + amp * 0.22 * Math.sin(5 * a + t * 2.1 + 0.4);
        const x = cx + Math.cos(a) * R * k;
        const y = cy + Math.sin(a) * R * k;
        if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
      }
      p.closePath();
      return p;
    }

    dibuja(dt) {
      const { ctx, c } = this;
      const W = c.width, H = c.height;
      const e = this._estado;
      const vel = reducido ? 0.35 : 1;
      this.t += dt * vel;
      const t = this.t;

      // Suavizar nivel y parámetros por estado
      const objetivo = e === 'habla' ? 0.25 + this._nivel * 0.75 : e === 'escucha' ? 0.2 + this._nivel * 0.8 : 0;
      this.nivelSuave += (objetivo - this.nivelSuave) * Math.min(1, dt * 8);
      const giroObj = e === 'piensa' ? 3.2 : e === 'escucha' ? 1.8 : e === 'habla' ? 1.6 : 1;
      this.giro += (giroObj - this.giro) * Math.min(1, dt * 3);
      const escObj = e === 'escucha' ? 1.06 + this.nivelSuave * 0.06 : e === 'feliz' ? 1.05 : 1;
      this.escala += (escObj - this.escala) * Math.min(1, dt * 6);

      const flota = reducido ? 0 : Math.sin(t * 1.1) * 0.012;
      const cx = W / 2;
      const cy = H / 2 + H * flota;
      const R = Math.min(W, H) * 0.34 * this.escala;
      const amp = reducido ? 0.006 : (0.014 + this.nivelSuave * 0.05 + (e === 'piensa' ? 0.012 : 0));
      const tg = t * this.giro;

      ctx.clearRect(0, 0, W, H);
      const forma = this.forma(cx, cy, R, amp, t * (1 + this.nivelSuave));

      // 1. Aura (el brillo de Aria alrededor)
      const hue = (tg * 18) % 360;
      const aura = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.45);
      aura.addColorStop(0, `hsla(${hue}, 90%, 70%, ${0.28 + this.nivelSuave * 0.25})`);
      aura.addColorStop(0.55, `hsla(${(hue + 60) % 360}, 90%, 72%, 0.12)`);
      aura.addColorStop(1, 'hsla(0,0%,100%,0)');
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, W, H);

      // 2. Cuerpo: vidrio profundo al centro, película clara en el borde
      ctx.save();
      ctx.clip(forma);
      const cuerpo = ctx.createRadialGradient(cx - R * 0.15, cy - R * 0.2, R * 0.05, cx, cy, R * 1.02);
      cuerpo.addColorStop(0, 'rgba(26, 22, 70, 0.96)');
      cuerpo.addColorStop(0.62, 'rgba(28, 30, 92, 0.86)');
      cuerpo.addColorStop(0.9, 'rgba(70, 90, 170, 0.45)');
      cuerpo.addColorStop(1, 'rgba(255, 255, 255, 0.10)');
      ctx.fillStyle = cuerpo;
      ctx.fillRect(0, 0, W, H);

      // 3. Luces que giran por dentro (el resplandor tipo asistente)
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < LUCES.length; i++) {
        const fase = i * 1.37;
        const w = 0.55 + i * 0.13;
        const orb = R * (0.28 + 0.1 * Math.sin(t * 0.7 + i));
        const x = cx + Math.cos(tg * w + fase) * orb;
        const y = cy + Math.sin(tg * w * 1.27 + fase * 1.7) * orb * 0.9;
        const rr = R * (0.5 + 0.12 * Math.sin(t * 1.3 + i * 2) + this.nivelSuave * 0.08);
        const [r, g, b] = LUCES[i];
        const gr = ctx.createRadialGradient(x, y, 0, x, y, rr);
        const a = e === 'reposo' ? 0.52 : 0.6;
        gr.addColorStop(0, `rgba(${r},${g},${b},${a})`);
        gr.addColorStop(0.45, `rgba(${r},${g},${b},${a * 0.35})`);
        gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = gr;
        ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      // corazón de luz
      const nucleo = ctx.createRadialGradient(cx, cy + R * 0.05, 0, cx, cy, R * 0.55);
      nucleo.addColorStop(0, `rgba(255,255,255,${0.14 + this.nivelSuave * 0.12})`);
      nucleo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = nucleo;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      // 4. Película de jabón tornasol (solo en el borde)
      const o = this.octx;
      o.globalCompositeOperation = 'source-over';
      o.clearRect(0, 0, W, H);
      if (o.createConicGradient) {
        const cg = o.createConicGradient(tg * 0.35, cx, cy);
        const tonos = [190, 260, 320, 30, 90, 160, 190];
        tonos.forEach((h, i) => cg.addColorStop(i / (tonos.length - 1), `hsla(${(h + hue * 0.3) % 360}, 95%, 72%, 0.95)`));
        o.fillStyle = cg;
      } else {
        o.fillStyle = 'rgba(190, 220, 255, 0.9)';
      }
      o.fill(forma);
      o.globalCompositeOperation = 'destination-in';
      const borde = o.createRadialGradient(cx, cy, R * 0.72, cx, cy, R * 1.04);
      borde.addColorStop(0, 'rgba(0,0,0,0)');
      borde.addColorStop(0.75, 'rgba(0,0,0,0.55)');
      borde.addColorStop(1, 'rgba(0,0,0,0.95)');
      o.fillStyle = borde;
      o.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(this.off, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      // 5. Brillos de burbuja
      const b1 = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.5, 0, cx - R * 0.42, cy - R * 0.5, R * 0.42);
      b1.addColorStop(0, 'rgba(255,255,255,0.75)');
      b1.addColorStop(0.35, 'rgba(255,255,255,0.22)');
      b1.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = b1;
      ctx.beginPath();
      ctx.ellipse(cx - R * 0.42, cy - R * 0.5, R * 0.4, R * 0.26, -0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(cx - R * 0.5, cy - R * 0.56, R * 0.07, R * 0.045, -0.6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, R * 0.035);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.86, 0.25 * Math.PI, 0.55 * Math.PI);
      ctx.stroke();

      // 6. Ojos (de Aria)
      if (this.ojos) this.dibujaOjos(cx, cy, R, dt, e);
      ctx.restore();

      // 7. Contorno fino
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = Math.max(1, R * 0.012);
      ctx.stroke(forma);
    }

    dibujaOjos(cx, cy, R, dt, e) {
      const ctx = this.ctx;
      const m = this.mira;
      // hacia dónde mira
      m.prox -= dt;
      if (e === 'piensa') { m.ax = 0.35; m.ay = -0.45; }
      else if (e === 'escucha' || e === 'habla') { m.ax = 0; m.ay = 0; }
      else if (m.prox <= 0) {
        m.ax = (Math.random() - 0.5) * 0.7;
        m.ay = (Math.random() - 0.5) * 0.45;
        m.prox = 1.8 + Math.random() * 3;
      }
      m.x += (m.ax - m.x) * Math.min(1, dt * 5);
      m.y += (m.ay - m.y) * Math.min(1, dt * 5);
      // parpadeo
      const p = this.parpadeo;
      p.prox -= dt;
      if (p.prox <= 0 && p.fase === 0) p.fase = 0.0001;
      if (p.fase > 0) {
        p.fase += dt / 0.16;
        if (p.fase >= 1) { p.fase = 0; p.prox = 2.2 + Math.random() * 3.5; }
      }
      const cierre = p.fase > 0 ? 1 - Math.abs(Math.sin(p.fase * Math.PI)) : 1;

      const sep = R * 0.25;
      const ox = m.x * R * 0.12;
      const oy = m.y * R * 0.1 - R * 0.02;
      const ancho = R * 0.13 * (e === 'escucha' ? 1.1 : 1);
      const alto = R * 0.27 * (e === 'escucha' ? 1.12 : 1) * Math.max(0.12, cierre);
      ctx.save();
      ctx.shadowColor = 'rgba(200, 240, 255, 0.9)';
      ctx.shadowBlur = R * 0.12;
      ctx.fillStyle = 'rgba(255,255,255,0.97)';
      ctx.strokeStyle = 'rgba(255,255,255,0.97)';
      for (const lado of [-1, 1]) {
        const x = cx + lado * sep + ox;
        const y = cy + oy;
        if (e === 'feliz') {
          ctx.lineWidth = ancho * 0.55;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(x, y + ancho * 0.6, ancho * 0.85, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
        } else {
          const rx = ancho / 2, ry = alto / 2;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x - rx, y - ry, rx * 2, ry * 2, rx);
          else ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  let ultimo = 0;
  function bucle(ts) {
    const dt = ultimo ? Math.min(0.05, (ts - ultimo) / 1000) : 0.016;
    ultimo = ts;
    if (!document.hidden) {
      for (const b of instancias) {
        if (!b.visible()) continue;
        b.ajusta();
        b.dibuja(dt);
      }
    }
    requestAnimationFrame(bucle);
  }
  requestAnimationFrame(bucle);
  window.addEventListener('resize', () => instancias.forEach(b => b.ajusta()));

  window.Burbuja = Burbuja;
})();
