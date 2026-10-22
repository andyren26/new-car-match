import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import ConfirmButton from "@/components/ConfirmButton";
import { supabase } from "@/integrations/supabase/client";
import { MAX_PHOTOS, MAX_PHOTO_BYTES, PHOTO_BUCKET, photoUrl } from "@/lib/cars";
import { errMessage } from "@/lib/errors";
import { ghostBtn } from "@/lib/ui";

// Photos for one listing: files at <listing_id>/<uuid>.<ext> in the public
// listing-photos bucket, metadata in listing_photos.
export default function ListingPhotos({ listingId }: { listingId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = ["listing_photos", listingId];

  const { data: photos = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_photos")
        .select("*")
        .eq("listing_id", listingId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["listing", listingId] });
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    let next = photos.reduce((m, p) => Math.max(m, p.sort_order), -1) + 1;
    let room = MAX_PHOTOS - photos.length;
    for (const file of Array.from(files)) {
      if (room <= 0) {
        setError(`每則刊登最多 ${MAX_PHOTOS} 張照片`);
        break;
      }
      if (!file.type.startsWith("image/")) {
        setError(`${file.name}：只能上傳圖片`);
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setError(`${file.name}：檔案太大（上限 5MB）`);
        continue;
      }
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${listingId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (up.error) {
        setError(errMessage(up.error, "上傳失敗"));
        continue;
      }
      const ins = await supabase
        .from("listing_photos")
        .insert({ listing_id: listingId, storage_path: path, sort_order: next++ });
      if (ins.error) {
        await supabase.storage.from(PHOTO_BUCKET).remove([path]);
        setError(errMessage(ins.error, "上傳失敗"));
        continue;
      }
      room--;
    }
    if (fileRef.current) fileRef.current.value = "";
    setBusy(false);
    refresh();
  }

  async function makeCover(index: number) {
    const cover = photos[index];
    if (!cover) return;
    const reordered = [cover, ...photos.filter((_, i) => i !== index)];
    await Promise.all(
      reordered.map((p, i) =>
        supabase.from("listing_photos").update({ sort_order: i }).eq("id", p.id),
      ),
    );
    refresh();
  }

  async function remove(id: string, path: string) {
    const st = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (st.error) {
      setError(errMessage(st.error));
      return;
    }
    const { error } = await supabase.from("listing_photos").delete().eq("id", id);
    if (error) setError(errMessage(error));
    refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-sans text-base font-semibold">照片</h3>
          <p className="text-xs text-muted-foreground">
            最多 {MAX_PHOTOS} 張、每張 5MB 以內。第一張是封面。請只上傳自己拍攝或有權使用的照片。
          </p>
        </div>
        <label
          className={`${ghostBtn} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}
        >
          {busy ? "上傳中…" : "＋ 上傳照片"}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {photos.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {photos.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-lg border bg-background">
              <div className="relative">
                <img
                  src={photoUrl(p.storage_path)}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                />
                {i === 0 && (
                  <span className="absolute top-2 left-2 rounded bg-card px-2 py-0.5 text-xs font-medium">
                    封面
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between p-2">
                {i > 0 ? (
                  <button
                    type="button"
                    onClick={() => makeCover(i)}
                    className="text-xs underline underline-offset-2"
                  >
                    設為封面
                  </button>
                ) : (
                  <span />
                )}
                <ConfirmButton
                  label="刪除"
                  confirmLabel="確定"
                  onConfirm={() => remove(p.id, p.storage_path)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
