# GCS Windows 涓夋枃浠惰皟鐢ㄨ鏄?

## 蹇€熷姣?

| 鏂囦欢 | 浣曟椂杩愯 | 鍔熻兘 | 鐢ㄦ埛鍙 |
|------|---------|------|---------|
| **GCS-鏅鸿兘瀹夎.bat** | 棣栨瀹夎 | 妫€鏌ython 鈫?涓嬭浇Python 鈫?鍒涘缓.venv 鈫?瀹夎渚濊禆 鈫?鍒涘缓蹇嵎鏂瑰紡 | 鉁?鏄?|
| **windows/GCS.cmd** | 姣忔鍚姩 | 妫€鏌ヤ緷璧?鈫?闃叉閲嶅 鈫?鍚姩3涓湇鍔?鈫?鎵撳紑娴忚鍣?| 鉁?鏄?|
| **windows/GCS-Prewarm.cmd** | 寮€鏈鸿嚜鍔?| 鍚姩Watchdog 鈫?棰勫姞杞絉untime 鈫?鍚庡彴寰呭懡 | 鉂?鍚?|

---

## 銆?銆慓CS-鏅鸿兘瀹夎.bat锛堝畨瑁呭叆鍙ｏ級

### 鐩殑
涓€閿畬鎴?Windows 鐜閰嶇疆锛堜粎闇€杩愯涓€娆★級

### 鎵ц娴佺▼

```
鐢ㄦ埛鍙屽嚮 GCS-鏅鸿兘瀹夎.bat
    鈫?
[绗?姝 妫€鏌?Python 鐜
    鈹溾攢 鏌ユ壘绯荤粺涓殑 Python
    鈹? (渚濇灏濊瘯: py launcher 鈫?python 鈫?python3)
    鈹溾攢 妫€鏌ョ増鏈?鈮?3.8?
    鈹溾攢 妫€鏌ユ槸鍚?Microsoft Store Python?
    鈹斺攢 濡備笉婊¤冻浠讳綍鏉′欢 鈫?鑷姩涓嬭浇 Python 3.11 骞舵棤鎻愮ず瀹夎
    
    鈹斺攢 鎶€鏈粏鑺傦細
       cmd: py -c "python --version"
       powershell: [System.Version]$version

[绗?姝 璋冪敤 PowerShell setup-python-deps.ps1
    鈹溾攢 鍒涘缓铏氭嫙鐜
    鈹? cmd: python -m venv .venv
    鈹溾攢 鍗囩骇 pip/setuptools/wheel
    鈹? cmd: .venv\Scripts\pip install --upgrade pip setuptools wheel
    鈹溾攢 瀹夎渚濊禆
    鈹? cmd: .venv\Scripts\pip install -r requirements.txt
    鈹? (瀹夎鍖? pyserial, pymavlink, dronecan, monotonic)
    鈹斺攢 楠岃瘉
       cmd: .venv\Scripts\python -c "import dronecan, serial, pymavlink"

[绗?姝 璋冪敤 PowerShell install-gcs-desktop.ps1 -WatchdogStartup
    鈹溾攢 鍒涘缓妗岄潰蹇嵎鏂瑰紡
    鈹? GCS.lnk 鈫?%REPO_ROOT%\windows/GCS.cmd
    鈹溾攢 鍒涘缓寮€濮嬭彍鍗曞揩鎹锋柟寮?
    鈹? %ProgramFiles%\GCS\GCS.lnk 鈫?windows/GCS.cmd
    鈹斺攢 鍒涘缓寮€鏈哄惎鍔ㄥ揩鎹锋柟寮忥紙-WatchdogStartup 鍙傛暟锛?
       %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
       GCS Watchdog.lnk 鈫?%REPO_ROOT%\windows/GCS-Prewarm.cmd

[鏈€缁堢姸鎬乚
鉁?.venv 铏氭嫙鐜宸插垱寤?
鉁?鎵€鏈変緷璧栧凡瀹夎
鉁?妗岄潰蹇嵎鏂瑰紡宸插垱寤猴紙鍙敤浜庡惎鍔級
鉁?寮€鏈哄惎鍔ㄥ揩鎹锋柟寮忓凡鍒涘缓锛堝彲閫夊姞閫燂級
```

