// Startbahn Android header: one fragment shader, written in the subset of GLSL that maps
// 1:1 to AGSL (RuntimeShader, API 33+, so fine with minSdk 35). It ray-casts the airfield
// (ground, strip, keys, centre line, lane lights, taxiway, apron, holding rings) and up to
// 24 glass spheres. Compose computes the camera and token positions (same math as world.js)
// and sets them as uniforms each animation frame; nothing renders while nothing moves.
//
// AGSL port notes: `vec3`->`half3/float3`, `uniform vec4 uTokA[24]` stays an array uniform,
// gl_FragCoord -> the `main(float2 fragCoord)` argument, output `return half4(col, 1)`.

export const FRAG = /* glsl */`#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes; uniform float uDpr;
uniform vec3 uCamPos, uCamF, uCamR, uCamU;
uniform float uF, uCx, uCy;
uniform float uMid, uHalf, uZTok, uTaxiX, uTaxiHalf;
uniform vec4 uApron;
uniform vec3 uLanes, uLaneLvl, uLaneTier; // tier: 0 calm, 1 soon, 2 over
uniform vec4 uHold; uniform float uHoldRz;
uniform vec3 cSky, cGround, cStrip, cMark, cCoral, cPlum, cYellow, cPaper, cWarm;
uniform float uDark;
uniform vec4 uTokA[24];
uniform vec4 uTokB[24];
uniform int uTokN;

float cover(float d, float aa) { return clamp(0.5 - d / max(aa, 1e-4), 0.0, 1.0); }

vec3 field(vec3 p, float t, out float isStrip) {
  float aa = max(0.004, 1.2 * t / uF);
  float x = p.x, z = p.z;
  vec3 col = cGround;
  vec3 pave = mix(cGround, cStrip, 0.55);
  // apron (Inbox) and taxiway (queue)
  float ap = max(max(uApron.x - x, x - uApron.y), max(z - uApron.z, uApron.w - z));
  col = mix(col, mix(cGround, cStrip, 0.4), cover(ap, aa));
  float tx = max(abs(x - uTaxiX) - uTaxiHalf, z - (uZTok + 0.9));
  col = mix(col, pave, cover(tx, aa));
  float con = max(max(uMid + uHalf - x, x - uTaxiX), abs(z - uZTok) - 0.95);
  col = mix(col, pave, cover(con, aa));
  float yl = max(abs(x - uTaxiX) - 0.03, z - (uZTok - 1.4));
  col = mix(col, cYellow, cover(yl, aa));
  // the strip
  float sd = max(abs(x - uMid) - uHalf, z - (uZTok + 1.0));
  isStrip = cover(sd, aa);
  vec3 s = cStrip;
  float bar = max(abs(x - uMid) - uHalf + 0.15, abs(z - (uZTok - 0.62)) - 0.08);
  s = mix(s, cMark, cover(bar, aa));
  float kw = (uHalf - 0.9) / 6.0;
  float ax = abs(x - uMid) - 0.75;
  float kf = abs(fract(ax / kw) - 0.5) * kw - kw * 0.31;
  float keys = max(max(kf, max(-ax, ax - kw * 6.0)), max(z - (uZTok - 0.9), (uZTok - 3.4) - z));
  s = mix(s, cMark, cover(keys, aa));
  float dz = fract(((uZTok - 3.4) - z) / 5.2);
  float dash = max(abs(x - uMid) - 0.07, max(abs(dz - 0.75) * 5.2 - 1.3, z - (uZTok - 3.4)));
  s = mix(s, cMark, cover(dash, aa));
  col = mix(col, s, isStrip);
  // lane lights: the urgency tier sets the reach (full, half, three lights) and the colour
  // (coral for overdue and soon, paper for calm)
  for (int i = 0; i < 3; i++) {
    float lx = uLanes[i];
    float k = floor(((uZTok - 1.35) - z) / 1.6 + 0.5);
    if (k < 0.0 || k > 21.0) continue;
    float lz = (uZTok - 1.35) - k * 1.6;
    float d = length(vec2((x - lx) / 0.09, (z - lz) / 0.17));
    float lit = clamp(uLaneLvl[i] * 22.0 - k, 0.0, 1.0);
    float tier = uLaneTier[i];
    vec3 off = uDark > 0.5 ? cStrip * 1.6 : cStrip * 0.86;
    vec3 hue = tier < 0.5 ? cMark : cCoral;
    vec3 on = hue * (uDark > 0.5 ? (tier > 1.5 ? 2.0 : tier > 0.5 ? 1.3 : 0.95) : 1.0);
    col = mix(col, mix(off, on, lit), cover(d - 1.0, aa / 0.09));
    if (uDark > 0.5 && tier > 0.5) col += cCoral * lit * (tier > 1.5 ? 0.45 : 0.25) * exp(-d * d * 0.08);
  }
  // fog to the sky colour
  return mix(col, cSky, smoothstep(26.0, 110.0, t));
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec3 dir = normalize(uCamF * uF + uCamR * (px.x - uCx) + uCamU * (uCy - px.y));
  vec3 col = cSky;
  float tHit = 1e6;
  vec3 gp = vec3(0.0);
  if (dir.y < -1e-4) {
    tHit = -uCamPos.y / dir.y;
    gp = uCamPos + dir * tHit;
    float st;
    col = field(gp, tHit, st);
    // contact shadows, the yellow "läuft" ring and the coral "überfällig" ring on the ground
    // (b.z: +1 started, +2 overdue)
    for (int i = 0; i < 24; i++) {
      if (i >= uTokN) break;
      vec4 a = uTokA[i]; vec4 b = uTokB[i];
      if (a.y > 1.2) continue;
      float r = length(gp.xz - a.xz);
      float raa = max(0.004, 1.2 * tHit / uF);
      col *= 1.0 - (uDark > 0.5 ? 0.45 : 0.22) * exp(-r * r / (a.w * a.w * 1.1)) * b.w;
      if (b.y > -0.5 && mod(b.z, 2.0) > 0.5) col = mix(col, cYellow, cover(abs(r - a.w * 1.6) - 0.022, raa));
      if (b.y > -0.5 && b.z > 1.5) col = mix(col, cCoral, cover(abs(r - a.w * 1.9) - 0.03, raa) * b.w);
    }
  }
  // holding pattern: dotted ovals in the sky (outer: waiting, inner and nearer: follow-up due)
  for (int ring = 0; ring < 2; ring++) {
    float fr = float(ring);
    float hy = uHold.y - 0.85 * fr;
    if (abs(dir.y) < 1e-4) continue;
    float th = (hy - uCamPos.y) / dir.y;
    if (th <= 0.0 || th > tHit) continue;
    vec3 q = uCamPos + dir * th;
    float rx = uHold.w * mix(1.0, 0.56, fr), rz = uHoldRz * mix(1.0, 0.56, fr);
    vec2 e = vec2((q.x - uHold.x) / rx, (q.z - (uHold.z + 2.4 * fr)) / rz);
    float ang = atan(e.y, e.x);
    float dotp = abs(fract(ang * (fr > 0.5 ? 40.0 : 64.0) / 6.2832) - 0.5);
    float rr = abs(length(e) - 1.0) * rx;
    float aa = max(0.01, 1.4 * th / uF);
    float m = cover(rr - 0.045, aa) * step(dotp, 0.22);
    col = mix(col, fr > 0.5 ? cCoral : cPlum, m * (uDark > 0.5 ? 0.7 : 0.5));
  }
  // glass spheres (tokens) and clay pucks (Inbox)
  for (int i = 0; i < 24; i++) {
    if (i >= uTokN) break;
    vec4 a = uTokA[i]; vec4 b = uTokB[i];
    if (b.w < 0.01) continue;
    vec3 sc = vec3(1.0, b.y < -0.5 ? 0.32 : 1.0, 1.0);
    vec3 o = (uCamPos - a.xyz) / sc, d = dir / sc;
    float A = dot(d, d), B = dot(o, d), C = dot(o, o) - a.w * a.w;
    float h = B * B - A * C;
    // b.y: -1 clay puck, 0..1 plum..coral core, 2 warm paper core (calm tier)
    vec3 coreCol = b.y > 1.5 ? cWarm : mix(cPlum, cCoral, clamp(b.y, 0.0, 1.0));
    float dc = length(cross(dir, a.xyz - uCamPos)) / a.w;
    if (h > 0.0) {
      float t = (-B - sqrt(h)) / A;
      if (t > 0.0 && t < tHit) {
        vec3 hp = o + d * t;
        vec3 n = normalize(hp / sc);
        vec3 v = -dir;
        vec3 l = normalize(vec3(-0.5, 0.85, 0.45));
        float fres = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 3.0);
        float spec = pow(clamp(dot(n, normalize(l + v)), 0.0, 1.0), 90.0);
        vec3 c;
        if (b.y < -0.5) {
          c = cPaper * (0.62 + 0.38 * clamp(dot(n, l), 0.0, 1.0)) + fres * 0.08;
          if (b.z > 0.5) c = mix(c, cYellow, cover(length(hp.xz) - a.w * 0.22, 0.02));
        } else {
          // refraction: look up the field behind the sphere along the bent ray
          vec3 rd = refract(dir, n, 1.0 / 1.45);
          vec3 behind = cSky;
          if (rd.y < -1e-4) { vec3 hp2 = a.xyz + n * a.w; float t2 = -hp2.y / rd.y; float s2; behind = field(hp2 + rd * t2, tHit + t2, s2); }
          vec3 tint = mix(cPaper, coreCol, b.y > 1.5 ? 0.0 : b.y < 0.5 ? 0.18 : 0.32);
          c = behind * tint;
          float core = clamp(b.x, 0.0, 4.0) * exp(-dc * dc * 6.0);
          c = uDark > 0.5 ? c + coreCol * core : mix(c, coreCol, clamp(core * 0.55, 0.0, 0.92));
          c += vec3(1.0) * (fres * 0.55 + spec * 1.1);
        }
        col = mix(col, c, b.w);
        tHit = t;
      }
    }
    // soft halo around a lit core (dark mode only): stands in for bloom
    if (uDark > 0.5 && b.y > -0.5) col += coreCol * clamp(b.x, 0.0, 4.0) * 0.06 * exp(-max(dc - 1.0, 0.0) * 2.2) * step(1.0, dc) * b.w;
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`

export function createHeaderShader(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false })
  if (!gl) throw new Error('no webgl2')
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const U = {}
  const u = (n) => (U[n] ??= gl.getUniformLocation(prog, n))
  return {
    draw(uni) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr)
      if (!w || !h) return
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      gl.viewport(0, 0, w, h)
      gl.uniform2f(u('uRes'), w, h); gl.uniform1f(u('uDpr'), dpr)
      for (const [k, v] of Object.entries(uni)) {
        if (k === 'uTokN') gl.uniform1i(u(k), v)
        else if (k === 'uTokA' || k === 'uTokB') gl.uniform4fv(u(`${k}[0]`), v)
        else if (typeof v === 'number') gl.uniform1f(u(k), v)
        else if (v.length === 3) gl.uniform3fv(u(k), v)
        else if (v.length === 4) gl.uniform4fv(u(k), v)
        else if (v.length === 2) gl.uniform2fv(u(k), v)
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
  }
}
