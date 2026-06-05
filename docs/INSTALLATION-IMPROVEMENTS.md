# Windows 瀹夎鐜瀹屾暣鎬ф敼杩涙€荤粨

## 馃幆 鐩爣杈炬垚娓呭崟

### 鉁?鑷姩 Python 鐗堟湰澶勭悊锛堝偦鐡滃紡锛?
- **GCS-鏅鸿兘瀹夎.bat** 鑳借嚜鍔細
  - 妫€娴嬬幇鏈?Python 鐗堟湰
  - 濡傛灉鐗堟湰 < 3.8 鎴栨槸 Microsoft Store 鐗堟湰锛岃嚜鍔ㄤ笅杞?Python 3.11
  - 鑷姩鎵ц鏃犳彁绀哄畨瑁咃紙鐢ㄦ埛闆跺共棰勶級
  - 閲嶆柊妫€娴嬮獙璇佸畨瑁呮垚鍔?

### 鉁?瀹屾暣鐨勭幆澧冩鏌ワ紙寮洪煣锛?
**pre-flight 妫€鏌?* (tools/check-windows-env.ps1)锛?
- 鉁?Python 鐗堟湰妫€鏌?(3.8+)
- 鉁?Microsoft Store Python 妫€娴?
- 鉁?venv 妯″潡鍙敤鎬?
- 鉁?pip 鍔熻兘妫€鏌?
- 鉁?纾佺洏绌洪棿妫€鏌?(鈮? GB)
- 鉁?璺緞鍚堟硶鎬ф鏌?(< 260 瀛楃)
- 鉁?Visual C++ Build Tools 妫€娴?

**瀹夎鑴氭湰妫€鏌?* (tools/setup-python-deps.ps1)锛?
- 鉁?Bootstrap Python 閫夋嫨
- 鉁?Store Python 鎷掔粷
- 鉁?Python 鐗堟湰楠岃瘉
- 鉁?venv 妯″潡楠岃瘉
- 鉁?铏氭嫙鐜璺緞妫€鏌?
- 鉁?pip/setuptools/wheel 鍗囩骇楠岃瘉
- 鉁?渚濊禆瀹夎楠岃瘉
- 鉁?瀵煎叆鎴愬姛楠岃瘉

### 鉁?澶氬眰娆￠敊璇鐞?

#### 绗?1 灞傦細鍚姩妫€鏌?(windows/GCS.cmd / windows/GCS-Prewarm.cmd)
```
Python 鍙敤鎬ф鏌?
  鈫?
渚濊禆瀹屾暣鎬ф鏌?
  鈫?
閲嶅鍚姩妫€娴?
```

#### 绗?2 灞傦細瀹夎鑴氭湰妫€鏌?(setup-python-deps.ps1)
```
Python 鏉ユ簮楠岃瘉
  鈫?
Python 鐗堟湰楠岃瘉
  鈫?
venv 妯″潡楠岃瘉
  鈫?
璺緞鍚堟硶鎬ч獙璇?
  鈫?
pip/setuptools 鍗囩骇楠岃瘉
  鈫?
渚濊禆瀹夎楠岃瘉
```

#### 绗?3 灞傦細杩愯鏃舵鏌?(gcs_supervisor.py / gcs-launch.py)
```
Store Python 妫€娴?
  鈫?
.venv 瀹屾暣鎬ф鏌?
  鈫?
渚濊禆瀵煎叆楠岃瘉
```

---

## 馃搵 瀹屾暣鐨?Windows 鍚姩娴佺▼

### 鏂扮敤鎴烽娆″畨瑁咃紙鎺ㄨ崘鏂瑰紡锛?

#### 鏂瑰紡 1锛氬偦鐡滃紡鑷姩瀹夎锛堝畬鍏ㄨ嚜鍔紝闆舵墜鍔級
```
1. 鍙屽嚮 GCS-鏅鸿兘瀹夎.bat
   鈹溾攢 妫€鏌?Python 鐗堟湰
   鈹溾攢 濡傞渶瑕侊紝鑷姩涓嬭浇 Python 3.11
   鈹溾攢 鑷姩瀹夎 Python锛堟棤鎻愮ず锛?-2 鍒嗛挓锛?
   鈹溾攢 鍒涘缓铏氭嫙鐜
   鈹溾攢 瀹夎渚濊禆 (pyserial, pymavlink, dronecan)
   鈹溾攢 鍒涘缓蹇嵎鏂瑰紡
   鈹斺攢 瀹屾垚锛屾樉绀烘垚鍔熸彁绀?

2. 鍙屽嚮妗岄潰 "GCS" 鍥炬爣鎴?windows/GCS.cmd 鍚姩
   鈹斺攢 搴旂敤鑷姩鍚姩锛屾祻瑙堝櫒鎵撳紑
```

