const video = document.getElementById('webcam');
const canvasLeft = document.getElementById('canvas-left');
const ctxLeft = canvasLeft.getContext('2d');
const canvasRight = document.getElementById('canvas-right');
const ctxRight = canvasRight.getContext('2d');

const statusText = document.getElementById('status');
const vrBtn = document.getElementById('vr-btn');
const rightEye = document.getElementById('right-eye');

let model;
let isVrMode = false;
let isDetecting = false;

let trackedObjects = [];
let nextTrackId = 1;

// 1. Setup Rear Camera
async function setupCamera() {
  const constraints = {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
  } catch (err) {
    console.warn("Exact rear camera unavailable, using default environment mode.");
    const fallbackStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    video.srcObject = fallbackStream;
  }

  return new Promise((resolve) => {
    video.onloadedmetadata = () => resolve(video);
  });
}

// 2. Track Objects Across Frames
function updateTrackingHistory(predictions) {
  const currentDetections = predictions.slice(0, 4);
  const updatedTracked = [];

  currentDetections.forEach(pred => {
    const [x, y, w, h] = pred.bbox;
    const centerX = x + w / 2;
    const centerY = y + h / 2;

    let closest = null;
    let minDistance = 80;

    trackedObjects.forEach(obj => {
      const dist = Math.hypot(obj.centerX - centerX, obj.centerY - centerY);
      if (dist < minDistance && obj.label === pred.class) {
        minDistance = dist;
        closest = obj;
      }
    });

    let history = [];
    let id = nextTrackId++;

    if (closest) {
      id = closest.id;
      history = closest.history;
    }

    history.push({ x: centerX, y: centerY });
    if (history.length > 10) history.shift();

    updatedTracked.push({
      id: id,
      label: pred.class,
      score: pred.score,
      bbox: pred.bbox,
      centerX: centerX,
      centerY: centerY,
      history: history
    });
  });

  trackedObjects = updatedTracked;
}

// 3. Render Full-Cover Canvas Frame
function renderFrame(ctx, canvas) {
  const parent = canvas.parentElement;
  const targetWidth = parent.clientWidth;
  const targetHeight = parent.clientHeight;

  // Force physical canvas resolution to match display size exactly
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  ctx.clearRect(0, 0, targetWidth, targetHeight);

  // Compute scale factors to cover full canvas (Object-Fit: Cover)
  const vWidth = video.videoWidth || 640;
  const vHeight = video.videoHeight || 480;

  const scale = Math.max(targetWidth / vWidth, targetHeight / vHeight);
  const renderW = vWidth * scale;
  const renderH = vHeight * scale;
  const offsetX = (targetWidth - renderW) / 2;
  const offsetY = (targetHeight - renderH) / 2;

  // Draw scaled camera background
  ctx.drawImage(video, offsetX, offsetY, renderW, renderH);

  // Scale overlay coordinates
  const scaleX = renderW / vWidth;
  const scaleY = renderH / vHeight;

  trackedObjects.forEach(obj => {
    const [x, y, w, h] = obj.bbox;

    const scaledX = (x * scaleX) + offsetX;
    const scaledY = (y * scaleY) + offsetY;
    const scaledW = w * scaleX;
    const scaledH = h * scaleY;

    // Motion Trail
    if (obj.history.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
      ctx.lineWidth = 2;
      obj.history.forEach((pt, i) => {
        const hX = (pt.x * scaleX) + offsetX;
        const hY = (pt.y * scaleY) + offsetY;
        if (i === 0) ctx.moveTo(hX, hY);
        else ctx.lineTo(hX, hY);
      });
      ctx.stroke();
    }

    // Bounding Box
    ctx.strokeStyle = '#00FF88';
    ctx.lineWidth = 2;
    ctx.strokeRect(scaledX, scaledY, scaledW, scaledH);

    // Center Point
    const cx = (obj.centerX * scaleX) + offsetX;
    const cy = (obj.centerY * scaleY) + offsetY;
    ctx.fillStyle = '#00FF88';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
    ctx.fill();

    // Label Badge
    const labelText = `#${obj.id} ${obj.label} (${Math.round(obj.score * 100)}%)`;
    ctx.font = 'bold 12px sans-serif';
    const textWidth = ctx.measureText(labelText).width;

    ctx.fillStyle = '#00FF88';
    ctx.fillRect(scaledX, scaledY > 20 ? scaledY - 20 : scaledY, textWidth + 10, 20);

    ctx.fillStyle = '#000000';
    ctx.fillText(labelText, scaledX + 4, scaledY > 20 ? scaledY - 5 : scaledY + 14);
  });
}

// 4. Main Processing Loop
async function processFrame() {
  if (!isDetecting && video.readyState === 4) {
    isDetecting = true;
    const predictions = await model.detect(video);
    updateTrackingHistory(predictions);
    isDetecting = false;
  }

  renderFrame(ctxLeft, canvasLeft);

  if (isVrMode) {
    renderFrame(ctxRight, canvasRight);
  }

  requestAnimationFrame(processFrame);
}

// 5. Toggle VR Split Screen
async function toggleVR() {
  isVrMode = !isVrMode;

  if (isVrMode) {
    rightEye.style.display = 'block';

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {
      console.log("Fullscreen lock warning:", e);
    }
  } else {
    rightEye.style.display = 'none';

    if (document.exitFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  }
}

vrBtn.addEventListener('click', toggleVR);

// Entry Point
async function init() {
  try {
    await setupCamera();
    statusText.innerText = "Loading AI model...";
    model = await cocoSsd.load();
    statusText.innerText = "Tracking active (Max 4 objects)";
    setTimeout(() => { statusText.style.opacity = '0.3'; }, 3000);
    processFrame();
  } catch (err) {
    statusText.innerText = "Error: " + err.message;
  }
}

document.addEventListener("DOMContentLoaded", init);