### 璋冪敤鍏崇郴
```
GCS-鏅鸿兘瀹夎.bat
鈹溾攢 PowerShell setup-python-deps.ps1
鈹? 鈹溾攢 python -m venv .venv
鈹? 鈹溾攢 pip install --upgrade pip setuptools wheel
鈹? 鈹溾攢 pip install -r requirements.txt
鈹? 鈹斺攢 python -c "import dronecan, serial, pymavlink"
鈹斺攢 PowerShell install-gcs-desktop.ps1 -WatchdogStartup
   鈹溾攢 鍒涘缓 GCS.lnk
   鈹溾攢 鍒涘缓寮€濮嬭彍鍗曞揩鎹锋柟寮?
   鈹斺攢 鍒涘缓 GCS Watchdog.lnk锛堝紑鏈哄惎鍔級
```

### 鐢ㄦ埛浣撻獙
- **鎵ц鏃堕棿**: 1-3 鍒嗛挓锛堥娆′笅杞?Python 鍙兘杈冮暱锛?
- **鏄剧ず鍐呭**: 杩涘害鎻愮ず銆佸畬鎴愭彁绀?
- **閿欒澶勭悊**: 娓呮櫚鐨勯敊璇俊鎭拰涓嬩竴姝ュ缓璁?
- **浣曟椂鍐嶆杩愯**: 鍩烘湰涓嶉渶瑕侊紙闄ら潪鍒犻櫎浜?.venv锛?

---

## 銆?銆慓CS.cmd锛堟棩甯稿惎鍔ㄥ叆鍙ｏ級

### 鐩殑
姣忔鍚姩搴旂敤鏃惰繍琛岋紙鐢ㄦ埛浣跨敤鏈€棰戠箒锛?

### 鎵ц娴佺▼

```
鐢ㄦ埛鍙屽嚮妗岄潰 GCS 鍥炬爣 鎴?windows/GCS.cmd
    鈫?
[绗?姝 瀹氫綅 Python
    鈹溾攢 鏌ユ壘椤哄簭锛?
    鈹? 1. .venv\Scripts\pythonw.exe锛堜紭鍏堬紝鏃犵獥鍙ｏ級
    鈹? 2. .venv\Scripts\python.exe
    鈹? 3. 绯荤粺 pythonw / python
    鈹?
    鈹斺攢 璁剧疆鍙橀噺:
       set "PY=.venv\Scripts\pythonw.exe" (or fallback)

[绗?姝 楠岃瘉渚濊禆瀹屾暣鎬?
    鈹溾攢 璋冪敤 Python 妫€鏌ワ細
    鈹? python -c "import dronecan, serial, pymavlink"
    鈹溾攢 濡傛垚鍔?鉁?鈫?缁х画
    鈹斺攢 濡傚け璐?鉁?鈫?鏄剧ず閿欒锛岃姹傞噸鏂板畨瑁?
       "缂哄皯 DroneCAN / 涓插彛妗ユ牳蹇?Python 渚濊禆..."

[绗?姝 妫€鏌ユ槸鍚﹀凡杩愯锛堥槻姝㈤噸澶嶅惎鍔級
    鈹溾攢 妫€鏌?8766 绔彛锛圧untime锛?
    鈹? curl -s http://127.0.0.1:8766/__gcs/ping
    鈹溾攢 濡傚凡杩愯 鈫?
    鈹? 鈹溾攢 鐩存帴鎵撳紑娴忚鍣?http://127.0.0.1:8766/index.html
    鈹? 鈹斺攢 閫€鍑?windows/GCS.cmd
    鈹?
    鈹斺攢 濡傛湭杩愯 鈫?缁х画鍚姩

[绗?姝 鏄剧ず鍚姩椤?
    鈹溾攢 鎵撳紑 http://127.0.0.1:8767/launch锛堝惎鍔ㄥ紩瀵奸〉锛?
    鈹斺攢 鍒涘缓閿佹枃浠?%TEMP%\gcs-launch.lock锛堥槻姝㈤噸澶嶏級

[绗?姝 鍚庡彴鍚姩 Python 鏈嶅姟锛堟棤绐楀彛锛?
    鈹溾攢 PowerShell 鍛戒护锛?
    鈹? powershell -NoProfile -WindowStyle Hidden -Command ^
    鈹?   "Start-Process -FilePath '%PY%' ^
    鈹?    -ArgumentList 'tools\gcs-launch.py','--boot-page' ^
    鈹?    -WorkingDirectory '%CD%' -WindowStyle Hidden"
    鈹?
    鈹斺攢 杩欏惎鍔ㄤ簡 gcs-launch.py锛屽叾鍐呴儴浼氬惎鍔細
       鈹溾攢 gcs_supervisor.py (绔彛 8765) - COM 妗ユ帴锛堜覆鍙ｉ€氫俊锛?
       鈹溾攢 gcs-runtime.py (绔彛 8766) - 鏍稿績杩愯鏃?
       鈹斺攢 gcs_watchdog.py (绔彛 8767) - 鍚姩瀹堟姢 + watchdog

[绗?姝 绛夊緟鏈嶅姟灏辩华
    鈹溾攢 gcs-launch.py 鍐呴儴寰幆妫€鏌ワ細
    鈹? while !service_ready:
    鈹?   ping http://127.0.0.1:8766/__gcs/ping
    鈹?   sleep(100ms)
    鈹?
    鈹斺攢 鏈嶅姟灏辩华鍚?鈫?鑷姩鎵撳紑娴忚鍣?

[鏈€缁堢姸鎬乚
鉁?涓変釜 Python 鏈嶅姟杩愯涓紙8765, 8766, 8767锛?
鉁?娴忚鍣ㄦ樉绀?http://127.0.0.1:8766/index.html
鉁?鐢ㄦ埛鐪嬪埌 Web UI锛屽彲浠ュ紑濮嬩娇鐢?
```

