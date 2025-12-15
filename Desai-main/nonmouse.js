// nonmouse.js

// === 設定値の移植 (Pythonの変数名を踏襲) ===
const KANDO = 3.0; // 感度 (kando)
const DIS = 0.7; // くっつける距離の定義 (dis)
const MOUSE_MOVE_THRESHOLD = 7; // カーソル移動判定の閾値 (np.abs(dx) < 7)
const RIGHT_CLICK_TIME = 1.5; // 右クリック判定に必要な静止時間
const DOUBLE_CLICK_TIME_MS = 500; // ダブルクリック判定に必要な時間 (500ms)
const HOTKEY_MODE = false; // Webではグローバルホットキー機能は再現できないため、常時トラッキングONとする

// === グローバル変数の定義 ===
let preX = 0, preY = 0;
let nowCli = 0, preCli = 0; // 現在、前回の左クリック状態
let norCli = 0, prrCli = 0; // 現在、前回の右クリック状態
let douCli = 0;             // ダブルクリック状態 (0: 待機, 1: 1回目クリック後)
let k = 0;                  // 右クリック判定用 (静止カウンター)
let h = 0;                  // 右クリック直後フラグ (左クリック抑止用)
let startRightClickTime = Infinity; // 右クリック判定用の静止開始時間
let startDoubleClickTime = Infinity; // ダブルクリック判定用の時間

// 移動平均用リストの定義
const RAN = 10; 
let LiTx = [], LiTy = [];
let list0x = [], list0y = []; 
let list1x = [], list1y = [];
let list4x = [], list4y = [];
let list6x = [], list6y = [];
let list8x = [], list8y = [];
let list12x = [], list12y = [];

// === ユーティリティ関数の移植 ===

/** ユークリッド距離を計算 */
function calculate_distance(p1, p2) {
    const dx = p1[0] - p2[0]; // 配列を想定
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
}

/** ランドマークオブジェクトからユークリッド距離を計算 */
function calculate_landmark_distance(lm1, lm2) {
    const dx = lm1.x - lm2.x;
    const dy = lm1.y - lm2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/** 移動平均を計算（リストを更新し、平均値を返す） */
function calculate_moving_average(newValue, ran, list) {
    list.push(newValue);
    if (list.length > ran) {
        list.shift();
    }
    const sum = list.reduce((a, b) => a + b, 0);
    return sum / list.length;
}

// === MediaPipe Hands の設定とメイン処理 ===

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.8,
    minTrackingConfidence: 0.8,
});

hands.onResults(onResults);

// 簡易描画関数（正規化座標をキャンバス座標に変換）
function drawCircle(ctx, x_norm, y_norm, radius, color) {
    ctx.save();
    // 左右反転を考慮して描画
    const x = x_norm * ctx.canvas.width;
    const y = y_norm * ctx.canvas.height;
    
    // Canvasを一旦元の状態に戻して描画
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.restore();
}

