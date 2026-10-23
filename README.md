# 新車媒合 New Car Match

免費的新車買賣資訊媒合平台：車商刊登新車、買家刊登購車需求，雙方用站內留言聯繫。
平台不收費、不經手款項、不參與交易。

由理髮預約平台（pixel-perfect-replica）複製改寫：保留 Vite + React Router + Supabase 的架構與登入流程，
移除預約、時段、Stripe 金流與撥款。

## 功能

| 角色 | 可以做的事 |
|---|---|
| 訪客 | 瀏覽已上架的新車與購車需求、看條款 |
| 買家 | 刊登購車需求（品牌、車型、預算、地區）、留言詢問車商、檢舉 |
| 車商／業務 | 註冊時填公司名稱（＋選填統編）、刊登新車與照片、留言報價、檢舉 |
| 管理員 | 審核刊登（通過／退件附原因）、處理檢舉（駁回／下架）、驗證車商 |

- **配對**：刊登上架後，刊登者會在自己的刊登頁看到同品牌、價格／預算相符的對方刊登。
- **配對通知信**：刊登通過審核時，系統比對品牌、車型與價格／預算。車商的新車符合買家需求時寄信給買家，買家的新需求符合車商的車時寄信給車商。
  每則刊登每天最多一封（多筆合併成一封），可在帳號設定關閉，每封信都有取消連結。由 `supabase/functions/send-match-emails`
  透過 Resend 寄出，pg_cron 每 15 分鐘執行一次。
- **防詐**：刊登一律人工審核才公開；修改已上架內容會重新送審；不公開電話，只用站內留言；
  每帳號每天最多 10 則刊登、每小時 30 則訊息；3 筆未處理檢舉會自動暫停顯示；各頁附防詐提醒與 165 專線。
- **個資與條款**：註冊必須勾選同意使用條款、隱私權政策、免責聲明，並記錄同意的版本與時間；
  社群登入或條款改版時會先導到 `/consent`。資料庫層（RLS）也會拒絕未同意條款者刊登。

所有權限都在資料庫層用 RLS 與 security-definer 函式控管，前端路由檢查只是 UX。

## 上線步驟

1. **建立新的 Supabase 專案**（不要沿用理髮平台的資料庫）。
2. 在 SQL Editor 執行 `supabase/migrations/20261022000000_init_new_car_match.sql`
   （或用 Supabase CLI `supabase db push`）。
3. Supabase → Authentication → URL Configuration：Site URL 設成正式網址，
   Redirect URLs 加入 `https://<你的網域>/sign-in` 與 `https://<你的網域>/reset-password`。
4. 用你的信箱在網站註冊，再到 SQL Editor 把自己設成管理員：
   ```sql
   update public.profiles set role = 'admin'
    where id = (select id from auth.users where email = '<你的信箱>');
   ```
5. Vercel 匯入這個 repo，設定環境變數（Production）：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
6. 配對通知信：把 Resend API key 存進 Supabase Vault（名稱 `resend_api_key`），部署 `supabase/functions/send-match-emails`
   （verify_jwt 關閉），再執行 `20261023000000_match_notifications.sql` 檔尾註解裡的 `cron.schedule`。寄件網域須已在 Resend 驗證。
7. 編輯 `src/lib/site.ts`，填入營運者名稱與聯絡信箱；並在 `src/pages/Legal.tsx` 填入管轄法院。
   **條款、隱私權政策與免責聲明是草稿，正式上線前請請律師審閱。**
   之後修改條款時，把 `TERMS_VERSION` 改成新日期，所有會員下次刊登前會被要求重新同意。

## 開發

```bash
cp .env.example .env   # 填入 Supabase URL 與 publishable key
bun install
bun run dev
bun run test && bun run typecheck && bun run lint
```

## 專案結構

- `supabase/migrations/` — 資料表、RLS、函式、照片儲存空間
- `src/lib/cars.ts` — 品牌／縣市清單、價格格式、刊登查詢與配對
- `src/lib/profile.ts` — 登入狀態、角色、條款同意檢查
- `src/lib/site.ts` — 網站名稱、條款版本、營運者資料
- `src/pages/` — 首頁、瀏覽、刊登詳情、刊登表單、我的刊登、訊息、帳號、管理後台、條款頁
