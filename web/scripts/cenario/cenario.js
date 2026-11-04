// ---------- Cenário ----------
// Céu pelo relógio do aparelho, sol e lua em arco, nuvens e clima que muda sozinho. Tudo desenhado aqui.
const SKY_KEYS = [
  [0, "#040a1f", "#0a2340", 0], [4.8, "#07102c", "#1c2c58", 0], [6, "#27346f", "#d9825f", .45], [7.5, "#2c6aa8", "#e6b98b", .8],
  [11, "#2a7ec2", "#86cfe6", 1], [16, "#2a6fb4", "#92cde0", 1], [18, "#4a3f8c", "#ea8a5b", .55], [19.3, "#1d2259", "#60406f", .2],
  [20.5, "#0a1436", "#142e52", 0], [24, "#040a1f", "#0a2340", 0],
];
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = (c, alpha = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
const WEATHERS = ["clear", "clouds", "rain", "clear", "storm", "clouds", "snow", "wind"];
const scene = {
  canvas: null, g: null, w: 0, h: 0, stars: [], clouds: [], drops: [], flakes: [], leaves: [], flies: [], trees: [], last: 0, weather: "clear", intensity: 0, nextChange: 0, flash: 0, meteor: null, running: false,
  size() {
    const canvas = this.canvas = $("scene");
    this.w = canvas.width = Math.max(120, Math.ceil(innerWidth / 3.5));
    this.h = canvas.height = Math.max(180, Math.ceil(innerHeight / 3.5));
    this.g = canvas.getContext("2d");
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this.stars = Array.from({ length: this.w * this.h / 130 | 0 }, () => [rnd() * this.w | 0, rnd() * this.h * .62 | 0, rnd() * 6.28, rnd() > .85]);
    this.clouds = Array.from({ length: 8 }, () => ({ x: rnd() * this.w * 1.3, y: rnd() * this.h * .34, v: .5 + rnd() * 1.3, bits: Array.from({ length: 4 + (rnd() * 3 | 0) }, (_, k) => [k * 5 + rnd() * 3, 2.5 + rnd() * 3.5]) }));
    this.drops = Array.from({ length: this.w / 1.8 | 0 }, () => [rnd() * this.w, rnd() * this.h, 90 + rnd() * 70]);
    this.flakes = Array.from({ length: this.w / 2.4 | 0 }, () => [rnd() * this.w, rnd() * this.h, 7 + rnd() * 13, rnd() * 6.28]);
    this.leaves = Array.from({ length: 22 }, () => [rnd() * this.w, rnd() * this.h, rnd() * 6.28, rnd() > .5]);
    this.flies = Array.from({ length: 14 }, () => [rnd() * this.w, this.h * .6 + rnd() * this.h * .32, rnd() * 6.28]);
    this.trees = [];
    for (let x = 2; x < this.w; x += 6 + (rnd() * 8 | 0)) this.trees.push([x, 7 + (rnd() * 9 | 0)]);
    this.draw(performance.now(), 0);
  },
  hour() {
    if (settings.cycle === "night") return 23;
    if (settings.cycle === "day") return 12;
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  },
  draw(now, dt) {
    const { g, w, h } = this;
    if (!g) return;
    const hour = this.hour();
    let i = 0;
    while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1][0] <= hour) i++;
    const [h0, t0, b0, l0] = SKY_KEYS[i], [h1, t1, b1, l1] = SKY_KEYS[i + 1];
    const f = (hour - h0) / (h1 - h0);
    const gloom = this.intensity * ({ rain: .55, storm: .75, snow: .3, clouds: .3 }[this.weather] ?? 0);
    const dim = [12, 18, 34];
    const top = mixRgb(mixRgb(hexRgb(t0), hexRgb(t1), f), dim, gloom), bottom = mixRgb(mixRgb(hexRgb(b0), hexRgb(b1), f), dim, gloom);
    const light = (l0 + (l1 - l0) * f) * (1 - gloom * .6);
    const sky = g.createLinearGradient(0, 0, 0, h * .85);
    sky.addColorStop(0, css(top)); sky.addColorStop(1, css(bottom));
    g.fillStyle = sky; g.fillRect(0, 0, w, h);

    // Estrelas piscam só de noite.
    const night = Math.max(0, 1 - light * 2.4) * (1 - gloom);
    if (night > .02) for (const [x, y, phase, big] of this.stars) {
      const a = night * (.35 + .4 * Math.sin(now / 900 + phase));
      if (a <= 0) continue;
      g.fillStyle = big ? `rgba(190,245,240,${a})` : `rgba(255,255,255,${a})`;
      g.fillRect(x, y, 1, 1);
    }
    // Aurora em noites limpas.
    if (night > .3 && this.weather !== "rain" && this.weather !== "storm") {
      for (let x = 0; x < w; x += 1) {
        const y = h * .17 + Math.sin(x / 19 + now / 4200) * 7 + Math.sin(x / 7 + now / 2600) * 2 | 0;
        for (let k = 0; k < 9; k++) { g.fillStyle = `rgba(90,230,190,${(.14 - k * .014) * night})`; g.fillRect(x, y + k * 2, 1, 2); }
      }
    }
    // Sol de dia, lua de noite, cada um em seu arco.
    const dayT = (hour - 5.5) / 14;
    if (dayT > -.05 && dayT < 1.05) {
      const x = w * (.08 + dayT * .84), y = h * .5 - Math.sin(Math.max(0, Math.min(1, dayT)) * Math.PI) * h * .42;
      g.fillStyle = "#ffe7a0"; g.fillRect(x - 5 | 0, y - 7 | 0, 10, 14); g.fillRect(x - 7 | 0, y - 5 | 0, 14, 10);
      g.fillStyle = "#fff6cf"; g.fillRect(x - 3 | 0, y - 3 | 0, 6, 6);
    }
    const nightT = ((hour + 24 - 19) % 24) / 11;
    if (nightT < 1) {
      const x = w * (.08 + nightT * .84), y = h * .5 - Math.sin(nightT * Math.PI) * h * .42;
      g.fillStyle = "#e9f1d0"; g.fillRect(x - 6 | 0, y - 4 | 0, 12, 8); g.fillRect(x - 4 | 0, y - 6 | 0, 8, 12);
      g.fillStyle = css(mixRgb(top, bottom, .25)); g.fillRect(x - 1 | 0, y - 6 | 0, 6, 9);
    }
    // Estrela cadente de vez em quando.
    if (night > .5 && !this.meteor && Math.random() < dt * .03) this.meteor = { x: Math.random() * w, y: Math.random() * h * .3, t: 0 };
    if (this.meteor) {
      const m = this.meteor; m.t += dt; m.x += dt * 110; m.y += dt * 45;
      g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(m.x | 0, m.y | 0, 2, 1);
      g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(m.x - 5 | 0, m.y - 2 | 0, 5, 1);
      if (m.t > .8) this.meteor = null;
    }
    // Nuvens: quanto mais fechado o tempo, mais escuras e rápidas.
    const cover = this.weather === "clear" || this.weather === "wind" ? .45 : 1;
    const cloudColor = mixRgb(mixRgb([70, 86, 125], [245, 248, 255], light), [58, 65, 88], gloom);
    this.clouds.forEach((c, idx) => {
      if (idx / this.clouds.length > cover) return;
      c.x -= dt * c.v * (this.weather === "wind" || this.weather === "storm" ? 5 : 1.7);
      if (c.x < -44) c.x = w + 8;
      g.fillStyle = css(cloudColor, .82);
      // Cada nuvem é feita de bolhas de pixels com a base reta.
      for (const [dx, r] of c.bits) for (let row = -Math.ceil(r); row <= 0; row++) {
        const half = Math.sqrt(Math.max(0, r * r - row * row)) * 1.5;
        g.fillRect(c.x + dx - half | 0, c.y + row | 0, half * 2 | 0, 1);
      }
    });
    // Montanhas e árvores acompanham a luz do céu.
    const far = mixRgb([16, 54, 82], [66, 124, 142], light), near = mixRgb([12, 42, 66], [38, 96, 88], light), wood = mixRgb([9, 30, 46], [24, 72, 58], light);
    const ridge = (base, amp, step, color) => {
      g.fillStyle = css(color);
      for (let x = 0; x < w; x++) {
        const y = base + Math.sin(x / step) * amp + Math.sin(x / (step * .37) + 1) * amp * .35 | 0;
        g.fillRect(x, y, 1, h - y);
      }
    };
    ridge(h * .62, 13, 23, far); ridge(h * .72, 9, 15, near);
    const sway = this.weather === "wind" || this.weather === "storm" ? 1.5 : .4;
    g.fillStyle = css(wood);
    const ground = h * .84 | 0;
    for (const [x, tall] of this.trees) {
      const lean = Math.sin(now / 700 + x) * sway;
      for (let k = 0; k < tall; k++) { const half = (k / 2 | 0) + 1; g.fillRect(x - half + lean * (1 - k / tall) | 0, ground - tall + k, half * 2 + 1, 1); }
    }
    g.fillRect(0, ground, w, h - ground);

    // Clima
    const on = this.intensity;
    if ((this.weather === "rain" || this.weather === "storm") && on > .02) {
      g.fillStyle = `rgba(170,205,235,${.42 * on})`;
      const slant = this.weather === "storm" ? 20 : 8;
      for (const d of this.drops) {
        d[1] += d[2] * dt; d[0] -= slant * dt;
        if (d[1] > h) { d[1] = -4; d[0] = Math.random() * w; }
        if (d[0] < 0) d[0] = w;
        g.fillRect(d[0] | 0, d[1] | 0, 1, 3);
      }
    }
    if (this.weather === "storm" && on > .5) {
      if (Math.random() < dt * .1) this.flash = 1;
      if (this.flash > 0) { g.fillStyle = `rgba(220,235,255,${this.flash * .42})`; g.fillRect(0, 0, w, h); this.flash -= dt * 3.5; }
    }
    if (this.weather === "snow" && on > .02) {
      g.fillStyle = `rgba(255,255,255,${.8 * on})`;
      for (const p of this.flakes) {
        p[1] += p[2] * dt; p[3] += dt; p[0] += Math.sin(p[3]) * dt * 7;
        if (p[1] > h) { p[1] = -2; p[0] = Math.random() * w; }
        g.fillRect(p[0] | 0, p[1] | 0, 1, 1);
      }
    }
    if (this.weather === "wind" && on > .02) {
      for (const p of this.leaves) {
        p[0] -= dt * 42; p[1] += Math.sin(now / 420 + p[2]) * dt * 14 + dt * 8;
        if (p[0] < -3) { p[0] = w + 2; p[1] = Math.random() * h * .85; }
        g.fillStyle = p[3] ? `rgba(226,142,58,${on})` : `rgba(116,190,86,${on})`;
        g.fillRect(p[0] | 0, p[1] | 0, 2, 1);
      }
    }
    // Vaga-lumes em noites sem chuva.
    if (night > .35 && this.weather !== "rain" && this.weather !== "storm" && this.weather !== "snow") {
      for (const p of this.flies) {
        const x = p[0] + Math.sin(now / 1500 + p[2]) * 9, y = p[1] + Math.cos(now / 1900 + p[2]) * 5, a = (.5 + .5 * Math.sin(now / 400 + p[2])) * night;
        g.fillStyle = `rgba(216,242,122,${a * .25})`; g.fillRect(x - 1 | 0, y - 1 | 0, 3, 3);
        g.fillStyle = `rgba(216,242,122,${a})`; g.fillRect(x | 0, y | 0, 1, 1);
      }
    }
  },
  setWeather(kind) { this.weather = kind; this.intensity = 0; this.nextChange = performance.now() + 75000 + Math.random() * 75000; },
  tick(now) {
    requestAnimationFrame((t) => this.tick(t));
    const covered = matchMedia("(max-width: 860px)").matches && state.view === "code" && !$("settings").open;
    if (document.hidden || !settings.scene || covered || now - this.last < 66) return;
    const dt = Math.min(.2, (now - this.last) / 1000);
    this.last = now;
    if (settings.weather === "auto" && now > this.nextChange) {
      let next = this.weather;
      while (next === this.weather) next = WEATHERS[Math.random() * WEATHERS.length | 0];
      this.setWeather(next);
    } else if (settings.weather !== "auto" && this.weather !== settings.weather) this.setWeather(settings.weather);
    this.intensity = Math.min(1, this.intensity + dt / 4);
    this.draw(now, dt);
  },
  start() {
    this.size();
    if (!this.running) { this.running = true; this.nextChange = performance.now() + 60000; requestAnimationFrame((t) => this.tick(t)); }
  },
};
function drawScene() { scene.size(); }

