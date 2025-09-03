let videoFps = 30;


let currentFrame = 0;
let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');

// ====== Frame seeking helper (global) ======
// [removed duplicate seekToFrame; unified version kept below]


let origin = { x: 0, y: 0 };
let scale = 1;
let trackingData = [];
let scaleStart = null;
let scaleEnd = null;
let trackingMode = 'none';
const colorMap = ['rgba(255,0,0,0.5)', 'rgba(0,0,255,0.5)', 'rgba(0,128,0,0.5)', 'rgba(255,165,0,0.5)', 'rgba(128,0,128,0.5)', 'rgba(0,255,255,0.5)', 'rgba(255,0,255,0.5)'];

document.getElementById('video-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    video.src = url;
  }
});


// スケール設定のプレビュー（緑線）
canvas.addEventListener('mousemove', (e) => {
  if (trackingMode !== 'scale' || !scaleStart) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save();
  ctx.strokeStyle = '#28a745';
  ctx.fillStyle = '#28a745';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(scaleStart.x, scaleStart.y);
  ctx.lineTo(x, y);
  ctx.stroke();
  // markers
  ctx.beginPath(); ctx.arc(scaleStart.x, scaleStart.y, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
  ctx.restore();
});

canvas.addEventListener('contextmenu', (e)=>{ e.preventDefault(); });

canvas.addEventListener('click', (e) => { try { if (e.metaKey||e.ctrlKey) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); } else { e.preventDefault(); } } catch(_) {} 
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (trackingMode === 'origin') {
    origin = { x, y };
    alert(`原点を設定しました: (${x}, ${y})`);
    trackingMode = 'none';
  } else if (trackingMode === 'scale') {
    if (!scaleStart) {
      scaleStart = { x, y };
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.save(); ctx.fillStyle='#28a745'; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); ctx.restore();
    } else {
      scaleEnd = { x, y };
      const pixelDist = Math.hypot(scaleEnd.x - scaleStart.x, scaleEnd.y - scaleStart.y);
      const realDist = prompt('この距離は何cmですか？');
      if (realDist && !isNaN(realDist)) {
        scale = parseFloat(realDist) / pixelDist;
        alert(`スケール設定完了: 1px = ${scale.toFixed(3)}cm`);
      }
      scaleStart = null;
      scaleEnd = null;
      trackingMode = 'none';
      ctx.clearRect(0,0,canvas.width,canvas.height);
    }
  } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
    const frame = Number.isFinite(videoFps)&&videoFps>0 ? currentFrame : Math.round(video.currentTime * (videoFps||30));
    const time = (Number.isFinite(videoFps)&&videoFps>0) ? (frame / videoFps) : video.currentTime;
    const id = document.getElementById('object-select').value || '1';
    trackingData.push({ id, frame, time, x, y });

    const color = colorMap[(parseInt(id) - 1) % colorMap.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x + 5, y);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.stroke();

    video.pause();

    let advance = 1;
    if (e.ctrlKey || e.metaKey) {
      const customStep = normalizeN(document.getElementById('custom-step').value);
      advance = customStep;
    }

    const baseFrame = (Number.isFinite(videoFps)&&videoFps>0) ? currentFrame : Math.round(video.currentTime * (videoFps||30));
    seekToFrame(baseFrame + advance);
  }
});

document.getElementById('set-origin').onclick = () => { trackingMode = 'origin'; };
document.getElementById('set-scale').onclick = () => { trackingMode = 'scale'; };

