# dream-car-garage — 夢想車庫

把想過的車一台一台擺進同一座車庫：360 度環景、換色、換環境光，
可以繞著看。

線上版：https://dream-car-garage.chenchen931222.workers.dev

## 結構

`web-deploy/` 是實際部署的內容，用 Cloudflare Workers 的靜態資產服務
（設定見 `wrangler.jsonc`）。

- `web-deploy/index.html`——車庫首頁
- `web-deploy/garage.html`——單車環景檢視
- `web-deploy/*.glb`——Draco 壓縮後的模型（每台約 1–2MB）
- `web-deploy/env-*.hdr`——三組環境光（studio／sunset／night）
- `dream-car.html`——開發用的完整單檔版本

模型用 `<model-viewer>` 載入。**疊放多台車時要注意**：同一個場景裡放多個
`<model-viewer>` 會各自建立 WebGL context，瀏覽器有數量上限，超過會靜默失敗——
所以車庫是一次只實體化一台。

## 部署

```bash
npx wrangler deploy
```

## 3D 模型來源

模型皆取自 Sketchfab，授權 **CC BY**（姓名標示）。網站介面在每台車的
資訊列都會顯示對應作者與原始連結；此處一併列出：

| 車 | 作者 | 原始頁面 |
|---|---|---|
| Mercedes-Benz W202 Sedan | Nieve5677 | [Sketchfab](https://sketchfab.com/3d-models/mercedes-benz-c-class-w202-sedan-c0630f02413745ff80a83ceecdd3a79e) |
| Mazda MX-5 (ND) | Nieve5677 | [Sketchfab](https://sketchfab.com/3d-models/mazda-mx-5-nd-2014-3ea94405f9c04abfa7bc32865831b3cc) |
| 2022 Porsche Macan | jwustina | [Sketchfab](https://sketchfab.com/3d-models/2022-porsche-macan-f0270f8ae1db4d7b909417e07492043a) |
| 2015 BMW X5 | Ddiaz Design | [Sketchfab](https://sketchfab.com/3d-models/2015-bmw-x5-a2e7d663902e4be7bd170fdb9f333ad8) |
| 2021 Infiniti Q50 Red Sport 400 | Ddiaz Design | [Sketchfab](https://sketchfab.com/3d-models/2021-infiniti-q50-red-sport-400-inaccurate-e91aeee80d1b4dd2b385ca2b951ca5e2) |
| Mercedes-Benz R-Class | KOElkast1007 | [Sketchfab](https://sketchfab.com/3d-models/mercedes-benz-r-class-d68a20ea5fac4e0897b7fb978fdf6e31) |
| 2020 Mazda 3 Hatchback | Ddiaz Design | [Sketchfab](https://sketchfab.com/3d-models/2020-mazda-3-hatchback-a72de3f3c1604409a7e6fc6be9854c9d) |
| 2024 Ford Mustang GT | Ddiaz Design | [Sketchfab](https://sketchfab.com/3d-models/2024-ford-mustang-gt) |

CC BY 允許再散布與改作，條件是標示原作者——本 repo 內的 `.glb` 為
Draco 壓縮後的版本，屬於原模型的改作。

原始未壓縮模型與中間產物（`*-raw.glb`、`glb-backup-nodraco/`）不進版本庫。
