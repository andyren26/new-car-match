import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Listing = Tables<"listings">;
export type ListingPhoto = Tables<"listing_photos">;
export type Kind = "sell" | "want";

export const PHOTO_BUCKET = "listing-photos";
export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const KIND_LABEL: Record<Kind, string> = { sell: "車商賣車", want: "買家求購" };

export const STATUS_LABEL: Record<string, string> = {
  pending: "審核中",
  approved: "已上架",
  rejected: "未通過",
  closed: "已結束",
};

// Brands commonly sold new in Taiwan, roughly by market share; "其他" lets a
// dealer type something else in the model field.
export const BRANDS = [
  "Toyota",
  "Lexus",
  "Honda",
  "Nissan",
  "Mazda",
  "Mitsubishi",
  "Subaru",
  "Suzuki",
  "Hyundai",
  "Kia",
  "Ford",
  "Luxgen",
  "MG",
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Volkswagen",
  "Skoda",
  "Volvo",
  "Porsche",
  "Tesla",
  "Peugeot",
  "Mini",
  "Land Rover",
  "其他",
] as const;

export const REGIONS = [
  "台北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "台中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "台南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
] as const;

export const REPORT_REASONS = [
  { id: "fraud", label: "疑似詐騙（要求先匯訂金、價格明顯不合理）" },
  { id: "fake", label: "假刊登／車輛不存在" },
  { id: "wrong_info", label: "資訊不實" },
  { id: "duplicate", label: "重複刊登" },
  { id: "offensive", label: "內容不當" },
  { id: "other", label: "其他" },
] as const;

export const REPORT_REASON_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.id, r.label]),
);

const twd = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

// "NT$1,150,000"; large round prices also read as "115 萬" in Taiwan.
export function formatTWD(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$${twd.format(n)}`;
}

export function formatWan(n: number | null | undefined): string {
  if (n == null) return "—";
  const wan = n / 10000;
  return `${Number.isInteger(wan) ? wan : wan.toFixed(1)} 萬`;
}

// The headline price line of a listing card.
export function priceLine(l: Pick<Listing, "kind" | "price" | "budget_min" | "budget_max">) {
  if (l.kind === "sell") return formatWan(l.price);
  if (l.budget_min && l.budget_max)
    return `${formatWan(l.budget_min)} – ${formatWan(l.budget_max)}`;
  return `${formatWan(l.budget_max)} 以內`;
}

export const photoUrl = (path: string) =>
  supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;

// Listing row + who posted it + photos, as the browse and detail pages need.
export const LISTING_SELECT =
  "*, owner:profiles!listings_owner_id_fkey(id, role, display_name, company_name, tax_id, dealer_verified), listing_photos(id, storage_path, sort_order)";

export type ListingOwner = {
  id: string;
  role: string;
  display_name: string | null;
  company_name: string | null;
  tax_id: string | null;
  dealer_verified: boolean;
};

export type ListingFull = Listing & {
  owner: ListingOwner | null;
  listing_photos: Pick<ListingPhoto, "id" | "storage_path" | "sort_order">[];
};

export const sortedPhotos = (l: Pick<ListingFull, "listing_photos">) =>
  [...(l.listing_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order);

export type BrowseFilters = {
  kind: Kind;
  brand?: string | undefined;
  region?: string | undefined;
  maxPrice?: number | undefined;
  q?: string | undefined;
};

// Public browse: approved listings only (RLS enforces it too).
export function useBrowse(f: BrowseFilters) {
  return useQuery({
    queryKey: ["browse", f],
    queryFn: async () => {
      let q = supabase
        .from("listings")
        .select(LISTING_SELECT)
        .eq("status", "approved")
        .eq("kind", f.kind)
        .order("approved_at", { ascending: false })
        .limit(60);
      if (f.brand) q = q.eq("brand", f.brand);
      if (f.region) q = q.eq("region", f.region);
      if (f.maxPrice && f.kind === "sell") q = q.lte("price", f.maxPrice);
      const text = f.q?.trim().replace(/[%,()]/g, " ");
      if (text) q = q.or(`title.ilike.%${text}%,model.ilike.%${text}%,description.ilike.%${text}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ListingFull[];
    },
  });
}

export function useListing(id: string | undefined) {
  return useQuery({
    queryKey: ["listing", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(LISTING_SELECT)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ListingFull | null;
    },
  });
}

// The other side of the market that fits this listing: for a buyer's request,
// approved cars of the same brand within budget; for a dealer's car, approved
// requests of the same brand whose budget covers the price.
export function useMatches(l: Listing | null | undefined) {
  return useQuery({
    queryKey: ["matches", l?.id, l?.updated_at],
    enabled: !!l,
    queryFn: async () => {
      const listing = l!;
      let q = supabase
        .from("listings")
        .select(LISTING_SELECT)
        .eq("status", "approved")
        .eq("brand", listing.brand)
        .neq("owner_id", listing.owner_id)
        .order("approved_at", { ascending: false })
        .limit(12);
      if (listing.kind === "want") {
        q = q.eq("kind", "sell");
        if (listing.budget_max) q = q.lte("price", listing.budget_max);
        if (listing.budget_min) q = q.gte("price", Math.floor(listing.budget_min * 0.9));
      } else {
        q = q.eq("kind", "want");
        if (listing.price) q = q.gte("budget_max", listing.price);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ListingFull[];
    },
  });
}