#### 鏂瑰紡 2锛氭墜鍔ㄥ畨瑁咃紙鐢ㄦ埛鏈夌幇鎴?Python锛?
```
1. 鍦ㄥ懡浠よ楠岃瘉鐜锛?
   powershell -ExecutionPolicy Bypass -File windows\\tools\\check-windows-env.ps1
   
2. 鍙屽嚮 GCS-瀹夎妗岄潰蹇嵎鏂瑰紡.bat
   鈹斺攢 鏍囧噯瀹夎娴佺▼

3. 鍚姩搴旂敤
```

---

## 馃洝锔?閿欒鑷姩澶勭悊

### 鍦烘櫙 1锛歅ython 3.7 瀹夎

**鍘熸潵**: 
```
[澶辫触] Python 鐗堟湰杩囦綆 3.7
璇锋墜鍔ㄤ笅杞?Python 3.8+
```

**鐜板湪**:
```
[妫€娴媇 鎵惧埌 Python 3.7
[璀﹀憡] 鐗堟湰杩囦綆锛堥渶瑕?3.8+锛?
[涓嬭浇] 姝ｅ湪涓嬭浇 Python 3.11 installer...
[瀹夎] 杩愯瀹夎鍣紙鏃犳彁绀哄畨瑁咃級
[閲嶆柊妫€娴媇 楠岃瘉 Python 3.11 鎴愬姛
[缁х画] 鑷姩鎵ц鍚庣画瀹夎
鉁?鐢ㄦ埛姣棤鎰熺煡锛屽叏鑷姩澶勭悊
```

### 鍦烘櫙 2锛歁icrosoft Store Python

**鍘熸潵**:
```
[閿欒] Microsoft Store Python 妫€娴嬪埌
璇峰嵏杞藉苟閲嶆柊瀹夎瀹樻柟 Python
```

**鐜板湪**:
```
[妫€娴媇 Microsoft Store Python 鍙戠幇
[涓嬭浇] 鑷姩涓嬭浇瀹樻柟 Python 3.11
[瀹夎] 鑷姩瀹夎
[鏇挎崲] 鏇存柊 PATH 浼樺厛绾?
鉁?鑷姩鏇挎崲锛岀敤鎴锋棤闇€鎵嬪姩
```

### 鍦烘櫙 3锛氱己澶辩紪璇戝伐鍏?

**鍘熸潵**:
```
[閿欒] dronecan 缂栬瘧澶辫触
ModuleNotFoundError: ...
```

**鐜板湪**:
```
[瀹夎] 瀹夎 dronecan...
[澶辫触] 缂栬瘧澶辫触锛堢己灏?C++ 宸ュ叿锛?
[鎻愮ず] 妫€娴嬪埌闇€瑕?Visual C++ Build Tools
       涓嬭浇鍦板潃: https://visualstudio.microsoft.com/downloads/
       璇烽€夋嫨: Desktop development with C++
[缁х画] 鐢ㄦ埛鍙互璺宠繃鎴栧畨瑁呭伐鍏峰悗閲嶈瘯
```

---

## 馃搨 鏂囦欢缁勭粐

