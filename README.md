# dream-car-garage — 夢想車庫

九台車放在同一座車庫裡：一台是我自己的 1993 Mercedes-Benz W202，另外八台是想過的車。
可以看攝影棚的 360 度轉盤、換車色、換輪圈、聽引擎聲，多數車還能坐進車內。

線上版：https://dream-car-garage.chenchen931222.workers.dev

## 四個頁面

`web-deploy/` 是實際部署的內容，用 Cloudflare Workers 的靜態資產服務（設定見 `wrangler.jsonc`）。

| 頁面 | 檔案 | 內容 |
|---|---|---|
| 首頁 | `web-deploy/index.html` | 開場影片，接九台車的攝影棚 360 度轉盤。滾動換車，拖曳旋轉 |
| 配置器 | `web-deploy/garage.html` | 即時 3D（`<model-viewer>`）：換色、輪圈、卡鉗、場景、引擎聲、車內視角、分享連結 |
| 導覽 | `web-deploy/intro.html` | 每個功能為什麼這樣做 |
| 來源 | `web-deploy/sources.html` | 每台車的模型作者、授權，以及我做了哪些修改 |

其他檔案：

- `web-deploy/*.glb`：Draco 壓縮後的模型，每台 0.6–3.6 MB
- `web-deploy/tt/<車>/000..143.webp`：首頁的轉盤影格，每台 144 張、每 2.5° 一張，1280 寬，3.1–4.3 MB（分批下載，沒拖曳的話每台約載六成）。手機、小筆電、省流量模式用這份
- `web-deploy/tt1920/`、`tt2560/`：同一批影格的大螢幕版，每台 4.6–6.3 MB、6.3–8.5 MB。首頁依「畫面上影格多寬 × 螢幕像素密度」挑一份。這兩份不進版本庫（每重渲一次就多一份），部署時照樣上傳
- `web-deploy/snd-*.mp3`：引擎聲，4–8 秒
- `web-deploy/env-*.hdr`：三張環境光，512×256，各約 0.4 MB
- `web-deploy/dream-garage-opening.mp4`、`dream-garage-opening-720.mp4`：開場影片，10.8 秒。1080p 3.7 MB，手機與慢網路給 720p 1.5 MB
- `web-deploy/_headers`：轉盤影格與影片的快取時間
- `web-deploy/404.html`：網址打錯時顯示的頁面（`wrangler.jsonc` 的 `not_found_handling`）
- `tools/`：處理模型用的腳本，網站本身不需要。`cd tools && npm install` 後可以執行
- 根目錄的 `dream-car.html` 是早期的單檔開發版本，沒有部署

## 幾個做法

