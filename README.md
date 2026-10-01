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

- `web-deploy/*.glb`：Draco 壓縮後的模型，每台 0.6–3.2 MB
- `web-deploy/tt/<車>/000..143.webp`：首頁的轉盤影格，每台 144 張、每 2.5° 一張，2.8–3.7 MB（分批下載，沒拖曳的話每台約載六成）
- `web-deploy/snd-*.mp3`：引擎聲，4–8 秒
- `web-deploy/env-*.hdr`：三張環境光
- `web-deploy/dream-garage-opening.mp4`、`dream-garage-opening-720.mp4`：開場影片，10.8 秒。1080p 3.7 MB，手機與慢網路給 720p 1.5 MB
- `web-deploy/_headers`：轉盤影格與影片的快取時間
- 根目錄的 `dream-car.html` 是早期的單檔開發版本，沒有部署

## 幾個做法

- **首頁用預先渲染的影格，配置器用即時 3D。** 首頁是用來看的，所以每台車在 Blender 的攝影棚場景裡渲染 144 張，有真的地板倒影。配置器要能換色，所以用即時 3D。
- **一頁不能放超過三個 `<model-viewer>`。** 每個都會建立自己的 WebGL context，超過瀏覽器上限會卡死。配置器一次只實體化一台車。
- **模型不能簡化過頭。** W202 和 MX-5 的車漆原本被簡化掉八成多，攝影棚一打光，車身反光就一塊一塊的。後來換回原始模型的車身，只簡化一半。
- **轉盤要夠密才不會卡。** 一開始每台 36 張（每 10°），換車時的進場只用到 4 張圖，等於每秒 5 格。加密到 144 張後進場用 25 張。圖分五層下載：停留的那張、進場掃過的 60°、每 10°、每 5°，最細的一層等使用者動手拖才載。
- **開場影片不能跟別的東西搶頻寬。** 原本影片一邊播，73 張轉盤圖和 1.4 MB 的字型同時在下載，8 Mbps 下影片會停住。現在影片緩衝完才放行其他下載，並且自己量緩衝速度決定何時開播。
- **進車內前要把轉盤歸零。** `model-viewer` 的自動旋轉轉的是模型本身，不是鏡頭；沒歸零的話，車內視角的方向會跟著跑掉。

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

標 CC BY 的模型，修改版沿用 CC BY 4.0。標 CC BY-NC-SA 的三台（X5、Mazda 3、Mustang），修改版同樣以 CC BY-NC-SA 4.0 提供，只能非商業使用。

### 其他素材

- **環境光與內裝貼圖**：Poly Haven，CC0。
- **引擎聲**：Freesound 與 Wikimedia Commons 上的 CC0、CC BY、公有領域錄音。只有 W202 錄的是同款車，其他八台是同系列或同類型的引擎。每一段的作者與連結列在 [來源頁](https://dream-car-garage.chenchen931222.workers.dev/sources)。
- **開場影片與首頁轉盤影格**：我在 Blender 用上面的模型渲染的。開場影片裡的行人是 Renderpeople 的真人掃描模型，只出現在渲染好的畫面裡，倉庫沒有散布模型檔。

原始未壓縮模型與中間產物（`*-raw.glb`、`glb-backup-nodraco/`）不進版本庫。
