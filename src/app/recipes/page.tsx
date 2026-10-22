"use client";

import { useCallback, useEffect, useState } from "react";
import PageShell, { card, input, btn, btn2 } from "@/components/PageShell";
import { supabase, todayIST } from "@/lib/supabase";

type Product = { id: string; nameEn: string };
type Inv = { id: string; name: string; unit: string; pack_size: number | null };
type Recipe = {
  id: string;
  product_code: string;
  item_id: string;
  item_name: string;
  item_unit: string;
  pack_size: number | null;
  qty_per_sale: number;
};
type CheckRow = {
  item_name: string;
  unit: string;
  pack_size: number | null;
  theoretical_qty: number;
  stock_used: number | null;
  difference: number | null;
  packs_theo: number | null;
  packs_used: number | null;
  note: string;
};

export default function RecipesPage() {
  return (
    <PageShell title="Item recipes" roles={["owner", "staff"]}>
      <Body />
    </PageShell>
  );
}

function Body() {
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<Inv[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [code, setCode] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("2");
  const [msg, setMsg] = useState("");
  const [day, setDay] = useState(todayIST());
  const [check, setCheck] = useState<CheckRow[]>([]);
  const [packItem, setPackItem] = useState("");
  const [packSize, setPackSize] = useState("16");

  const load = useCallback(async () => {
    const [{ data: menu }, { data: inv }, { data: rec }] = await Promise.all([
      supabase.rpc("list_menu_products"),
      supabase.from("inventory_items").select("id,name,unit,pack_size").eq("active", true).order("name"),
      supabase.rpc("list_product_recipes", { p_code: null }),
    ]);
    let list: any[] = [];
    if (Array.isArray(menu)) list = menu;
    else if (menu) list = menu as any;
    setProducts(
      list.map((p) => ({
        id: String(p.id || p.product_code || ""),
        nameEn: String(p.nameEn || p.name_en || ""),
      })).filter((p) => p.id)
    );
    setItems((inv as Inv[]) || []);
    setRecipes((rec as Recipe[]) || []);
    if (list[0] && !code) setCode(String(list[0].id || list[0].product_code));
    if (inv?.[0] && !itemId) setItemId(inv[0].id);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addRecipe = async () => {
    if (!code || !itemId || !(Number(qty) > 0)) return;
    setMsg("");
    const { error } = await supabase.rpc("upsert_product_recipe", {
      p_code: code,
      p_item_id: itemId,
      p_qty: Number(qty),
    });
    if (error) setMsg(error.message);
    else {
      setMsg("Saved");
      load();
    }
  };

  const del = async (id: string) => {
    if (!confirm("Remove this ingredient line?")) return;
    await supabase.rpc("delete_product_recipe", { p_id: id });
    load();
  };

  const savePack = async () => {
    if (!packItem) return;
    const { error } = await supabase.rpc("set_item_pack_size", {
      p_item: packItem,
      p_pack: Number(packSize) || 0,
    });
    setMsg(error ? error.message : "Pack size saved");
    load();
  };

  const runCheck = async () => {
    const { data, error } = await supabase.rpc("report_usage_check", { p_day: day });
    if (error) setMsg(error.message);
    else {
      setCheck((data as CheckRow[]) || []);
      setMsg("");
    }
  };

  const byProduct = recipes.reduce<Record<string, Recipe[]>>((acc, r) => {
    (acc[r.product_code] = acc[r.product_code] || []).push(r);
    return acc;
  }, {});

  return (
    <>
      <p className="text-sm text-slate-600">
        Example: <b>Veg Sandwich</b> uses <b>2 bread</b> slices. One pack = <b>16</b> slices.
        Day check compares recipe use from sales vs stock used.
      </p>

      <div className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">1) Pack size (optional)</h2>
        <p className="text-xs text-slate-500">Pieces in one packet — only for “≈ packs” on the check.</p>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-slate-500">Stock item</label>
            <select className={input} value={packItem} onChange={(e) => setPackItem(e.target.value)}>
              <option value="">Select…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} {i.pack_size ? `(pack ${i.pack_size})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="w-28">
            <label className="text-xs text-slate-500">Pieces / pack</label>
            <input className={input} type="number" min="1" step="1" value={packSize} onChange={(e) => setPackSize(e.target.value)} />
          </div>
          <button type="button" className={btn2} onClick={savePack}>
            Save pack
          </button>
        </div>
      </div>

      <div className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">2) Recipe per menu item</h2>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-slate-500">Menu product</label>
            <select className={input} value={code} onChange={(e) => setCode(e.target.value)}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameEn}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-slate-500">Uses stock</label>
            <select className={input} value={itemId} onChange={(e) => setItemId(e.target.value)}>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="text-xs text-slate-500">Qty each</label>
            <input className={input} type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <button type="button" className={btn} onClick={addRecipe}>
            Add / update
          </button>
        </div>
        
        <button
          type="button"
          className={btn2 + " w-full sm:w-auto"}
          onClick={async () => {
            if (!itemId) {
              setMsg("Select stock item (Bread) first");
              return;
            }
            const targets = products.filter((p) => {
              const name = p.nameEn.toLowerCase();
              return name.includes("sandwich");
            });
            // We need prices — fetch from menu rpc detail
            const { data: menu } = await supabase.rpc("list_menu_products");
            const list = (Array.isArray(menu) ? menu : []) as any[];
            const at100 = list.filter((x) => {
              const n = String(x.nameEn || x.name_en || "").toLowerCase();
              return Number(x.price) >= 100 && n.includes("sandwich");
            });
            if (!at100.length) {
              setMsg("No sandwiches with price ≥ ₹100 found");
              return;
            }
            if (!confirm(`Set ${at100.length} sandwich(es) with price ≥ ₹100 → 3 × selected stock each?`)) return;
            let ok = 0;
            for (const x of at100) {
              const code = x.id || x.product_code;
              const { error } = await supabase.rpc("upsert_product_recipe", {
                p_code: code,
                p_item_id: itemId,
                p_qty: 3,
              });
              if (!error) ok++;
            }
            setMsg(`Updated ${ok} products: sandwich ≥ ₹100 → 3 slices`);
            load();
          }}
        >
          Apply: sandwiches ≥ ₹100 → 3 of selected stock
        </button>
        {msg && <p className="text-xs text-slate-600">{msg}</p>}
      </div>

      <div className={`${card} space-y-3`}>
        <h2 className="font-semibold text-sm">Current recipes</h2>
        {Object.keys(byProduct).length === 0 && (
          <p className="text-xs text-slate-400">None yet — add bread / cheese / butter per product above.</p>
        )}
        {Object.entries(byProduct).map(([pc, lines]) => {
          const pname = products.find((p) => p.id === pc)?.nameEn || pc;
          return (
            <div key={pc} className="border border-orange-100 rounded-lg p-2">
              <div className="font-medium text-sm mb-1">{pname}</div>
              <ul className="text-xs space-y-1">
                {lines.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="flex-1">
                      {r.qty_per_sale} × {r.item_name}
                      <span className="text-slate-400"> ({r.item_unit})</span>
                    </span>
                    <button type="button" className="text-red-500" onClick={() => del(r.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className={`${card} space-y-2`}>
        <h2 className="font-semibold text-sm">3) Day check — recipes vs stock used</h2>
        <p className="text-xs text-slate-500">Save closing stock on Stock page first.</p>
        <div className="flex gap-2 items-center flex-wrap">
          <input type="date" className={input + " !w-auto"} value={day} onChange={(e) => setDay(e.target.value)} />
          <button type="button" className={btn2} onClick={runCheck}>
            Run check
          </button>
        </div>
        {check.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b">
                  <th className="text-left py-1">Item</th>
                  <th className="text-right">Recipe use</th>
                  <th className="text-right">Stock used</th>
                  <th className="text-right">Diff</th>
                  <th className="text-left">Note</th>
                </tr>
              </thead>
              <tbody>
                {check.map((r, i) => (
                  <tr key={i} className="border-b border-orange-50">
                    <td className="py-1.5">
                      {r.item_name}
                      {r.packs_theo != null && (
                        <span className="text-slate-400 block">
                          ≈ {r.packs_theo} packs theo
                          {r.packs_used != null ? ` / ${r.packs_used} used` : ""}
                        </span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{r.theoretical_qty}</td>
                    <td className="text-right tabular-nums">{r.stock_used ?? "—"}</td>
                    <td
                      className={`text-right tabular-nums font-semibold ${
                        r.difference == null
                          ? ""
                          : Math.abs(Number(r.difference)) <= 0.5
                            ? "text-emerald-600"
                            : "text-amber-600"
                      }`}
                    >
                      {r.difference ?? "—"}
                    </td>
                    <td className="text-slate-500">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