### 璋冪敤鍏崇郴
```
windows/GCS.cmd
鈹溾攢 [妫€鏌 curl http://127.0.0.1:8766/__gcs/ping
鈹溾攢 [楠岃瘉] python -c "import dronecan, serial, pymavlink"
鈹斺攢 [鍚姩] PowerShell Start-Process
   鈹斺攢 python tools\gcs-launch.py --boot-page
      鈹斺攢 gcs-launch.py 鍚姩锛?
         鈹溾攢 gcs_supervisor.py (8765)
         鈹? 鈹斺攢 tools/com-bridge/server.py
         鈹?    鈹斺攢 绠＄悊 COM 妗ユ帴
         鈹溾攢 gcs-runtime.py (8766)
         鈹? 鈹斺攢 鏍稿績杩愯鏃?
         鈹斺攢 gcs_watchdog.py (8767)
            鈹斺攢 鍚姩瀹堟姢 + 鐩戝惉
```

### 鐢ㄦ埛浣撻獙
- **鎵ц鏃堕棿**: 10-30 绉掞紙鍔犺浇 Python锛?
- **鏄剧ず鍐呭**: 鍚姩椤甸潰 鈫?娴忚鍣?
- **閿欒澶勭悊**: 渚濊禆妫€鏌ュけ璐ユ椂娓呮櫚鎻愮ず
- **闃叉姢鏈哄埗**: 鑷姩妫€娴嬪凡杩愯锛岄槻姝㈤噸澶嶅惎鍔?

---

## 銆?銆慓CS-Prewarm.cmd锛堝紑鏈洪鐑?- 鍙€夛級

### 鐩殑
寮€鏈烘椂鍚庡彴棰勫姞杞?Python 杩愯鏃讹紝鍔犲揩棣栨鍚姩閫熷害锛堝彲閫夛級

### 鎵ц娴佺▼

