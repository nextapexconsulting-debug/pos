"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import NavLinks from "@/components/NavLinks";
import {
  Product,
  loadProducts,
  fetchShopProducts,
  upsertShopProduct,
  deleteShopProduct,
  saveShopProducts,
  makeProductId,
  makeKeywords,
  DEFAULT_PRODUCTS,
} from "@/lib/products";

export default function MenuPage() {
  return (
    <AuthGate roles={["owner", "staff"]}>
      <MenuManager />
    </AuthGate>
  );
}

function MenuManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    nameEn: "",
    nameGu: "",
    price: "",
    keywords: "",
  });
  const [inlineEdit, setInlineEdit] = useState<{
    id: string;
    nameEn: string;
    nameGu: string;
    price: string;
    keywords: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await fetchShopProducts();
      setProducts(list);
    } catch (e: any) {
      setProducts(loadProducts());
      showMsg(e?.message || "Could not load menu from server (showing cache)");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setProducts(loadProducts());
    reload();
  }, []);

  const showMsg = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 3000);
  };

  const resetForm = () => {
    setForm({ nameEn: "", nameGu: "", price: "", keywords: "" });
  };

  const handleSave = async () => {
    const nameEn = form.nameEn.trim();
    const nameGu = form.nameGu.trim();
    const price = parseFloat(form.price);

    if (!nameEn || !nameGu || isNaN(price) || price < 0) {
      showMsg("Please fill English name, Gujarati name and valid price");
      return;
    }

    let keywords: string[];
    if (form.keywords.trim()) {
      keywords = form.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    } else {
      keywords = makeKeywords(nameEn, nameGu);
    }

    const id = makeProductId(nameEn);
    const finalId = products.some((p) => p.id === id) ? `${id}-${Date.now()}` : id;
    const newProduct: Product = { id: finalId, nameEn, nameGu, price, keywords };

    setBusy(true);
    try {
      await upsertShopProduct(newProduct);
      setProducts((prev) => [...prev, newProduct]);
      showMsg("Product added (saved to shop menu)");
      resetForm();
    } catch (e: any) {
      showMsg(`❌ ${e.message || "Save failed"}`);
    } finally {
      setBusy(false);
    }
  };

  const startInlineEdit = (product: Product) => {
    setInlineEdit({
      id: product.id,
      nameEn: product.nameEn,
      nameGu: product.nameGu,
      price: String(product.price),
      keywords: product.keywords.join(", "),
    });
  };

  const cancelInlineEdit = () => setInlineEdit(null);

  const saveInlineEdit = async () => {
    if (!inlineEdit) return;
    const nameEn = inlineEdit.nameEn.trim();
    const nameGu = inlineEdit.nameGu.trim();
    const price = parseFloat(inlineEdit.price);
    if (!nameEn || !nameGu || isNaN(price) || price < 0) {
      showMsg("Fill valid name and price");
      return;
    }
    let keywords: string[];
    if (inlineEdit.keywords.trim()) {
      keywords = inlineEdit.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    } else {
      keywords = makeKeywords(nameEn, nameGu);
    }
    const updated: Product = {
      id: inlineEdit.id,
      nameEn,
      nameGu,
      price,
      keywords,
    };
    setBusy(true);
    try {
      await upsertShopProduct(updated);
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setInlineEdit(null);
      showMsg("Saved to shop menu");
    } catch (e: any) {
      showMsg(`❌ ${e.message || "Save failed"}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product from shop menu?")) return;
    setBusy(true);
    try {
      await deleteShopProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      showMsg("Product deleted");
      if (inlineEdit?.id === id) setInlineEdit(null);
    } catch (e: any) {
      showMsg(`❌ ${e.message || "Delete failed"}`);
    } finally {
      setBusy(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!confirm("Reset shop menu to default items? Custom items will be removed for this shop.")) return;
    setBusy(true);
    try {
      await saveShopProducts(DEFAULT_PRODUCTS);
      setProducts(DEFAULT_PRODUCTS);
      showMsg("Reset to default menu (saved for this shop)");
      resetForm();
      setInlineEdit(null);
    } catch (e: any) {
      showMsg(`❌ ${e.message || "Reset failed"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="bg-orange-500 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-md">
        <div>
          <h1 className="text-xl font-bold">Add / Edit Product</h1>
          <p className="text-xs text-orange-100">Products for this shop</p>
        </div>
        <div className="flex items-center gap-2">
          <NavLinks />
          
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        <Link
          href="/menu/import"
          className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-3 font-semibold"
        >
          📷 Upload menu photo (add or replace all items)
        </Link>
        {message && (
          <div className="bg-orange-50 border border-orange-300 text-orange-800 px-4 py-2 rounded-lg text-sm">
            {message}
          </div>
        )}
        {loading && (
          <p className="text-sm text-slate-400 text-center">Loading shop menu…</p>
        )}

        <section className="bg-white rounded-2xl p-5 border border-orange-200 space-y-4 shadow-sm">
          <h2 className="font-semibold text-lg text-slate-800">Add New Product</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">English Name *</label>
              <input
                type="text"
                value={form.nameEn}
                onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                placeholder="e.g. Butter Slice"
                className="w-full bg-white border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Gujarati Name *</label>
              <input
                type="text"
                value={form.nameGu}
                onChange={(e) => setForm((f) => ({ ...f, nameGu: e.target.value }))}
                placeholder="e.g. બટર સ્લાઇસ"
                className="w-full bg-white border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Price (₹) *</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="e.g. 30"
                className="w-full bg-white border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Keywords (optional)</label>
              <input
                type="text"
                value={form.keywords}
                onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
                placeholder="Auto-generated if empty"
                className="w-full bg-white border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={busy}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium text-sm"
          >
            {busy ? "Saving…" : "Add Product"}
          </button>
        </section>

        <section className="bg-white rounded-2xl border border-orange-200 overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-orange-100 flex items-center justify-between bg-orange-50">
            <h2 className="font-semibold text-slate-800">
              Shop Menu ({products.length} items)
            </h2>
            <button
              onClick={handleResetDefaults}
              disabled={busy}
              className="text-xs text-red-500 hover:text-red-600"
            >
              Reset to Defaults
            </button>
          </div>

          {products.length === 0 && !loading ? (
            <p className="p-6 text-slate-400 text-center">No products yet</p>
          ) : (
            <ul className="divide-y divide-orange-100">
              {products.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  {inlineEdit?.id === p.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="bg-white border border-orange-300 rounded-lg px-2 py-1.5 text-sm"
                          value={inlineEdit.nameEn}
                          onChange={(e) => setInlineEdit({ ...inlineEdit, nameEn: e.target.value })}
                          placeholder="English"
                        />
                        <input
                          className="bg-white border border-orange-300 rounded-lg px-2 py-1.5 text-sm"
                          value={inlineEdit.nameGu}
                          onChange={(e) => setInlineEdit({ ...inlineEdit, nameGu: e.target.value })}
                          placeholder="Gujarati"
                        />
                        <input
                          type="number"
                          className="bg-white border border-orange-300 rounded-lg px-2 py-1.5 text-sm"
                          value={inlineEdit.price}
                          onChange={(e) => setInlineEdit({ ...inlineEdit, price: e.target.value })}
                          placeholder="Price"
                        />
                        <input
                          className="bg-white border border-orange-300 rounded-lg px-2 py-1.5 text-sm"
                          value={inlineEdit.keywords}
                          onChange={(e) => setInlineEdit({ ...inlineEdit, keywords: e.target.value })}
                          placeholder="Keywords"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveInlineEdit}
                          disabled={busy}
                          className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-4 py-1.5 rounded-lg"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelInlineEdit}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs px-4 py-1.5 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-slate-800">{p.nameEn}</div>
                        <div className="text-xs text-slate-500 truncate">{p.nameGu}</div>
                        <div className="text-xs text-slate-400 mt-0.5 truncate">
                          Keywords: {p.keywords.join(", ")}
                        </div>
                      </div>
                      <div className="text-orange-600 font-bold text-sm shrink-0">₹{p.price}</div>
                      <button
                        onClick={() => startInlineEdit(p)}
                        className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 px-3 py-1.5 rounded-lg shrink-0"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-xs text-red-500 hover:text-red-600 shrink-0"
                      >
                        Del
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