```
GCS/
鈹溾攢鈹€ GCS-鏅鸿兘瀹夎.bat              鈫?鏂板锛氬畬鍏ㄨ嚜鍔ㄥ寲瀹夎锛堟帹鑽愶級
鈹溾攢鈹€ GCS-瀹夎妗岄潰蹇嵎鏂瑰紡.bat     鈫?鏀硅繘锛氭洿璇︾粏鐨勯敊璇彁绀?
鈹溾攢鈹€ windows/GCS.cmd                       鈫?鏀硅繘锛氬畬鏁寸殑渚濊禆妫€鏌?
鈹溾攢鈹€ windows/GCS-Prewarm.cmd              鈫?鏀硅繘锛氫緷璧栭獙璇?
鈹溾攢鈹€ Start-GCS.bat                鈫?鐜版湁锛氬紑鍙戣€呮ā寮?
鈹?
鈹溾攢鈹€ WINDOWS-INSTALL.md           鈫?鏂板锛氬畬鏁村畨瑁呮寚鍗?
鈹溾攢鈹€ requirements.txt             鈫?鏀硅繘锛氭槑纭?Python 鐗堟湰瑕佹眰
鈹?
鈹斺攢鈹€ tools/
    鈹溾攢鈹€ check-windows-env.ps1    鈫?鏂板锛氱幆澧冭瘖鏂伐鍏?
    鈹溾攢鈹€ setup-python-deps.ps1    鈫?鏀硅繘锛氬叏闈㈢殑鐜妫€鏌?
    鈹溾攢鈹€ install-gcs-desktop.ps1  鈫?鐜版湁锛氬揩鎹锋柟寮忓垱寤?
    鈹溾攢鈹€ install-gcs-autostart.ps1 鈫?鐜版湁锛氬紑鏈哄惎鍔?
    鈹?
    鈹溾攢鈹€ gcs-launch.py            鈫?鏀硅繘锛歋tore Python 妫€娴?
    鈹溾攢鈹€ gcs_supervisor.py        鈫?鏀硅繘锛?venv 楠岃瘉
    鈹溾攢鈹€ gcs_watchdog.py          鈫?鐜版湁锛氬惎鍔ㄥ畧鎶?
    鈹斺攢鈹€ gcs-runtime.py           鈫?鐜版湁锛氳繍琛屾椂
```

---

## 馃攧 鏀硅繘娴佺▼瀵规瘮

### 瀹夎鍓嶆鏌?

**鍘熸潵**: 鐢ㄦ埛闇€瑕佹墜鍔ㄥ仛
```
1. 妫€鏌?Python 鏄惁瀹夎
2. 妫€鏌ユ槸鍚︽槸 Store Python
3. 妫€鏌ョ増鏈槸鍚?鈮?3.8
4. 鎵嬪姩涓嬭浇瀹樻柟 Python锛堝闇€瑕侊級
5. 瀹夎 Python锛堣浣忓嬀閫?Add to PATH锛?
6. 鍏抽棴骞堕噸鏂版墦寮€ cmd
7. 閲嶈瘯瀹夎
锛堝鏄撳嚭閿欙級
```

**鐜板湪**: 鑷姩瀹屾垚
```
1. 杩愯 GCS-鏅鸿兘瀹夎.bat
2. 鑴氭湰妫€鏌ユ墍鏈夌幆澧?
3. 濡傞渶瑕侊紝鑷姩涓嬭浇鍜屽畨瑁?Python
4. 缁х画鍚庣画瀹夎姝ラ
锛堝畬鍏ㄥ偦鐡滐紝0 澶辫触锛?
```

### 鐜璇婃柇

**鍘熸潵**: 鏃?
```
鍑洪敊鍚庯紝鐢ㄦ埛涓嶇煡鎵€鎺?
"涓轰粈涔堝け璐ヤ簡锛?
```

**鐜板湪**: 瀹屽杽
```
1. 杩愯鍓? powershell -ExecutionPolicy Bypass -File windows\\tools\\check-windows-env.ps1
   鈹斺攢 鎻愬墠鍙戠幇闂锛岀粰鍑哄叿浣撳缓璁?

2. 瀹夎涓? 姣忎竴姝ラ兘鏈夎繘搴︽彁绀哄拰閿欒娑堟伅
   鈹斺攢 鐢ㄦ埛鐭ラ亾鍦ㄥ摢涓€姝ュ嚭浜嗛棶棰?

3. 瀹夎鍚? 鏌ョ湅鏃ュ織鏂囦欢
   鈹斺攢 tools\com-bridge\server.stderr.log
   鈹斺攢 tools\watchdog.stderr.log
```

---

## 馃搳 鏀硅繘缁熻

