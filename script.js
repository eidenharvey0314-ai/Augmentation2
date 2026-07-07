import {
HandLandmarker,
FilesetResolver

} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video=document.getElementById("video");
const canvas=document.getElementById("canvas");
const ctx=canvas.getContext("2d");

let zoom=1;

let stereo=false;

canvas.width=window.innerWidth;
canvas.height=window.innerHeight;

// Detect mobile devices
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const constraints = {
   video: isMobile
?{
    facingMode:{
        ideal:"environment"
    },
    width:{ideal:1280},
    height:{ideal:720},
    frameRate:{ideal:24,max:24}
}
:true
    audio: false
};

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const TARGET_FPS = isMobile ? 24 : 60;
const FRAME_TIME = 1000 / TARGET_FPS;

let lastFrame = 0;

try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
} catch (err) {
    console.error("Couldn't access preferred camera, trying any camera...", err);

    // Fallback if the rear camera isn't available
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
    });

    video.srcObject = stream;
}

const vision=await FilesetResolver.forVisionTasks(
"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
);

const handLandmarker=await HandLandmarker.createFromOptions(

vision,

{

baseOptions:{

modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

},

runningMode:"VIDEO",

numHands:1

}

);

function distance(a,b){

let dx=a.x-b.x;
let dy=a.y-b.y;

return Math.sqrt(dx*dx+dy*dy);

}

requestAnimationFrame(draw);

function draw(now = 0) {

    requestAnimationFrame(draw);

    if (now - lastFrame < FRAME_TIME) return;
    lastFrame = now;

ctx.clearRect(0,0,canvas.width,canvas.height);

let w=video.videoWidth;
let h=video.videoHeight;

let zw=w/zoom;
let zh=h/zoom;

ctx.drawImage(

video,

(w-zw)/2,
(h-zh)/2,
zw,
zh,

0,
0,
canvas.width,
canvas.height

);

const vrButton = document.getElementById("vrButton");

vrButton.onclick = async () => {

    stereo = !stereo;

    if (stereo) {

        try {
            await document.documentElement.requestFullscreen();
        } catch (e) {}

        if (screen.orientation?.lock) {
            try {
                await screen.orientation.lock("landscape");
            } catch (e) {}
        }

    } else {

        if (document.fullscreenElement) {
            await document.exitFullscreen();
        }

        if (screen.orientation?.unlock) {
            screen.orientation.unlock();
        }

    }

};
    
if(stereo){

ctx.clearRect(0,0,canvas.width,canvas.height);

const half = canvas.width / 2;

ctx.drawImage(
    video,
    sx,sy,sw,sh,
    0,0,
    half,
    canvas.height
);

ctx.drawImage(
    video,
    sx,sy,sw,sh,
    half,0,
    half,
    canvas.height
);

}

if(video.readyState>=2){

const result=handLandmarker.detectForVideo(video,performance.now());

if(result.landmarks.length){

const hand=result.landmarks[0];

const index=hand[8];

const middle=hand[12];

const thumb=hand[4];

const pinky=hand[20];

const spread=distance(index,middle);

const handSize=distance(thumb,pinky);

if(spread>.12){

zoom+=0.03;

}

zoom=Math.min(8,zoom);

if(handSize>.55){

zoom=1;

}

}

}

requestAnimationFrame(draw);

}

await video.play();
draw();

document.getElementById("vrButton").onclick=()=>{

if(!document.fullscreenElement){

document.documentElement.requestFullscreen();

}else{

document.exitFullscreen();

}

stereo=!stereo;

}