/** MediaPipeから結果を受け取った際のコールバック関数 */
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Pythonコードの cv2.flip(image, 1) に対応: 左右反転で描画
    canvasCtx.scale(-1, 1);
    canvasCtx.translate(-canvasElement.width, 0);
    
    // カメラ映像を描画
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // 描画を左右反転後に戻す（テキストや円の描画用）
    canvasCtx.restore();
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handLandmarks = results.multiHandLandmarks[0];
        const imageWidth = canvasElement.width;
        const imageHeight = canvasElement.height;

        // 手の骨格描画
        drawConnectors(canvasCtx, handLandmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
        drawLandmarks(canvasCtx, handLandmarks, { color: '#FF0000', lineWidth: 2 });
        
        // --- ランドマーク座標の取得と移動平均 ---
        const lm = handLandmarks;
        
        // Pythonのコードではランドマークの座標が配列で扱われているため、それに合わせる
        const landmark0_x = calculate_moving_average(lm[0].x, RAN, list0x);
        const landmark0_y = calculate_moving_average(lm[0].y, RAN, list0y);
        const landmark1_x = calculate_moving_average(lm[1].x, RAN, list1x);
        const landmark1_y = calculate_moving_average(lm[1].y, RAN, list1y);
        const landmark4_x = calculate_moving_average(lm[4].x, RAN, list4x);
        const landmark4_y = calculate_moving_average(lm[4].y, RAN, list4y);
        const landmark6_x = calculate_moving_average(lm[6].x, RAN, list6x);
        const landmark6_y = calculate_moving_average(lm[6].y, RAN, list6y);
        const landmark8_x = calculate_moving_average(lm[8].x, RAN, list8x);
        const landmark8_y = calculate_moving_average(lm[8].y, RAN, list8y);
        const landmark12_x = calculate_moving_average(lm[12].x, RAN, list12x);
        const landmark12_y = calculate_moving_average(lm[12].y, RAN, list12y);
        
        const landmark0 = [landmark0_x, landmark0_y];
        const landmark1 = [landmark1_x, landmark1_y];
        const landmark4 = [landmark4_x, landmark4_y];
        const landmark6 = [landmark6_x, landmark6_y];
        const landmark8 = [landmark8_x, landmark8_y];
        const landmark12 = [landmark12_x, landmark12_y];

        // --- 相対距離の計算 ---
        const absKij = calculate_distance(landmark0, landmark1); // 基準距離 (手首-親指付け根)
        const absUgo = calculate_distance(landmark8, landmark12) / absKij; // カーソル移動用 (人差し指-中指の先端)
        const absCli = calculate_distance(landmark4, landmark6) / absKij; // 左クリック用 (親指先端-人差し指第2関節)

        // --- マウス移動量の計算 ---
        const nowX = calculate_moving_average(lm[8].x, RAN, LiTx);
        const nowY = calculate_moving_average(lm[8].y, RAN, LiTy);
        
        // OSカーソルの絶対座標は取れないため、仮想的な移動量として計算
        let dx = KANDO * (nowX - preX) * imageWidth;
        let dy = KANDO * (nowY - preY) * imageHeight;
        
        // Pythonの初回実行時ロジック i==0 に相当
        if (LiTx.length <= 1) { 
            preX = nowX;
            preY = nowY;
        }

        // 移動量の更新
        preX = nowX;
        preY = nowY;
        
        // --- フラグ/アクション判定 ---

        // 1. 左クリック状態 (nowCli)
        preCli = nowCli;
        nowCli = absCli < DIS ? 1 : 0;
        
        // カーソル移動しているかどうかの判定 (Python: np.abs(dx) > 7 and np.abs(dy) > 7)
        const isCursorMoving = Math.abs(dx) > MOUSE_MOVE_THRESHOLD || Math.abs(dy) > MOUSE_MOVE_THRESHOLD;
        if (isCursorMoving) {
            k = 0; // 動いているときは右クリック判定リセット
        }

        // 2. 右クリック状態 (norCli)
        prrCli = norCli;
        norCli = 0; // デフォルトは非クリック

        if (nowCli === 1 && !isCursorMoving) {
            // 「動いていない」かつ「クリックされた」とき
            if (k === 0) {
                startRightClickTime = performance.now();
                k = 1;
            }
            const timeElapsed = (performance.now() - startRightClickTime) / 1000;
            if (timeElapsed > RIGHT_CLICK_TIME) {
                norCli = 1; // 1.5秒以上静止クリックで右クリック
                drawCircle(canvasCtx, lm[8].x, lm[8].y, 20, 'blue'); // 右クリック表示: 青
            }
        } else {
            // クリック/静止状態が解除された場合
            if (k === 1) k = 0;
        }
        
        // --- 仮想アクションの実行 ---

        // A. カーソル移動
        const nowUgo = absUgo >= DIS ? 1 : 0;
        if (nowUgo === 1) {
            drawCircle(canvasCtx, lm[8].x, lm[8].y, 8, 'red'); // カーソル表示: 赤
            // 仮想的にマウスを動かすロジックをここに記述可能（例：画面上の仮想カーソルを動かす）
            // console.log(`仮想カーソル移動: dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}`);
        }
        
        // B. 左クリック / ダブルクリック
        if (nowCli === 1 && nowCli !== preCli) { // 押した瞬間
            if (h === 1) { 
                h = 0; // 右クリック直後状態：左クリックを抑止
            } else if (h === 0) { 
                console.log("仮想 Left Click PRESS");
            }
            drawCircle(canvasCtx, lm[8].x, lm[8].y, 20, 'yellow'); // 左クリック表示: 黄
        }

        if (nowCli === 0 && nowCli !== preCli) { // 離した瞬間
            console.log("仮想 Left Click RELEASE");
            
            // ダブルクリック判定
            const c_end = performance.now();
            if (douCli === 0) { 
                startDoubleClickTime = c_end; // 1回目クリックの時間を記録
                douCli = 1;
            } else if (douCli === 1) {
                const dt = c_end - startDoubleClickTime;
                if (dt < DOUBLE_CLICK_TIME_MS) { // 0.5秒以内にもう一度クリック
                    console.log("仮想 Double Click!");
                    douCli = 0; // リセット
                } else {
                    // 0.5秒以上経っていたら、2回目のクリックを1回目として扱うために douCliを1のままにする
                    startDoubleClickTime = c_end; 
                }
            }
        }
        
        // C. 右クリック
        if (norCli === 1 && norCli !== prrCli) {
            console.log("仮想 Right Click");
            h = 1; // 右クリック直後フラグを立てる
        }
        
        // D. スクロール
        // Python: hand_landmarks.landmark[8].y - hand_landmarks.landmark[5].y > -0.06
        if (lm[8].y - lm[5].y > -0.06) {
             // 仮想的なスクロールをコンソールに出力
             // mouse.scroll(0, -dy/50) に相当
             console.log(`仮想 Scroll: ${(-dy / 50).toFixed(2)}`);
             drawCircle(canvasCtx, lm[8].x, lm[8].y, 20, 'black'); // スクロール表示: 黒
        }

        // 次のフレームのために状態を保存
        preCli = nowCli;
        prrCli = norCli;

    } else {
        // 手が検出されない場合の初期化 (Pythonのi=0リセットに相当)
        preX = 0; preY = 0;
        LiTx.length = 0; LiTy.length = 0;
        list0x.length = 0; list0y.length = 0;
        // ... 他のリストもリセット
    }
    
    // FPS表示 (簡略版)
    canvasCtx.fillStyle = '#00FF00';
    canvasCtx.font = '24px Arial';
    // Hotkey表示はWebでは無効なので、代わりにモード表示など
    canvasCtx.fillText("Mode: Tracking Active", 20, 40);
    
    // 次のフレームを描画
    window.requestAnimationFrame(() => {}); 
}

// === カメラ起動 ===

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 1280,
    height: 720,
});

camera.start();

// Canvasのサイズを調整
videoElement.addEventListener('loadedmetadata', () => {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    videoElement.style.display = 'none'; // カメラ映像を非表示
    canvasElement.style.display = 'block'; // キャンバスを表示
});