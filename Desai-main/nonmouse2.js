// =========================================================================
// NonMouse Web シミュレーション - メインスクリプト (nonmouse2.js)
// MediaPipe Hands (Legacy Model) を使用 / WASM Abort エラー対応済み
// =========================================================================

// --- 1. 定数とDOM要素の取得 ---
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

// HTML要素
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// 仮想カーソル要素 
const stickContainer = document.getElementById('magic-stick-container'); 
const tip = document.getElementById('magic-tip'); 
const particlesContainer = document.getElementById('magic-particles'); 
const feedbackOverlay = document.getElementById('feedback-overlay');


// --- 2. MediaPipe Hands の初期化 ---
// ⚠ MediaPipe のバージョンによっては、`locateFile` のパス指定方法が異なる場合があります。
const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
  maxNumHands: 1, 
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.5
});

hands.onResults(onResults);

// --- 3. Webカメラの設定 ---
const camera = new Camera(videoElement, {
  onFrame: async () => {
    // ★★★ WASM Abort エラー対策: videoElementがデータを持っているか確認 ★★★
    // readyState >= 2 (HAVE_CURRENT_DATA) でデータを送信
    if (videoElement.readyState >= 2) {
        try {
            await hands.send({image: videoElement});
        } catch (e) {
            // エラーが発生しても処理を継続させる
            console.error("MediaPipe hands.send failed (WASM Abort risk averted):", e);
        }
    }
  },
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT
});

camera.start().then(() => {
    console.log("Camera started successfully. Drawing area initialized.");
    canvasElement.width = VIDEO_WIDTH;
    canvasElement.height = VIDEO_HEIGHT;
}).catch(e => {
    console.error("Camera failed to start:", e);
});


// --- 4. メインロジック: 検出結果の処理 ---
let isClickGesture = false; 
let lastClickTime = 0;      
const CLICK_COOLDOWN = 500; // クリッククールダウン (ms)

function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Canvasの描画を鏡像にする
  canvasCtx.scale(-1, 1);
  canvasCtx.translate(-canvasElement.width, 0);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0]; 
    
    // --- 4-1. 仮想カーソル座標の計算 ---
    // 人差し指の先端(8)を追跡ポイントとする
    const tipLandmark = landmarks[mpHands.HAND_LANDMARKS.INDEX_FINGER_TIP]; 
    
    // MediaPipe座標 (0-1) を画面ピクセル座標に変換
    // X軸: 鏡像表示のため、(1 - x) を画面幅にかける
    const pxX = (1 - tipLandmark.x) * window.innerWidth;
    const pxY = tipLandmark.y * window.innerHeight;
    
    // --- 4-2. 仮想カーソル (ステッキ) の移動 ---
    if (stickContainer) {
        // 親コンテナ (stickContainer) を人差し指の先端位置に移動させる
        stickContainer.style.transform = `translate(${pxX}px, ${pxY}px)`;
        stickContainer.style.left = `0`; 
        stickContainer.style.top = `0`;
    }
    
    // --- 4-3. クリックジェスチャー判定 (ピンチ) ---
    const thumbTip = landmarks[mpHands.HAND_LANDMARKS.THUMB_TIP];
    const indexTip = landmarks[mpHands.HAND_LANDMARKS.INDEX_FINGER_TIP];
    
    // 3D空間での相対距離
    const dist = Math.sqrt(
      (thumbTip.x - indexTip.x)**2 + 
      (thumbTip.y - indexTip.y)**2 + 
      (thumbTip.z - indexTip.z)**2
    );

    const CLICK_THRESHOLD = 0.05; // 適切なピンチ距離閾値
    
    if (dist < CLICK_THRESHOLD && !isClickGesture) {
      if (Date.now() - lastClickTime > CLICK_COOLDOWN) {
        
        // 仮想クリックイベントの発火
        simulateClick(pxX, pxY); 
        
        isClickGesture = true;
        lastClickTime = Date.now();
        showFeedback("CLICK!");
        
        // クリック時のパーティクルバースト
        for(let i=0; i<10; i++) {
             spawnParticle(pxX, pxY, true); // バーストフラグを立てる
        }
      }
    } else if (dist >= CLICK_THRESHOLD) {
      isClickGesture = false;
    }
    
    // --- 4-4. Canvasにランドマークを描画 (デバッグ) ---
    // 
    drawConnectors(canvasCtx, landmarks, mpHands.HAND_CONNECTIONS,
                   {color: '#00FF00', lineWidth: 5});
    drawLandmarks(canvasCtx, landmarks, {
        color: '#FF0000', lineWidth: 2, radius: 4
    });

  } else {
    // 手が検出されない場合: ステッキを画面外に移動
    if (stickContainer) {
        stickContainer.style.transform = `translate(-1000px, -1000px)`;
    }
  }
  
  canvasCtx.restore();
}

// --- 5. 仮想クリックイベントの発火 ---
function simulateClick(x, y) {
    const element = document.elementFromPoint(x, y);
    
    if (element && element !== document.body) {
        console.log(`[ACTION] Simulated click at (${x.toFixed(0)}, ${y.toFixed(0)}) on:`, element);
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y
        });
        element.dispatchEvent(clickEvent);
    } else {
         console.log(`[ACTION] Simulated click at (${x.toFixed(0)}, ${y.toFixed(0)}): Target not found.`);
    }
}

// --- 6. 視覚的フィードバック ---
function showFeedback(text) {
    feedbackOverlay.textContent = text;
    feedbackOverlay.classList.remove('hidden');
    feedbackOverlay.classList.add('show-feedback');
    
    setTimeout(() => {
        feedbackOverlay.classList.remove('show-feedback');
        feedbackOverlay.classList.add('hidden');
    }, 300);
}


// --- 7. パーティクル生成ロジック ---
// ステッキ先端からの常時パーティクル生成
setInterval(() => {
    if (stickContainer && particlesContainer && stickContainer.style.transform !== 'translate(-1000px, -1000px)') {
        // tip要素の画面上の絶対位置を取得
        const tipRect = tip.getBoundingClientRect();
        const tipX = tipRect.left + tipRect.width / 2;
        const tipY = tipRect.top + tipRect.height / 2;
        
        spawnParticle(tipX, tipY, false); // 通常のストリーム
    }
}, 30); // 30msごとに生成

/**
 * パーティクルを生成する
 * @param {number} x 画面X座標
 * @param {number} y 画面Y座標
 * @param {boolean} isBurst クリック時のバーストかどうか
 */
function spawnParticle(x, y, isBurst = false) {
    if (!particlesContainer) return;
    
    const particle = document.createElement("div");
    particle.className = "particle";

    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 2 + 1;
    const distance = isBurst ? 80 : 30; // バースト時は遠くまで拡散

    particle.style.left = x + "px";
    particle.style.top  = y + "px";
    
    // CSSの@keyframes moveParticle に渡すカスタムプロパティ
    particle.style.setProperty("--dx", Math.cos(angle) * speed * distance + "px"); 
    particle.style.setProperty("--dy", Math.sin(angle) * speed * distance + "px");

    particlesContainer.appendChild(particle);
    setTimeout(() => particle.remove(), 1000);
}