```
Windows 鍚姩鏃?
    鈫?
鑷姩杩愯蹇嵎鏂瑰紡锛?
  %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\GCS Watchdog.lnk
    鈫?
鎵ц windows/GCS-Prewarm.cmd
    鈫?
[绗?姝 楠岃瘉渚濊禆锛堝揩閫熸鏌ワ級
    鈹溾攢 鏌ユ壘 Python
    鈹? set "PY=.venv\Scripts\pythonw.exe" (or fallback)
    鈹溾攢 妫€鏌?import dronecan, serial, pymavlink
    鈹斺攢 濡傚け璐?鈫?鏄剧ず鎻愮ず鍚庨€€鍑猴紙鏃犲奖鍝嶏紝涓嶅奖鍝嶅紑鏈猴級

[绗?姝 鍚庡彴鍚姩 Watchdog 鏈嶅姟
    鈹溾攢 PowerShell 鍛戒护锛?
    鈹? powershell -NoProfile -WindowStyle Hidden -Command ^
    鈹?   "Start-Process -FilePath '%PY%' ^
    鈹?    -ArgumentList 'tools\gcs_watchdog.py','--prewarm-runtime' ^
    鈹?    -WorkingDirectory '%CD%' -WindowStyle Hidden"
    鈹?
    鈹斺攢 鍙傛暟 --prewarm-runtime 鍛婅瘔 watchdog锛?
       "鍦ㄥ悗鍙板惎鍔?Runtime锛岀劧鍚庣瓑寰?

[绗?姝 gcs_watchdog.py 鍐呴儴閫昏緫
    鈹溾攢 妫€鏌?Runtime (8766 绔彛) 鏄惁宸茶繍琛?
    鈹溾攢 濡傛湭杩愯 鈫?鍚姩 gcs-runtime.py
    鈹? 杩欎細棰勫姞杞?Python modules 鍒板唴瀛?
    鈹溾攢 棰勫姞杞藉畬鎴?鈫?杩涘叆绛夊緟鐘舵€?
    鈹? gcs_watchdog 缁х画鍚庡彴杩愯锛岄殢鏃跺噯澶囧惎鍔ㄥ叾浠栨湇鍔?
    鈹?
    鈹斺攢 涓嶆樉绀轰换浣曠晫闈紙鏃犵獥鍙ｏ級

[鏈€缁堢姸鎬乚
鉁?Python Runtime 鍔犺浇鍒板唴瀛?
鉁?Watchdog 鍚庡彴鐩戝惉锛堝崰鐢ㄦ渶灏戣祫婧愶級
鉁?褰撶敤鎴峰弻鍑诲惎鍔ㄦ椂锛孯untime 宸插氨缁?

[鏃堕棿鑺傜渷]
娌℃湁 Prewarm:
  windows/GCS.cmd 鈫?鍔犺浇 Python (5-10s) 鈫?鍔犺浇 Runtime (5-15s) 鈫?鐢ㄦ埛鐪嬪埌 UI (10-30s 鎬昏)

鍚敤 Prewarm:
  寮€鏈烘椂: GCS-Prewarm 棰勫姞杞?Runtime (鏃犳劅鐭ワ紝鍚庡彴)
  windows/GCS.cmd 鈫?Runtime 宸插氨缁?(< 2s 鎬昏)

鑺傜渷鏃堕棿: 绾?80-90%
```

### 璋冪敤鍏崇郴
```
windows/GCS-Prewarm.cmd (寮€鏈鸿嚜鍔?
鈹溾攢 [妫€鏌 python -c "import dronecan, serial, pymavlink"
鈹斺攢 [鍚姩] PowerShell Start-Process
   鈹斺攢 python tools\gcs_watchdog.py --prewarm-runtime
      鈹斺攢 gcs_watchdog.py 鍐呴儴锛?
         鈹溾攢 妫€鏌?Runtime (8766) 鏄惁杩愯
         鈹溾攢 濡傛湭杩愯 鈫?鍚姩 gcs-runtime.py
         鈹? 鈹斺攢 tools/gcs-runtime.py (棰勫姞杞?modules)
         鈹斺攢 杩涘叆鍚庡彴鐩戝惉鐘舵€?
```

### 鐢ㄦ埛浣撻獙
- **鎵ц鏃堕棿**: 鍚庡彴鏃犳劅鐭ワ紙寮€鏈烘椂鑷姩锛?
- **鏄剧ず鍐呭**: 鏃狅紙鍚庡彴杩愯锛?
- **瀵圭郴缁熷奖鍝?*: 鏈€灏忥紙浠呴鍔犺浇锛屽崰鐢ㄥ皯閲忓唴瀛橈級
- **鏁堟灉**: 鍚庣画鍚姩鏃?< 2 绉掞紙vs 鍘熸潵鐨?10-30 绉掞級

---

## 瀹屾暣鏃跺簭鍥?

