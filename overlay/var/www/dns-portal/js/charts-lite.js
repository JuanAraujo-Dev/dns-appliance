/* Lightweight charts — no CDN */
window.ChartsLite = {
  clear(ctx) {
    const c = ctx.canvas;
    ctx.clearRect(0, 0, c.width, c.height);
  },
  line(canvas, labels, values, color) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 400;
    const h = canvas.height || 220;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (!values.length) return;
    const max = Math.max(...values, 1);
    const pad = 24;
    ctx.strokeStyle = color || '#ff5a00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1);
      const y = h - pad - (v / max) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  },
  doughnut(canvas, parts, colors) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 280;
    const h = canvas.height || 220;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const total = parts.reduce((a, b) => a + b.value, 0) || 1;
    let a0 = -Math.PI / 2;
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 16;
    parts.forEach((p, i) => {
      const a1 = a0 + (p.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = (colors && colors[i]) || '#ff5a00';
      ctx.fill();
      a0 = a1;
    });
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
};
