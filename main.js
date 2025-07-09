let videoFps = 30;

let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
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

canvas.addEventListener('click', (e) => {
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
    }
  } else if (e.shiftKey) {
    const time = video.currentTime;
    const frame = Math.floor(time * videoFps);
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
    video.currentTime = time + 1 / videoFps;
  }
});

document.getElementById('set-origin').onclick = () => { trackingMode = 'origin'; };
document.getElementById('set-scale').onclick = () => { trackingMode = 'scale'; };

document.getElementById('export-csv').onclick = () => {
  let frames = {};
  trackingData.forEach(d => {
    if (!frames[d.frame]) {
      frames[d.frame] = { time: d.time };
    }
    frames[d.frame][`id${d.id}_x`] = ((d.x - origin.x) * scale).toFixed(2);
    frames[d.frame][`id${d.id}_y`] = ((origin.y - d.y) * scale).toFixed(2);
  });

  let header = ['frame', 'time'];
  const ids = [...new Set(trackingData.map(d => d.id))].sort();
  ids.forEach(id => {
    header.push(`id${id}_x`, `id${id}_y`);
  });

  let csv = header.join(',') + '\n';
  Object.keys(frames).sort((a,b)=>a-b).forEach(frame => {
    let row = [frame, frames[frame].time.toFixed(8)];
    ids.forEach(id => {
      row.push(frames[frame][`id${id}_x`] || '', frames[frame][`id${id}_y`] || '');
    });
    csv += row.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'tracking_grouped.csv';
  link.click();
};

['back10','back1','forward1','forward10'].forEach(id => {
  document.getElementById(id).onclick = () => {
    const delta = { back10:-10, back1:-1, forward1:1, forward10:10 }[id];
    video.currentTime = Math.max(0, video.currentTime + delta / 30);
  };
});

document.getElementById('frame-slider').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  const duration = video.duration || 1;
  video.currentTime = (val / 1000) * duration;
});

video.addEventListener('loadedmetadata', () => {
    let fps = 30; // デフォルトfps
    try {
        const duration = video.duration;
        const frames = Math.floor(video.getVideoPlaybackQuality?.().totalVideoFrames || duration * 30);
        fps = Math.round(frames / duration);
    } catch (e) {}
    const confirmFps = confirm(`この動画のfpsは ${fps} ですか？`);
    if (!confirmFps) {
        const input = prompt("正しいfpsを入力してください", fps);
        fps = parseFloat(input);
    }
    videoFps = fps;

  document.getElementById('frame-slider').max = 1000;
});

video.addEventListener('timeupdate', () => {
  const duration = video.duration || 1;
  document.getElementById('frame-slider').value = Math.floor((video.currentTime / duration) * 1000);
});

video.addEventListener('play', () => {
  function step() {
    if (video.paused || video.ended) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    requestAnimationFrame(step);
  }
  step();
});
