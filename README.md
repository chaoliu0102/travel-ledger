# 說走就走 小帳本

手機友善的旅行記帳 App，可依旅遊專案管理成員、幣別、消費明細、代墊與結清狀態，並同步到指定 Google Sheet。

## 手機與旅伴共用

- `127.0.0.1` 只能在目前這台電腦測試，手機與旅伴不能直接使用。
- 這個 App 不建議直接雙擊 `index.html` 開啟，瀏覽器可能會因 `file://` 安全限制擋住功能。Windows 測試請雙擊 `open-travel-split.bat`，或開啟 `http://127.0.0.1:5173/`。
- 要分享給旅伴，請把這個資料夾部署到 HTTPS 靜態網站，例如 GitHub Pages、Netlify、Vercel 或 Cloudflare Pages。
- Android Chrome 可用瀏覽器的安裝提示加入主畫面。
- iPhone / iPad 請用 Safari 開啟網址，再用分享選單選「加入主畫面」。
- 每台手機會先把資料存在本機，按「同步」後寫入同一份 Google Sheet。
- 旅伴輸入的資料可按「雲端更新」拉回目前專案，讓統計與個人明細包含大家的紀錄。

## 專案設定

每個旅遊專案可設定：

- 專案名稱
- 此專案成員名單
- 此專案可用幣別

台幣會固定保留；目的地幣別可依不同旅遊目的地勾選。

## Google Sheet 同步

目前 Apps Script 會寫入這份 Sheet：

`1Fw2OaJ3UzGdq0GW7XBor7dOPCi6Tm_qwqIzqogMug1Y`

同步時會依旅遊專案名稱尋找同名分頁；如果分頁不存在，會用第一個分頁作為模板複製出新分頁，清空 A:H 明細區後再寫入。

A:I 欄位固定為：

- A：日期
- B：店家
- C：項目
- D：台幣
- E：目的地幣別
- F：誰的
- G：付的
- H：備註
- I：ID

支付方式與結清註記會寫入備註欄，例如 `[刷卡] 結 訂編TUP680755`。

I 欄用來讓 App 後續能更新、刪除同一筆消費。若覺得影響版面，可以在 Google Sheet 隱藏 I 欄。

## Apps Script 部署

1. 到 Google Apps Script 建立新專案。
2. 將 `apps-script/Code.gs` 全部貼上。
3. 儲存後部署成 Web App。
4. 執行身分選「我」。
5. 存取權依共用需求選「任何知道連結的人」。
6. 把 Web App URL 貼到 App 的同步設定。

每次更新 `Code.gs` 後都要重新部署 Web App，手機才會連到新版同步程式。

目前 App 支援新增、編輯、刪除專案與消費明細。專案改名會更新 App 本機資料；Google Sheet 舊分頁不會自動改名，之後同步會依新專案名稱建立或使用新分頁。

## 離線與安裝

App 已加入 PWA 檔案：

- `manifest.webmanifest`
- `sw.js`
- `icon.svg`

部署到 HTTPS 網站後，瀏覽器會快取 App 外殼。離線時仍可記帳，恢復連線後再按「同步」即可。