- **首頁用預先渲染的影格，配置器用即時 3D。** 首頁是用來看的，所以每台車在 Blender 的攝影棚場景裡渲染 144 張，有真的地板倒影。配置器要能換色，所以用即時 3D。
- **一頁不能放超過三個 `<model-viewer>`。** 每個都會建立自己的 WebGL context，超過瀏覽器上限會卡死。配置器一次只實體化一台車。
- **模型不能簡化過頭。** W202 和 MX-5 的車漆原本被簡化掉八成多，攝影棚一打光，車身反光就一塊一塊的。後來換回原始模型的車身，只簡化一半。Q50 是整台被簡化掉六成，車門皺掉、保桿破洞，平滑處理救不回來，最後用原檔重新壓縮、完全不簡化（`tools/rebuild_from_original.mjs`）。
- **環境光不用 1024 寬。** 配置器的環境光原本是 1024×512、每張 1.4–1.7 MB，幾乎跟一台車的模型一樣重。縮成 512×256 後，同角度截圖比對平均只差 1–2 個色階（滿分 255），768 和 512 的結果完全一樣，表示 `model-viewer` 內部用不到那麼高的解析度。
- **兩層疊在一起的表面要刪掉一層。** Macan 的儀表板上有一層白色的面跟內裝的面疊在同一個位置，兩層互相搶著顯示，變成紅白花紋。`tools/fix_interior_v1.mjs` 把貼在內裝表面 0.5 mm 以內的白色三角形刪掉。
- **Blender 匯入的玻璃會折射過頭。** 這些模型的玻璃在 glTF 裡是不折射的薄片，Blender 匯入後卻當成一整塊實心玻璃。Mazda 3 的擋風玻璃因此把視線折到攝影棚的頂燈上，車停著的角度出現一大片白；Q50、X5、Mustang 也有，比較輕。渲染時把那片玻璃的折射率改成 1.0。
- **硬邊燈條會放大車身的不平。** MX-5 車門上一塊塊的白斑，取樣數從 96 拉到 512 都還在，一盞一盞關燈才找到是右側那條燈條：它照在不夠平的車門上，反光的邊緣被扭成碎塊。攝影棚的做法是邊緣漸暗的柔光箱，這裡把三條燈換成邊緣漸層的發光平面，總功率不變。Macan、CX-5 的車門也一起變乾淨。
- **影格要照螢幕給。** 原本只有 1280×720，在 1080p 螢幕上被放大 1.3 倍、MacBook 上將近 2 倍，看起來是糊的。改成 2560×1440 渲染再縮成三份。渲染時連 CPU 一起算反而比較慢：三條渲染同時跑，CPU 吃滿、GPU 只用到六成；改成只用 GPU、降噪也放 GPU，每張從 10 秒降到 6 秒。
- **轉盤要夠密才不會卡。** 一開始每台 36 張（每 10°），換車時的進場只用到 4 張圖，等於每秒 5 格。加密到 144 張後進場用 25 張。圖分五層下載：停留的那張、進場掃過的 60°、每 10°、每 5°，最細的一層等使用者動手拖才載。
- **開場影片不能跟別的東西搶頻寬。** 原本影片一邊播，73 張轉盤圖和 1.4 MB 的字型同時在下載，8 Mbps 下影片會停住。現在影片緩衝完才放行其他下載，並且自己量緩衝速度決定何時開播。
- **車高滑桿每台能降多少，是量出來的。** 輪子以外的零件掛到同一個節點，烘一段往下降 40 mm 的動畫（`tools/add_ride_v1.mjs`，W202 是更早用 Blender 做的）。能降多少照輪胎頂端到外面看得到的車身（烤漆、外飾板）的縫隙，扣 5 mm：Macan 只有 16.5 mm，所以只到 10；X5 外圍的黑色塑膠輪拱 30.6 mm，到 25；AMG 原廠高度就只差 1.4 mm，不做。輪拱裡面的黑色內襯不算，實車降低後輪胎吃進內襯很常見，從外面看不到。Macan、CX-5 的輪胎跟全車的黑色零件合成一塊，是把網格拆成一塊一塊、找「碰地、接近正圓」的那塊認出來的。
- **改裝品要先套上去看，不能只看材質名稱。** 窗戶隔熱紙（原廠、淺色、深色）原本以為九台都能做，逐台截圖後只開放四台：Mustang、CX-5 原廠車窗就是深的，套了沒差；X5 的頭燈燈罩跟車窗同一個材質，會一起變暗；Q50、Mazda 3 的車窗是透射玻璃，調深之後某些角度會浮出一片白霧，而且只從一側看得到，第一輪只拍了另一側才漏掉。黑化套件也試過：五台有鍍鉻材質，但頭燈裡的反射罩也用同一個，一黑化頭燈就像壞掉，所以沒做。
- **自訂車牌是在模型裡加一片薄板，不是改原本的車牌。** W202、MX-5 原本的車牌沒有貼圖座標，上面的字還是立體幾何（模型作者的廣告），印不了字。九台都在車牌前面加一片有 UV 的薄板（`tools/add_plate_quads_v1.mjs`、`v2.mjs`），網頁再把訪客打的字畫成貼圖貼上去。位置是在瀏覽器裡量的：用顏色找出車牌外框，沿中線打射線拿到 3D 座標；原本沒有車牌的車，照實車掛車牌的位置放標準尺寸。車牌座是弧面（AMG）或前面有凸出的邊（Mazda 3 水箱罩下緣）時，平的薄板會被吃掉一半，要往外推到原本的表面前面。
- **參考 Porsche 配置器加選項，先問「這台模型做得出來嗎」。** 官網有上百個選項，大多是模型裡沒有的零件（座椅通風、天窗、方向盤材質）。最後只做四項：車色分四個色系、後視鏡車身色／亮黑、黑化套件、輪圈顏色，而且要九台都有。後視鏡外殼在七台是車漆的一部分、兩台是黑色塑膠，都是左右各一塊 20 公分上下的獨立零件，照大小和位置挑出來（`tools/mods_split_v1.mjs`）；Macan、CX-5 的輪圈跟輪胎同材質，照圓的直徑分開；Macan、CX-5 的亮面飾條照螢幕上量到的位置切。
- **按住看原廠只動材質，不動存檔。** 按下時把車色、輪圈、改裝全部套回這台車剛換上時的值，放開照存下的值還原；不呼叫 `refresh()`，所以不會寫進上次的配置、也不會改分享連結。測試逐材質比對：按著跟原廠完全相同，放開跟改裝後完全相同。
- **進車內前要把轉盤歸零。** `model-viewer` 的自動旋轉轉的是模型本身，不是鏡頭；沒歸零的話，車內視角的方向會跟著跑掉。
- **AR 要真實尺寸，畫面上卻看不出來。** 配置器的鏡頭照車的外框自動取景，模型單位錯了照樣好看。AR 不一樣，它照原尺寸把車擺進房間。九台裡六台的單位不是公尺：W202、MX-5 是公分，會變成 454 公尺長；X5、Mazda 3、Mustang 小了 100 倍，只有 5 公分；Macan 的單位不明。現在 `garage.html` 每台車設 `scale` 換成公尺，再把 iPhone 會收到的 USDZ 拆開量，九台車長都在 3.9–4.9 公尺。少數走 Scene Viewer 的 Android 手機會直接讀原始模型檔，尺寸還是錯的。
- **放進 `<model-viewer>` 插槽的按鈕，位置以 3D 畫框為準。** 手機版的 AR 按鈕原本照整個螢幕算位置，實際上它被裝在 3D 畫框裡，落在畫框上方被裁掉，iPhone 實測才發現。現在 AR 入口改放控制列。