```
銆愰娆″畨瑁呫€?
t=0:     鐢ㄦ埛鍙屽嚮 GCS-鏅鸿兘瀹夎.bat
t=1:     妫€鏌?Python 鈫?涓嬭浇 Python (if needed)
t=30s:   鍒涘缓 .venv
t=60s:   pip install -r requirements.txt
t=180s:  鍒涘缓蹇嵎鏂瑰紡
t=180s:  鉁?瀹夎瀹屾瘯锛?

銆愰娆″惎鍔紙鏃?Prewarm锛夈€?
t=0:     鐢ㄦ埛鍙屽嚮妗岄潰 GCS 鍥炬爣 (璋冪敤 windows/GCS.cmd)
t=1:     妫€鏌ヤ緷璧?
t=2:     妫€鏌ユ槸鍚﹀凡杩愯
t=5:     鍚庡彴鍚姩 gcs-launch.py
t=8:     鍔犺浇 Python modules
t=15:    鍚姩 Runtime (8766)
t=20:    鍚姩 Supervisor (8765)
t=25:    鍚姩 Watchdog (8767)
t=28:    娴忚鍣ㄦ墦寮€
t=30:    鐢ㄦ埛鐪嬪埌 UI 鉁?

銆愰娆″惎鍔紙鏈?Prewarm锛夈€?
寮€鏈?    windows/GCS-Prewarm.cmd 鍚庡彴棰勫姞杞?Runtime
         (鐢ㄦ埛鏃犳劅鐭?

t=0:     鐢ㄦ埛鍙屽嚮妗岄潰 GCS 鍥炬爣 (璋冪敤 windows/GCS.cmd)
t=1:     妫€鏌ヤ緷璧?
t=2:     妫€鏌ユ槸鍚﹀凡杩愯 (鎵惧埌宸茶繍琛岀殑 Runtime)
t=3:     娴忚鍣ㄦ墦寮€
t=5:     鐢ㄦ埛鐪嬪埌 UI 鉁?

鏃堕棿鑺傜渷: 30s 鈫?5s锛堝揩 6 鍊嶏紒锛?

銆愰噸澶嶅惎鍔紙鏃?Prewarm锛夈€?
t=0:     鐢ㄦ埛鍙屽嚮 GCS 鍥炬爣
t=1:     妫€鏌ヤ緷璧?
t=2:     ping 8766 鈫?鎴愬姛锛堝凡鍦ㄨ繍琛岋級
t=3:     娴忚鍣ㄦ墦寮€ (http://127.0.0.1:8766)
t=4:     鐢ㄦ埛鐪嬪埌 UI 鉁?

銆愭棩甯镐娇鐢ㄣ€?
鍚姩      鈫?渚濊禆妫€鏌?鈫?闃查噸澶?鈫?娴忚鍣?鈫?Web UI
(< 2s锛屽鍚敤 Prewarm)
(10-30s锛屾湭鍚敤 Prewarm)
```

---

## 鎬荤粨

| 鏂囦欢 | 鏃舵満 | 浣滅敤 | 渚濊禆 |
|------|------|------|------|
| **GCS-鏅鸿兘瀹夎.bat** | 棣栨浣跨敤 | 閰嶇疆鐜銆佸垱寤哄揩鎹锋柟寮?| PowerShell銆佺綉缁?|
| **windows/GCS.cmd** | 姣忔鍚姩 | 鍚姩搴旂敤銆佹墦寮€娴忚鍣?| .venv銆丳ython |
| **windows/GCS-Prewarm.cmd** | 寮€鏈猴紙鍙€夛級 | 棰勫姞杞借繍琛屾椂銆佸姞閫熷惎鍔?| .venv銆丳ython |

### 鎺ㄨ崘鐢ㄦ硶

**鏂规 A锛氫笉鍚敤寮€鏈哄惎鍔紙绠€鍗曪級**
```
1. 棣栨锛氬弻鍑?GCS-鏅鸿兘瀹夎.bat锛堝畨瑁咃級
2. 鏃ュ父锛氬弻鍑绘闈?GCS 鍥炬爣锛堝惎鍔級
   鍒濆鍖栨椂闂达細10-30 绉?
```

**鏂规 B锛氬惎鐢ㄥ紑鏈哄惎鍔紙蹇€燂級**
```
1. 棣栨锛氬弻鍑?GCS-鏅鸿兘瀹夎.bat锛堥€夋嫨鍚敤寮€鏈哄惎鍔級
2. 鏃ュ父锛氬弻鍑绘闈?GCS 鍥炬爣锛堝惎鍔級
   鍒濆鍖栨椂闂达細< 2 绉掞紙鍥犱负寮€鏈哄凡棰勫姞杞斤級
```


