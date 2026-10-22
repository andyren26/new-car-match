import { Link } from "react-router";

import { ANTI_FRAUD_HOTLINE, SITE_NAME } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 text-sm text-muted-foreground sm:px-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-2">
          <p className="font-medium text-foreground">{SITE_NAME}</p>
          <p>
            本平台僅提供新車買賣資訊刊登與媒合，不收取任何費用，不參與交易、不經手款項，
            亦不保證車況、價格與刊登內容的真實性。交易前請自行查證車商資料並實際看車。
          </p>
          <p>遇到可疑情況請按刊登頁的「檢舉」，或撥打 {ANTI_FRAUD_HOTLINE} 反詐騙諮詢專線。</p>
        </div>
        <nav className="flex flex-col gap-2 md:items-end">
          <Link to="/terms" className="hover:text-foreground">
            使用條款
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            隱私權政策
          </Link>
          <Link to="/disclaimer" className="hover:text-foreground">
            免責聲明
          </Link>
          <span className="pt-2 text-xs">
            © {new Date().getFullYear()} {SITE_NAME}
          </span>
        </nav>
      </div>
    </footer>
  );
}