## 部署

```bash
npx wrangler deploy
```

## 素材來源與授權

**這個倉庫沒有統一的授權。** 模型、聲音、貼圖各自屬於原作者，授權如下；有三台車只能非商業使用。
我寫的程式碼與頁面可以自由參考。

### 3D 模型（Sketchfab，授權於 2026 年 9 月查核）

倉庫裡的 `.glb` 都是原模型的改作：重新上色、Draco 壓縮、遮蔽車牌；W202、MX-5、AMG GT 另外重做了內裝材質。

| 車 | 模型 | 作者 | 授權 |
|---|---|---|---|
| Mercedes-Benz W202 C220 | [Mercedes-Benz C-Class (W202) sedan](https://sketchfab.com/3d-models/mercedes-benz-c-class-w202-sedan-c0630f02413745ff80a83ceecdd3a79e) | Nieve5677 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Mazda MX-5（ND） | [Mazda MX-5 (ND) 2014](https://sketchfab.com/3d-models/mazda-mx-5-nd-2014-3ea94405f9c04abfa7bc32865831b3cc) | Nieve5677 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Porsche Macan | [2022 Porsche Macan](https://sketchfab.com/3d-models/2022-porsche-macan-f0270f8ae1db4d7b909417e07492043a) | jwustina | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| BMW X5（F15） | [2015 BMW X5](https://sketchfab.com/3d-models/2015-bmw-x5-a2e7d663902e4be7bd170fdb9f333ad8) | Ddiaz Design | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| Infiniti Q50 Red Sport 400 | [2021 Infiniti Q50 Red Sport 400 (inaccurate)](https://sketchfab.com/3d-models/2021-infiniti-q50-red-sport-400-inaccurate-e91aeee80d1b4dd2b385ca2b951ca5e2) | Ddiaz Design | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Mazda 3 掀背 | [2020 Mazda 3 Hatchback](https://sketchfab.com/3d-models/2020-mazda-3-hatchback-a72de3f3c1604409a7e6fc6be9854c9d) | Ddiaz Design | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| Ford Mustang GT | [2024 Ford Mustang GT](https://sketchfab.com/3d-models/2024-ford-mustang-gt-16f0753d26a04a089223f2d9107a777f) | Ddiaz Design | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| Mercedes-AMG GT 63 S 4-Door | [Mercedes-Benz AMG GT 4-Door Coupe (X290)](https://sketchfab.com/3d-models/mercedes-benz-amg-gt-4-door-coupe-x290-fe00234b5af84539ade55c31ca6639e3) | ZapupaNekra | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Mazda CX-5 | [Mazda CX-5 2020](https://sketchfab.com/3d-models/mazda-cx-5-2020-ea176c6ebe814be3b06641bf038f8642) | ItsDiyor | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

AMG GT 的原檔裡有 41 個零件名稱來自賽車遊戲 BeamNG 的 ETK 800，上傳者未必有權授權這些零件；目前保留，疑慮寫在[來源頁](https://dream-car-garage.chenchen931222.workers.dev/sources)。

標 CC BY 的模型，修改版沿用 CC BY 4.0。標 CC BY-NC-SA 的三台（X5、Mazda 3、Mustang），修改版同樣以 CC BY-NC-SA 4.0 提供，只能非商業使用。

### 其他素材

- **環境光與內裝貼圖**：Poly Haven，CC0。
- **引擎聲**：Freesound 與 Wikimedia Commons 上的 CC0、CC BY、公有領域錄音。只有 W202 錄的是同款車，其他八台是同系列或同類型的引擎。每一段的作者與連結列在 [來源頁](https://dream-car-garage.chenchen931222.workers.dev/sources)。
- **開場影片與首頁轉盤影格**：我在 Blender 用上面的模型渲染的。開場影片裡的行人是 Renderpeople 的真人掃描模型，只出現在渲染好的畫面裡，倉庫沒有散布模型檔。

原始未壓縮模型與中間產物（`*-raw.glb`、`glb-backup-nodraco/`）不進版本庫。
