import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { errMessage } from "@/lib/errors";
import { cardCls } from "@/lib/ui";

// Email me when a newly approved listing matches one of mine.
export default function NotificationToggle({ userId, role }: { userId: string; role: string }) {
  const qc = useQueryClient();
  const key = ["notification_settings", userId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_settings")
        .select("email_matches")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const on = data?.email_matches ?? false;

  async function toggle() {
    const { error } = await supabase
      .from("notification_settings")
      .update({ email_matches: !on })
      .eq("user_id", userId);
    if (error) {
      toast.error(errMessage(error));
      return;
    }
    toast.success(on ? "已關閉配對通知" : "已開啟配對通知");
    qc.invalidateQueries({ queryKey: key });
  }

  const what =
    role === "dealer"
      ? "有買家刊登的購車需求符合你刊登的新車時"
      : role === "buyer"
        ? "有車商刊登的新車符合你的購車需求時"
        : "有刊登符合你的刊登時";

  return (
    <div className={`${cardCls} space-y-3`}>
      <h2 className="flex items-center gap-2 font-sans text-lg font-semibold">
        <BellRing className="h-5 w-5" /> 配對通知
      </h2>
      <p className="text-sm text-muted-foreground">
        {what}，寄信到你的登入信箱。對方的刊登要先通過管理員審核才會通知，每則刊登每天最多一封。
      </p>
      <label className="flex items-center gap-3 text-sm">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={isLoading || !data}
          onClick={toggle}
          className={`relative h-6 w-11 rounded-full transition disabled:opacity-50 ${on ? "bg-good" : "bg-secondary"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${on ? "left-5.5" : "left-0.5"}`}
          />
        </button>
        {isLoading ? "載入中…" : on ? "已開啟" : "已關閉"}
      </label>
    </div>
  );
}