document.getElementById('export-csv').onclick = () => {
  // Build data rows (first ID) for preview/copy

const dec = 3;
const data = Array.from(trackingData || []);
data.sort((a,b) => (a.frame - b.frame) || (a.id - b.id) || (a.time - b.time));
const ids = [...new Set(data.map(d => d.id))].sort((a,b)=>a-b);
const frames = [...new Set(data.map(d => d.frame))].sort((a,b)=>a-b);

// Header: t / s, x1 / cm, y1 / cm, x2 / cm, y2 / cm, ...
const header = ['t / s', ...ids.flatMap(id => [`x${id} / cm`, `y${id} / cm`])];
const rows = [header];

// Build an index for quick lookup: key = frame-id
const key = (f,id) => f + '|' + id;
const idx = new Map();
for (const d of data) idx.set(key(d.frame, d.id), d);

for (const f of frames) {
  // representative time for the frame
  let any = null;
  for (const id of ids) { const d = idx.get(key(f,id)); if (d) { any = d; break; } }
  const t = (Number.isFinite(videoFps) && videoFps>0 ? (f / videoFps) : (any && isFinite(any.time) ? any.time : 0)).toFixed(3);
  const row = [t];
  for (const id of ids) {
    const d = idx.get(key(f,id));
    if (d) {
      const x = (((d.x - origin.x) * scale)).toFixed(dec);   // already cm
      const y = (((origin.y - d.y) * scale)).toFixed(dec);   // already cm
      row.push(x, y);
    } else {
      row.push('', '');
    }
  }
  rows.push(row);
}

const tsv = rows.map(r => r.join('\t')).join('\r\n');
const csv = rows.map(r => r.join(',')).join('\r\n');

// Create preview panel (no dependency on existing modal)
  let overlay = document.getElementById('csv-preview-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'csv-preview-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:9998;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(overlay);
  }
  let panel = document.getElementById('csv-preview-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'csv-preview-panel';
    panel.style.cssText = 'background:#fff;min-width:540px;max-width:80vw;max-height:80vh;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.25);padding:16px;overflow:auto;z-index:9999;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;';
    overlay.appendChild(panel);
  } else {
    panel.innerHTML = '';
    overlay.style.display = 'flex';
  }

  // Header & actions
  const headerEl = document.createElement('div');
  headerEl.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-family:system-ui,Segoe UI,Arial;';
  headerEl.innerHTML = '<div style="font-weight:600">データ</div>';
  const actions = document.createElement('div');

  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'コピー（TSV）';
  copyBtn.style.cssText = 'margin-right:8px;padding:6px 10px;border-radius:8px;border:1px solid #ddd;background:#f6f6f6;cursor:pointer;';
  actions.appendChild(copyBtn);

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'CSV保存';
  saveBtn.style.cssText = 'margin-right:8px;padding:6px 10px;border-radius:8px;border:1px solid #ddd;background:#f6f6f6;cursor:pointer;';
  actions.appendChild(saveBtn);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '閉じる';
  closeBtn.style.cssText = 'padding:6px 10px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;';
  actions.appendChild(closeBtn);

  headerEl.appendChild(actions);
  panel.appendChild(headerEl);

  // Table
  const tableCtn = document.createElement('div');
  tableCtn.style.cssText = 'max-height:60vh;overflow:auto;border:1px solid #eee;border-radius:8px;';
  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let html = '<table style="border-collapse:collapse;width:100%"><tbody>';
  rows.forEach((r,i) => {
    html += '<tr>' + r.map(c => `<td style="border-bottom:1px solid #f0f0f0;padding:6px 8px;${i===0?'font-weight:600;background:#fafafa;':''}">${esc(c)}</td>`).join('') + '</tr>';
  });
  html += '</tbody></table>';
  tableCtn.innerHTML = html;
  panel.appendChild(tableCtn);

  // Copy logic (TSV text/plain only)
  copyBtn.onclick = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tsv);
      } else {
        const ta = document.createElement('textarea');
        ta.value = tsv; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta);
        ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      copyBtn.textContent = 'コピーしました';
      setTimeout(()=> copyBtn.textContent = 'コピー（TSV）', 1200);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = tsv; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta);
      ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      copyBtn.textContent = 'コピーしました';
      setTimeout(()=> copyBtn.textContent = 'コピー（TSV）', 1200);
    }
  };

  // Save CSV with BOM + CRLF
  saveBtn.onclick = () => {
    const bom = new Uint8Array([0xEF,0xBB,0xBF]);
    const blob = new Blob([bom, csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const dt = new Date();
    const y = dt.getFullYear(); const m = String(dt.getMonth()+1).padStart(2,'0'); const d = String(dt.getDate()).padStart(2,'0');
    a.download = `tracking_${y}${m}${d}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  // Close
  closeBtn.onclick = () => { overlay.style.display = 'none'; };

  // Show
  overlay.style.display = 'flex';

};

['back10','back8','back5','back1','forward1','forward5','forward8','forward10'].forEach(id => {
  document.getElementById(id).onclick = () => {
    const delta = {
      back10: -10,
      back8: -8,
      back5: -5,
      back1: -1,
      forward1: 1,
      forward5: 5,
      forward8: 8,
      forward10: 10
    }[id];
    seekToFrame((Number.isFinite(videoFps)&&videoFps>0 ? currentFrame : Math.round(video.currentTime*(videoFps||30))) + delta);
  };
});

document.getElementById('frame-slider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  const duration = video.duration || 1;
  const targetTime = (val / 1000) * duration;
  const fps = (Number.isFinite(videoFps) && videoFps > 0) ? videoFps : 30;
  const targetFrame = Math.round(targetTime * fps);
  seekToFrame(targetFrame);
});
video.addEventListener('loadedmetadata', () => {
  currentFrame = 0;
  // 推定FPSを計算してポップアップ表示
  let __estFps = 30;
  try {
    const duration = video.duration || 0;
    const frames = Math.floor((video.getVideoPlaybackQuality?.().totalVideoFrames) || (duration * 30));
    if (duration > 0 && frames > 0) __estFps = Math.round(frames / duration);
  } catch (e) {}
  try {
    const saved = parseFloat(localStorage.getItem('tracking_video_fps'));
    if (Number.isFinite(saved) && saved > 0) __estFps = saved;
  } catch(_){}
  showFpsPrompt(__estFps);
document.getElementById('frame-slider').max = 1000;

  adjustCanvasSize();
});

video.addEventListener('timeupdate', () => {
  const duration = video.duration || 1;
  document.getElementById('frame-slider').value = Math.floor((video.currentTime / duration) * 1000);
});


video.addEventListener('seeked', () => { try { (typeof redrawFrameWithMarks==='function'?redrawFrameWithMarks():drawFrame()); } catch(e){ console.warn(e);} });
video.addEventListener('play', () => {
  function step() {
    if (video.paused || video.ended) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    requestAnimationFrame(step);
  }
  step();
});

function adjustCanvasSize() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  canvas.width = video.clientWidth;
  canvas.height = video.clientHeight;
}

window.addEventListener('resize', adjustCanvasSize);


document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('custom-back');
  const forwardBtn = document.getElementById('custom-forward');
  const stepInput = document.getElementById('custom-step');

  if (backBtn && forwardBtn && stepInput) {
    backBtn.onclick = () => { const step = normalizeN(stepInput.value); seekToFrame(currentFrame - step); };
    forwardBtn.onclick = () => { const step = normalizeN(stepInput.value); seekToFrame(currentFrame + step); };
  }
});



// ====== Frame seeking helper ======
function seekToFrame(target) {
  try {
    const fps = (Number.isFinite(videoFps) && videoFps > 0) ? videoFps : 30;
    let f = Math.max(0, Math.round(target||0));
    // Clamp to duration if available
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      const maxF = Math.max(0, Math.floor(video.duration * fps) - 1);
      if (f > maxF) f = maxF;
    }
    currentFrame = f;
    video.pause();
    video.currentTime = f / fps;
    const slider = document.getElementById('frame-slider');
    if (slider && Number.isFinite(video.duration) && video.duration > 0) {
      slider.value = Math.floor((video.currentTime / video.duration) * 1000);
    }
  } catch (e) { console.error(e); }
}

// ===== FPS 確認ポップアップ =====
function showFpsPrompt(estimated){
  try{
    // Overlay
    let ov = document.getElementById('fps-overlay');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'fps-overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:10000;display:flex;align-items:center;justify-content:center;';
      document.body.appendChild(ov);
    } else {
      ov.style.display = 'flex';
    }
    // Panel
    let panel = document.getElementById('fps-panel');
    if(!panel){
      panel = document.createElement('div');
      panel.id = 'fps-panel';
      panel.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.25);min-width:420px;max-width:90vw;padding:16px 16px 12px;font:14px/1.5 system-ui,Segoe UI,Arial;';
      ov.appendChild(panel);
    } else {
      panel.innerHTML = '';
    }
    // Title
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:8px;';
    title.textContent = 'FPS（フレームレート）の確認';
    panel.appendChild(title);
    // Desc
    const desc = document.createElement('div');
    desc.style.cssText = 'color:#444;font-size:13px;margin-bottom:10px;';
    desc.innerHTML = '映像の <b>fps</b> を入力・確認してください。<br>推定値を入れてあります。必要に応じて修正してください。';
    panel.appendChild(desc);
    // Input
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;';
    const label = document.createElement('label');
    label.textContent = 'fps:';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0.1';
    input.step = '0.001';
    input.style.cssText = 'width:120px;padding:6px 8px;border:1px solid #ddd;border-radius:8px;';
    const initial = (Number.isFinite(videoFps) && videoFps>0) ? videoFps : (estimated||30);
    input.value = String(initial);
    row.appendChild(label);
    row.appendChild(input);
    panel.appendChild(row);
    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    const ok = document.createElement('button');
    ok.textContent = 'OK';
    ok.style.cssText = 'padding:6px 12px;border-radius:8px;border:1px solid #ddd;background:#f6f6f6;cursor:pointer;';
    const cancel = document.createElement('button');
    cancel.textContent = 'キャンセル';
    cancel.style.cssText = 'padding:6px 12px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;';
    actions.appendChild(cancel);
    actions.appendChild(ok);
    panel.appendChild(actions);

    cancel.onclick = () => { ov.style.display='none'; };
    ok.onclick = () => {
      let val = parseFloat(input.value);
      if(!Number.isFinite(val) || val<=0) val = estimated||30;
      videoFps = val;
      try { localStorage.setItem('tracking_video_fps', String(videoFps)); } catch(_){}
      // resync integer frame from currentTime
      if (Number.isFinite(videoFps) && videoFps>0) { currentFrame = Math.round(video.currentTime * videoFps); }
      const fpsDisp = document.getElementById('fps-display');
      if (fpsDisp) fpsDisp.textContent = `fps: ${videoFps}`;
      ov.style.display='none';
    };
  }catch(e){ console.error(e); }
}

// ツールバーにFPSボタン（再設定用）
(function(){
  const toolbar = document.querySelector('.toolbar') || document.getElementById('controls') || document.body;
  if (!toolbar) return;
  const btn = document.createElement('button');
  btn.id = 'fps-quick-btn';
  btn.textContent = 'FPS設定';
  btn.style.cssText = 'margin-left:8px;padding:6px 10px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;';
  btn.onclick = ()=>{
    let est = Number.isFinite(videoFps) && videoFps>0 ? videoFps : 30;
    showFpsPrompt(est);
  };
  toolbar.appendChild(btn);
})();


// ---- Prevent browser zoom while tracking ----
(function preventZoomGuard(){
  try {
    window.addEventListener('wheel', (ev)=>{
      if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); }
    }, { passive: false });
    window.addEventListener('keydown', (ev)=>{
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === '+' || ev.key === '=' || ev.key === '-' )) {
        ev.preventDefault();
      }
    });
  } catch(_) {}
})();


// ---- Fixed step buttons ----
(function(){
  const map = [
    ['back10', -10], ['back8', -8], ['back5', -5], ['back1', -1],
    ['forward1', 1], ['forward5', 5], ['forward8', 8], ['forward10', 10],
  ];
  for (const [id, delta] of map) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('click', () => {
      const base = Number.isFinite(videoFps)&&videoFps>0 ? currentFrame : Math.round(video.currentTime * (videoFps||30));
      seekToFrame(base + delta);
    });
  }
})();

// --- block any dblclick fullscreen/zoom in video area (robust) ---
(function(){
  const cont = document.querySelector('.video-container');
  const videoEl = document.getElementById('video');
  const cvs = document.getElementById('canvas');
  const block = (e)=>{
    // Only guard inside the video area
    const within = cont && cont.contains(e.target);
    if (within) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); return false; }
  };
  // Use capture to intercept before native handlers
  if (cont) cont.addEventListener('dblclick', block, {capture:true});
  if (cvs) cvs.addEventListener('dblclick', block, {capture:true});
  if (videoEl) videoEl.addEventListener('dblclick', block, {capture:true});
})();


// --- block OS/browser gestures on modifier + down inside canvas (capture) ---
function __blockModifierDown(e){
  if (e && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
}
try {
  const __c = document.getElementById('canvas');
  if (__c) {
    ['pointerdown','mousedown','touchstart'].forEach(ev => __c.addEventListener(ev, __blockModifierDown, {capture:true}));
  }
} catch(_) {}


// --- normalize N (remove spaces, convert full-width digits to half-width) ---
function normalizeN(v){
  try{
    return parseInt(String(v).replace(/[\u3000\s]/g,'').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0)-0xFF10+0x30)), 10) || 1;
  }catch(_){ return 1; }
}
