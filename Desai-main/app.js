import { 
    HandLandmarker, 
    FilesetResolver,
    DrawingUtils 
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

// --- 定数とDOM要素 ---
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const statusElement = document.getElementById("status");
const drawingUtils = new DrawingUtils(canvasCtx);

// 魔法ステッキ制御用のDOM要素 (index.htmlにある前提)
const stick = document.getElementById("magic-stick");
const tip = document.getElementById("magic-tip");
const nose = document.getElementById("nose");
const eyeLeft = document.getElementById("eye-left");
const eyeRight = document.getElementById("eye-right");
const lines = ["rain-line1","rain-line2","rain-line3","rain-line4","rain-line5","rain-line6","rain-line7"].map(id => document.getElementById(id));

const eyes = [
    { el: eyeLeft, cx: 245, cy: 52 },
    { el: eyeRight, cx: 315, cy: 52 }
];

let handLandmarker = undefined;
let runningMode = "VIDEO";
let lastVideoTime = -1;
let lineIndexes = lines.map((_, i) => i % 7);
let hoverIntervals = [];

// ===============================================
// ユーティリティ: ジェスチャー認識ロジック
// ===============================================

/**
 * 手のひらの中心座標 (正規化された座標 0-1) とジェスチャー名を取得
 * @param {import("@mediapipe/tasks-vision").NormalizedLandmarkList} landmarks 
 */
function getHandData(landmarks) {
    if (!landmarks || landmarks.length === 0) {
        return { x: -1, y: -1, gesture: "None" };
    }
    
    // 手のひらの中央 (ランドマーク 0, 5, 9, 13, 17 の平均)
    const center_x = (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) / 5;
    const center_y = (landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) / 5;

    // 簡易的な指差し (人差し指の先端(8)が、中指の付け根(9)より上にある)
    // Y座標は上ほど小さい
    const is_pointing = (landmarks[8].y < landmarks[9].y);
    
    const gesture_name = is_pointing ? "Point" : "Move";
    
    return { x: center_x, y: center_y, gesture: gesture_name };
}

// ===============================================
// 魔法少女PWA制御関数 (前回のWebSocket版ロジックを流用)
// ===============================================

function updateMagicWand(normalizedX, normalizedY, gesture) {
    // 正規化された座標 (0-1) を画面ピクセル座標に変換
    const screenX = window.innerWidth * (1 - normalizedX); // X軸を反転
    const screenY = window.innerHeight * normalizedY;
    
    // ステッキ本体の位置調整
    const stickX = screenX - 140; 
    const stickY = screenY - 10;
    
    if (stick) {
        stick.style.left = stickX + "px";
        stick.style.top  = stickY + "px";
        
        // ステッキ先端の基準座標を更新 (円運動用)
        window.tipBaseX = stickX + 140;
        window.tipBaseY = stickY + 6;
    }
    
    // 目の追尾処理
    updateEyeTracking(screenX, screenY);
    
    // ジェスチャーによるエフェクト制御
    if (gesture === "Point") {
        startNoseRainbow();
    } else if (gesture === "Move") {
        stopNoseRainbow();
    }
}

// 目の追尾処理 (ロジック変更なし)
function updateEyeTracking(screenX, screenY) {
    // ... (前回の updateEyeTracking 関数と同じロジックをここに挿入) ...
    const maxOffset = 5; 
        
    eyes.forEach(eye => {
        const eyeRect = eye.el.getBoundingClientRect();
        
        const eyeCenterX = eyeRect.left + eyeRect.width / 2;
        const eyeCenterY = eyeRect.top + eyeRect.height / 2;

        const angle = Math.atan2(screenY - eyeCenterY, screenX - eyeCenterX);
        
        const offsetX = Math.cos(angle) * maxOffset;
        const offsetY = Math.sin(angle) * maxOffset;

        eye.el.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });
}


// 鼻のレインボーアニメーション制御 (ロジック変更なし)
function startNoseRainbow() {
    // ... (前回の startNoseRainbow 関数と同じロジックをここに挿入) ...
    const colorline = ["red","orange","yellow","green","blue","indigo","violet"];
    const lineSpeeds = lines.map(() => 200 + Math.random() * 300);

    if (hoverIntervals.length) return; 
    
    nose?.classList.add("rainbow-flow");
    tip?.classList.add("hidden");
    
    lines.forEach(line => line.setAttribute("visibility", "visible"));
    
    lines.forEach((line, i) => {
        const interval = setInterval(() => {
            line.setAttribute("stroke", colorline[lineIndexes[i]]);
            lineIndexes[i] = (lineIndexes[i] + 1) % colorline.length;
        }, lineSpeeds[i]);
        hoverIntervals.push(interval);
    });
}

function stopNoseRainbow() {
    // ... (前回の stopNoseRainbow 関数と同じロジックをここに挿入) ...
    nose?.classList.remove("rainbow-flow");
    tip?.classList.remove("hidden");

    lines.forEach(line => line.setAttribute("stroke", "black"));
    hoverIntervals.forEach(interval => clearInterval(interval));
    hoverIntervals = [];
}

// ===============================================
// MediaPipe ロードと推論ループ
// ===============================================

async function createHandLandmarker() {
    statusElement.textContent = "Initializing Hand Landmarker... (Downloading model files)";
    
    // MediaPipe の依存ファイルをロード
    const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    statusElement.textContent = "Model files loaded. Creating Landmarker instance...";

    // Hand Landmarker インスタンスの作成 (FastAPI版のmp_hands.Hands()に相当)
    handLandmarker = await HandLandmarker.create(filesetResolver, {
        baseOptions: {
            // 軽量な検出モデルを使用
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU" 
        },
        runningMode: runningMode,
        numHands: 1, // 1つの手のみ検出
        minHandDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5 
    });
    
    statusElement.textContent = "Model Ready. Please grant camera permission.";
    enableCam();
}

function enableCam() {
    // カメラの制約を設定 (FastAPI版と同じ 640x480)
    const constraints = {
        video: {
            width: { ideal: VIDEO_WIDTH },
            height: { ideal: VIDEO_HEIGHT }
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        })
        .catch((err) => {
            let errorMessage = `ERROR: Webcam access failed. (${err.name})`;
            statusElement.textContent = errorMessage;
            console.error("Webcam Error Details:", err);
        });
}

function predictWebcam() {
    
    let startTimeMs = performance.now();
    
    // --- 1. 検出 ---
    let results;
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        results = handLandmarker.detectForVideo(video, startTimeMs);
    }
    
    // --- 2. 描画とデータ送信 ---
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
    
    // ビデオ映像を Canvas に描画
    // CSSで反転させているため、ここでさらに反転させる必要はない
    canvasCtx.drawImage(video, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT); 

    let handDetected = false;

    if (results && results.landmarks) {
        for (const landmarks of results.landmarks) {
            handDetected = true;
            
            // MediaPipeの描画ユーティリティを使ってランドマークを描画 (デバッグ用)
            drawingUtils.drawConnectors(landmarks, mp_hands.HAND_CONNECTIONS, {
                color: "#00FF00",
                lineWidth: 5
            });
            drawingUtils.drawLandmarks(landmarks, {
                color: "#FF0000",
                lineWidth: 2
            });
            
            // ジェスチャー認識とPWA制御
            const handData = getHandData(landmarks);
            updateMagicWand(handData.x, handData.y, handData.gesture);
        }
    }

    if (!handDetected) {
        // 手が検出されない場合はアイドル状態へ
        stopNoseRainbow();
        // キョロキョロアニメーションの開始 (ここでは省略、HTML側のロジックに任せる)
    }
    
    canvasCtx.restore();

    // FPS計算と表示
    const endTimeMs = performance.now();
    const fps = Math.round(1000 / (endTimeMs - startTimeMs));
    statusElement.textContent = `FPS: ${fps} | Hand Tracking: ${handDetected ? 'Active' : 'Searching...'}`;

    // ループ継続
    window.requestAnimationFrame(predictWebcam);
}


// --- アプリケーション開始 ---
createHandLandmarker();

// ステッキ先端の円運動 (PWA制御のコードを維持)
let angle = 0;
const radius = 18;
setInterval(() => {
    if (!window.tipBaseX) return;
    angle += 0.1;
    const x = window.tipBaseX + Math.cos(angle) * radius;
    const y = window.tipBaseY + Math.sin(angle) * radius;
    tip.style.left = x + "px";
    tip.style.top  = y + "px";
    // パーティクル生成 (PWA側のロジックに依存)
    // spawnParticle(x, y); 
}, 16);