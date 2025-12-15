#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# NonMouse - ホットキー制御なし版
# Author: Yuki Takeyama
# Date: 2023/04/09 (Modified: 2025/12/15)

import cv2
import time
import keyboard # ホットキー機能は削除しましたが、元のコードに入っていたため残します
import platform
import numpy as np
import mediapipe as mp
from pynput.mouse import Button, Controller


# nonmouse.utils.py からのインポートが必要なため、この行は残します
# from nonmouse.args import * # 削除済み
from nonmouse.utils import * # NOTE: nonmouse.utils.py と calculate_moving_average、calculate_distance、draw_circle 関数が必要です。

# app.py の os.environ 設定部分

import os
# ...

# 1. oneDNNの高速化に関する情報を非表示にする (既存)
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

# 2. その他の情報メッセージ (INFO/WARNING) を非表示にする (既存)
# '2' は INFOとWARNINGを非表示にし、ERRORのみを表示
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2' 

# 3. 【追加】TensorFlow Lite/MediaPipe内部のログを非表示にする (INFO/WARNINGを抑制)
# 3 (Fatal) に設定することで、ほとんどの警告と情報を非表示にします
os.environ['GLOG_minloglevel'] = '3'

# --- 初期設定 ---
mouse = Controller()
mp_drawing = mp.solutions.drawing_utils
mp_hands = mp.solutions.hands

pf = platform.system()
# ホットキーは使用しないため、hotkeyの定義は実質不要
# if pf == 'Windows':
#     hotkey = 'alt'
# elif pf == 'Darwin':
#     hotkey = 'command'
# elif pf == 'Linux':
#     hotkey = 'XXX' 


