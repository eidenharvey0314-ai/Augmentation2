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

// Initialize Camera (Defaults to Rear Camera on Mobile)
async function setupCamera() {
  const constraints = {
    video: {
      facingMode: { exact: "environment" },
      width: { ideal: 640 }, // Optimized resolution for mobile performance
      height: { ideal: 480 }
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

// Match bounding boxes to previous frames for persistent tracking IDs
function updateTrackingHistory(predictions) {
  const currentDetections = predictions.slice(0, 4); // Capped at 4 items
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
    if (history.length > 10) history.shift(); // Trail length limit for performance

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

// Render video frame and overlay visuals
function renderFrame(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(video, 0, 0, width, height);

  const scaleX = width / video.videoWidth;
  const scaleY = height / video.videoHeight;

  trackedObjects.forEach(obj => {
    const [x, y, w, h] = obj.bbox;

    const scaledX = x * scaleX;
    const scaledY = y * scaleY;
    const scaledW = w * scaleX;
    const scaledH = h * scaleY;

    // 1. Motion Trail Line
    if (obj.history.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
      ctx.lineWidth = 2;
      obj.history.forEach((pt, i) => {
        const hX = pt.x * scaleX;
        const hY = pt.y * scaleY;
        if (i === 0) ctx.moveTo(hX, hY);
        else ctx.lineTo(hX, hY);
      });
      ctx.stroke();
    }

    // 2. Bounding Box
    ctx.strokeStyle = '#00FF88';
    ctx.lineWidth = 2;
    ctx.strokeRect(scaledX, scaledY, scaledW, scaledH);

    // 3. Center Point
    const cx = obj.centerX * scaleX;
    const cy = obj.centerY * scaleY;
    ctx.fillStyle = '#00FF88';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
    ctx.fill();

    // 4. Label Badge
    const labelText = `#${obj.id} ${obj.label} (${Math.round(obj.score * 100)}%)`;
    ctx.font = 'bold 12px sans-serif';
    const textWidth = ctx.measureText(labelText).width;

    ctx.fillStyle = '#00FF88';
    ctx.fillRect(scaledX, scaledY > 20 ? scaledY - 20 : scaledY, textWidth + 10, 20);

    ctx.fillStyle = '#000000';
    ctx.fillText(labelText, scaledX + 4, scaledY > 20 ? scaledY - 5 : scaledY + 14);
  });
}

// Frame Processing Loop
async function processFrame() {
  if (canvasLeft.width !== video.videoWidth) {
    canvasLeft.width = video.videoWidth;
    canvasLeft.height = video.videoHeight;
    canvasRight.width = video.videoWidth;
    canvasRight.height = video.videoHeight;
  }

  if (!isDetecting) {
    isDetecting = true;
    const predictions = await model.detect(video);
    updateTrackingHistory(predictions);
    isDetecting = false;
  }

  renderFrame(ctxLeft, canvasLeft.width, canvasLeft.height);

  if (isVrMode) {
    renderFrame(ctxRight, canvasRight.width, canvasRight.height);
  }

  requestAnimationFrame(processFrame);
}

// VR Toggle and Fullscreen Rotation
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
      console.log("Fullscreen or orientation lock warning:", e);
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

// Application Entry Point
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

// Start once DOM is fully loaded
document.addEventListener("DOMContentLoaded", init);