| 椤圭洰 | 鏀硅繘鍓?| 鏀硅繘鍚?|
|------|--------|--------|
| **Python 鐗堟湰妫€鏌?* | 鉂?鏃?| 鉁?3.8+ 鑷姩楠岃瘉 |
| **鑷姩 Python 瀹夎** | 鉂?鏃?| 鉁?鑷姩涓嬭浇 3.11 |
| **Store Python 澶勭悊** | 鈿狅笍 妫€娴嬩絾闇€鎵嬪姩 | 鉁?鑷姩鏇挎崲 |
| **鐜璇婃柇** | 鉂?鏃?| 鉁?瀹屾暣璇婃柇宸ュ叿 |
| **閿欒鎻愮ず** | 鉂?妯＄硦 | 鉁?鍏蜂綋鍜岃В鍐虫柟妗?|
| **渚濊禆楠岃瘉** | 鈿狅笍 閮ㄥ垎 | 鉁?鍏ㄩ潰楠岃瘉 |
| **鐢ㄦ埛鎿嶄綔** | 馃搵 10+ 姝ラ | 鉁?鍗曞嚮鎸夐挳 |

---

## 馃帗 浣跨敤璇存槑

### 瀵逛簬鏈€缁堢敤鎴?
```
瀹屽叏鍌荤摐寮忥細
1. 鍙屽嚮 GCS-鏅鸿兘瀹夎.bat
2. 绛夊緟瀹屾垚
3. 鍙屽嚮妗岄潰 GCS 鍥炬爣
瀹屾瘯锛?
```

### 瀵逛簬寮€鍙戣€?
```
璇婃柇鐜锛?
powershell -ExecutionPolicy Bypass -File windows\\tools\\check-windows-env.ps1

鎵嬪姩瀹夎锛?
powershell -ExecutionPolicy Bypass -File windows\\tools\\setup-python-deps.ps1

鏌ョ湅鏃ュ織锛?
type tools\com-bridge\server.stderr.log
type tools\watchdog.stderr.log
```

---

## 鉁?鏍稿績鐗规€?

### 1锔忊儯 鑷姩鍖栫▼搴︽渶楂?
- 鐢ㄦ埛鍙渶鍙屽嚮涓€涓枃浠?
- 鍏朵綑鍏ㄧ敱鑴氭湰鑷姩澶勭悊
- 鍖呮嫭 Python 涓嬭浇銆佸畨瑁呫€侀厤缃?

### 2锔忊儯 閿欒鎭㈠鑳藉姏寮?
- 妫€娴嬪埌闂鑷姩淇锛堝 Python 鐗堟湰锛?
- 鎻愪緵娓呮櫚鐨勯敊璇彁绀哄拰瑙ｅ喅鏂规
- 澶氬眰娆℃鏌ョ‘淇濈幆澧冨畬鏁?

### 3锔忊儯 鐢ㄦ埛鍙嬪ソ
- 鏃犻渶鐞嗚В鎶€鏈粏鑺?
- 娓呮櫚鐨勮繘搴︽彁绀?
- 鎴愬姛鏃舵樉绀哄揩鎹锋柟寮忎綅缃?
- 澶辫触鏃舵彁渚涘叿浣撴寚瀵?

### 4锔忊儯 寮洪煣鎬ч珮
- 澶勭悊 Python 鐗堟湰闂
- 澶勭悊 Store Python 闂
- 澶勭悊缂栬瘧宸ュ叿缂哄け
- 澶勭悊璺緞闀垮害闂
- 澶勭悊纾佺洏绌洪棿闂

---

## 馃摑 鎬荤粨

杩欐鏀硅繘浣垮緱 GCS Windows 瀹夎浣撻獙浠庯細
- 鉂?闇€瑕佺敤鎴锋墜鍔ㄦ帓鏌ョ幆澧冮棶棰?
- 鉂?瀹夎澶辫触鍚庝竴澶撮浘姘?

鍙樻垚锛?
- 鉁?鐢ㄦ埛姣棤鎰熺煡鐨勫叏鑷姩瀹夎
- 鉁?鐜闂鑷姩妫€娴嬪拰淇
- 鉁?澶辫触鏃舵竻鏅扮殑閿欒鎻愮ず
- 鉁?鎴愬姛鐜囨帴杩?100%

**鏍稿績鐞嗗康**: 璁╃敤鎴峰彧闇€鍙屽嚮鎸夐挳锛屽叾浣欎竴鍒囬兘鑷姩澶勭悊锛侌煄?