def main():
    # --- 【tk_arg() を置き換え、引数を直接設定】 ---
    cap_device = 0          
    mode = 2                
    kando = 3.0             
    screenRes = [1920, 1080] # 実行環境の解像度に合わせる
    # ---------------------------------------------
    
    dis = 0.7 
    preX, preY = 0, 0
    nowCli, preCli = 0, 0 
    norCli, prrCli = 0, 0
    douCli = 0 
    i, k, h = 0, 0, 0
    LiTx, LiTy, list0x, list0y, list1x, list1y, list4x, list4y, list6x, list6y, list8x, list8y, list12x, list12y = [], [], [], [], [], [], [], [], [], [], [], [], [], [] 
    moving_average = [[0] * 3 for _ in range(3)]
    nowUgo = 1
    cap_width = 1280
    cap_height = 720
    start, c_start = float('inf'), float('inf')
    c_text = 0 # ホットキーテキスト表示フラグ (常に0にする)
    
    # 【拍手検出用の変数追加】
    clap_count = 0 
    is_clapping_state = False 
    clap_threshold = 0.08  
    last_clap_time = float('inf') 
    clap_reset_timeout = 1.0 
    
    # Webカメラ入力, 設定
    window_name = 'NonMouse'
    cv2.namedWindow(window_name)
    cap = cv2.VideoCapture(cap_device)
    cap.set(cv2.CAP_PROP_FPS, 60)
    cfps = int(cap.get(cv2.CAP_PROP_FPS))
    if cfps < 30:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, cap_width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cap_height)
        cfps = int(cap.get(cv2.CAP_PROP_FPS))
    
    ran = max(int(cfps/10), 1)
    hands = mp_hands.Hands(
        min_detection_confidence=0.8, 
        min_tracking_confidence=0.8, 
        max_num_hands=2
    )
    
    # メインループ ###############################################################################
    while cap.isOpened():
        p_s = time.perf_counter()
        success, image = cap.read()
        if not success:
            continue
            
        if mode == 1: 
            image = cv2.flip(image, 0)
        elif mode == 2: 
            image = cv2.flip(image, 1)

        image = cv2.cvtColor(cv2.flip(image, 1), cv2.COLOR_BGR2RGB)
        image.flags.writeable = False 
        results = hands.process(image) 
        image.flags.writeable = True 
        image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
        image_height, image_width, _ = image.shape

        if results.multi_hand_landmarks:
            # 手の骨格描画
            for hand_landmarks in results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(
                    image, hand_landmarks, mp_hands.HAND_CONNECTIONS)
            
            # --- 【ホットキー制御ロジックの削除・置き換え】 ---
            # 手が検出されたら、常にカーソル制御を有効にする
            can = 1
            c_text = 0 # ホットキー押下待ちテキストは表示しない
            # ---------------------------------------------------
                    
            # カーソル制御が有効なとき ##################################################
            if can == 1:
                
                # 【拍手検出ロジック】
                if len(results.multi_hand_landmarks) == 2:
                    
                    hand1_lm = results.multi_hand_landmarks[0].landmark[0]
                    hand2_lm = results.multi_hand_landmarks[1].landmark[0]
                    
                    dist_x = hand1_lm.x - hand2_lm.x
                    dist_y = hand1_lm.y - hand2_lm.y
                    hands_distance = np.sqrt(dist_x**2 + dist_y**2)
                    
                    # 1. 拍手状態の判定（両手が近づいた瞬間）
                    if hands_distance < clap_threshold and not is_clapping_state:
                        is_clapping_state = True
                        draw_circle(image, (hand1_lm.x + hand2_lm.x) * image_width / 2, 
                                    (hand1_lm.y + hand2_lm.y) * image_height / 2, 
                                    30, (255, 0, 255)) 
                        
                    # 2. 拍手の完了判定（近づいた後、離れた瞬間）
                    elif hands_distance >= clap_threshold and is_clapping_state:
                        is_clapping_state = False
                        current_time = time.perf_counter()
                        
                        if current_time - last_clap_time > clap_reset_timeout:
                            clap_count = 0
                            
                        clap_count += 1
                        last_clap_time = current_time
                        
                        if clap_count == 2:
                            # 2回拍手 -> シングルクリック
                            mouse.click(Button.left, 1)
                            clap_count = 0 
                            cv2.putText(image, "CLICK (2 Claps)", (20, 500), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 255), 3)
                            
                        elif clap_count == 4:
                            # 4回拍手 -> ダブルクリック
                            mouse.click(Button.left, 2)
                            clap_count = 0 
                            cv2.putText(image, "DOUBLE CLICK (4 Claps)", (20, 500), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 255), 3)
                
                # preX, preYに現在のマウス位置を代入 (初回のみ)
                if i == 0:
                    preX = results.multi_hand_landmarks[0].landmark[8].x
                    preY = results.multi_hand_landmarks[0].landmark[8].y
                    i += 1

                # ランドマーク座標の移動平均計算 (nonmouse.utils内の関数が必要)
                landmark0 = [calculate_moving_average(results.multi_hand_landmarks[0].landmark[0].x, ran, list0x), calculate_moving_average(
                    results.multi_hand_landmarks[0].landmark[0].y, ran, list0y)]
                landmark1 = [calculate_moving_average(results.multi_hand_landmarks[0].landmark[1].x, ran, list1x), calculate_moving_average(
                    results.multi_hand_landmarks[0].landmark[1].y, ran, list1y)]
                landmark4 = [calculate_moving_average(results.multi_hand_landmarks[0].landmark[4].x, ran, list4x), calculate_moving_average(
                    results.multi_hand_landmarks[0].landmark[4].y, ran, list4y)]
                landmark6 = [calculate_moving_average(results.multi_hand_landmarks[0].landmark[6].x, ran, list6x), calculate_moving_average(
                    results.multi_hand_landmarks[0].landmark[6].y, ran, list6y)]
                landmark8 = [calculate_moving_average(results.multi_hand_landmarks[0].landmark[8].x, ran, list8x), calculate_moving_average(
                    results.multi_hand_landmarks[0].landmark[8].y, ran, list8y)]
                landmark12 = [calculate_moving_average(results.multi_hand_landmarks[0].landmark[12].x, ran, list12x), calculate_moving_average(
                    results.multi_hand_landmarks[0].landmark[12].y, ran, list12y)]

                absKij = calculate_distance(landmark0, landmark1)
                absUgo = calculate_distance(landmark8, landmark12) / absKij 
                absCli = calculate_distance(landmark4, landmark6) / absKij 

                posx, posy = mouse.position

                # カーソル移動量計算
                nowX = calculate_moving_average(
                    results.multi_hand_landmarks[0].landmark[8].x, ran, LiTx)
                nowY = calculate_moving_average(
                    results.multi_hand_landmarks[0].landmark[8].y, ran, LiTy)

                dx = kando * (nowX - preX) * image_width
                dy = kando * (nowY - preY) * image_height

                if pf == 'Windows' or pf == 'Linux': 
                    dx = dx+0.5
                    dy = dy+0.5
                preX = nowX
                preY = nowY

                # カーソルがディスプレイから出ないように補正
                if posx+dx < 0:
                    dx = -posx
                elif posx+dx > screenRes[0]:
                    dx = screenRes[0]-posx
                if posy+dy < 0:
                    dy = -posy
                elif posy+dy > screenRes[1]:
                    dy = screenRes[1]-posy

                # 動かす ###########################################################################
                # cursor: 人差し指と中指が離れているとき
                if absUgo >= dis and nowUgo == 1:
                    mouse.move(dx, dy)
                    draw_circle(image, results.multi_hand_landmarks[0].landmark[8].x * image_width,
                                 results.multi_hand_landmarks[0].landmark[8].y * image_height, 8, (250, 0, 0))
                
                # scroll: 人差し指が曲がっているとき
                if results.multi_hand_landmarks[0].landmark[8].y-results.multi_hand_landmarks[0].landmark[5].y > -0.06:
                    mouse.scroll(0, -dy/50) 
                    draw_circle(image, results.multi_hand_landmarks[0].landmark[8].x * image_width,
                                 results.multi_hand_landmarks[0].landmark[8].y * image_height, 20, (0, 0, 0))
                    nowUgo = 0
                else:
                    nowUgo = 1

                preCli = nowCli
                prrCli = norCli

        # 表示 #################################################################################
        # c_textは常に0なので、Push Hotkeyのメッセージは表示されません
        # if c_text == 1:
        #     cv2.putText(image, f"Push {hotkey}", (20, 450), ... )
            
        cv2.putText(image, "cameraFPS:"+str(cfps), (20, 40),
                     cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 3)
        p_e = time.perf_counter()
        fps = str(int(1/(float(p_e)-float(p_s))))
        cv2.putText(image, "FPS:"+fps, (20, 80),
                     cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 3)
        dst = cv2.resize(image, dsize=None, fx=0.4,
                         fy=0.4) 
        cv2.imshow(window_name, dst)
        if (cv2.waitKey(1) & 0xFF == 27) or (cv2.getWindowProperty(window_name, cv2.WND_PROP_VISIBLE) == 0):
            break
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()