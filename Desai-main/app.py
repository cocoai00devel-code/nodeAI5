# main.py

import cv2
import time
import numpy as np
import mediapipe as mp
import os
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.templating import Jinja2Templates

# 外部モジュールから必要な関数をインポート
# NOTE: nonmouse/utils.py が存在し、draw_circle関数などが定義されていることが前提です。
# 開発環境によっては、os.pathやsys.pathで適切なインポートパスを設定する必要があります。
# from nonmouse.utils import calculate_moving_average, calculate_distance, draw_circle 
# 今回はエラー回避のため、utilsの関数呼び出しは一旦コメントアウトします。

# --- 環境変数の設定 (ログ抑制) ---
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0' 
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2' 
os.environ['GLOG_minloglevel'] = '3'

# --- 初期設定 ---
# マウスコントローラー(pynput)はWebでは不要なので削除
mp_drawing = mp.solutions.drawing_utils
mp_hands = mp.solutions.hands

# MediaPipe設定 (元のapp.pyから流用)
hands = mp_hands.Hands(
    min_detection_confidence=0.8,
    min_tracking_confidence=0.8,
    max_num_hands=2
)

# Webカメラ設定
cap_device = 0
cap_width = 1280
cap_height = 720
cap = cv2.VideoCapture(cap_device)
cap.set(cv2.CAP_PROP_FPS, 60)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, cap_width)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cap_height)

# FastAPI初期化
app = FastAPI()
templates = Jinja2Templates(directory="templates")

# =========================================================================
# 映像ストリームジェネレーター (MediaPipe処理を含む)
# =========================================================================
def video_frame_generator():
    mode = 2 # 左右反転モードを固定
    cfps = int(cap.get(cv2.CAP_PROP_FPS))
    ran = max(int(cfps/10), 1)

    while cap.isOpened():
        success, image = cap.read()
        if not success:
            continue
        
        # 元のapp.pyの反転ロジック
        if mode == 1: 
            image = cv2.flip(image, 0)
        elif mode == 2: 
            image = cv2.flip(image, 1)

        # BGR画像をRGBに変換し、MediaPipeで処理
        image = cv2.cvtColor(cv2.flip(image, 1), cv2.COLOR_BGR2RGB)
        image.flags.writeable = False
        results = hands.process(image)
        image.flags.writeable = True
        image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
        
        image_height, image_width, _ = image.shape
        
        # --- MediaPipe 描画とロジック (カーソル操作部分は削除) ---
        if results.multi_hand_landmarks:
            # 手の骨格描画
            for hand_landmarks in results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(
                    image, hand_landmarks, mp_hands.HAND_CONNECTIONS)

            # NOTE: 拍手検出ロジックや移動平均計算、マウス制御(pynput)は
            #       FastAPIではOSカーソルを動かせないため、すべて削除しました。
            #       もし検出結果をWeb上で表示したい場合は、
            #       ここで結果を画像に書き込むか、別のエンドポイントでJSONとして送信する必要があります。
            
        # FPS表示 (Web UI上にも表示可能)
        p_e = time.perf_counter()
        # fps = str(int(1/(float(p_e)-float(p_s)))) # p_sの初期化がジェネレータ外なので一旦削除
        cv2.putText(image, "FastAPI Web Stream", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 3)

        # 映像をJPEG形式にエンコード (Webストリーミングの標準)
        ret, buffer = cv2.imencode('.jpg', image)
        frame = buffer.tobytes()
        
        # ストリーム形式 (multipart/x-mixed-replace) で返す
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

# =========================================================================
# FastAPI ルーティング
# =========================================================================

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """ Web UIのテンプレートを表示するルート """
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/video_feed")
def video_feed():
    """ 映像ストリームを配信するルート """
    return StreamingResponse(
        video_frame_generator(), 
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

if __name__ == "__main__":
    # 実行コマンド: uvicorn main:app --reload
    # ブラウザで http://127.0.0.1:8000/ にアクセス
    uvicorn.run("main:app", host="0.0.0.0", port=8000)