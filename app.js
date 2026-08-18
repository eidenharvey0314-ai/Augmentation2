const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status');

let model = null;

// Initialize camera feed targeting rear-facing camera on mobile devices
async function setupCamera() {
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: "environment" }, // Prioritize rear camera
      width: { ideal: 640 },
      height: { ideal: 480 }
    }
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    return new Promise((resolve) => {
      video.onloadedmetadata = () => {
        resolve(video);
      };
    });
  } catch (error) {
    statusText.innerText = 'Camera access denied or unassigned.';
    console.error('Error accessing camera:', error);
  }
}

// Draw detection frames & label tags over detected targets
function renderDetections(predictions) {
  // Clear previous frame overlays
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Filter & limit detections up to max 10 objects
  const trackedObjects = predictions.slice(0, 10);

  trackedObjects.forEach((pred) => {
    const [x, y, width, height] = pred.bbox;
    const label = `${pred.class} (${Math.round(pred.score * 100)}%)`;

    // Draw bounding outline
    ctx.strokeStyle = '#00E676';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);

    // Render background badge for label text
    ctx.fillStyle = '#00E676';
    ctx.font = '16px Arial';
    const textWidth = ctx.measureText(label).width;
    ctx.fillRect(x, y > 24 ? y - 24 : y, textWidth + 8, 24);

    // Write text details
    ctx.fillStyle = '#000000';
    ctx.fillText(label, x + 4, y > 24 ? y - 7 : y + 17);
  });
}

// Continuous detection loop run on video animation frames
async function detectLoop() {
  if (video.readyState === 4) {
    // Canvas dimensions relative to standard video stream pixels
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Pass maxNumBoxes constraint directly to object detection model
    const predictions = await model.detect(video, 10, 0.5);
    renderDetections(predictions);
  }
  requestAnimationFrame(detectLoop);
}

// Application startup orchestration
async function init() {
  try {
    await setupCamera();
    statusText.innerText = 'Loading Object Tracker...';
    
    // Load lightweight COCO-SSD mobile neural network
    model = await cocoSsd.load();
    statusText.innerText = 'Tracking active! Point camera at objects.';
    
    detectLoop();
  } catch (err) {
    statusText.innerText = 'Initialization failed.';
    console.error(err);
  }
}

init();
