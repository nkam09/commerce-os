"use client";

import { useState } from "react";
import { Button } from "@/components/shared/button";
import type { RestockProfileRow } from "@/lib/services/restock-service";

type Props = {
  profiles: RestockProfileRow[];
};

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/20";
const labelCls = "block text-xs text-muted-foreground mb-1";

type FormState = {
  name: string;
  manufacturingDays: number;
  usePrepCenter: boolean;
  shippingToPrepDays: number;
  shippingToFbaDays: number;
  fbaBufferDays: number;
  targetStockRangeDays: number;
};

const emptyForm: FormState = {
  name: "",
  manufacturingDays: 30,
  usePrepCenter: false,
  shippingToPrepDays: 0,
  shippingToFbaDays: 35,
  fbaBufferDays: 10,
  targetStockRangeDays: 60,
};

export function RestockProfilesTab({ profiles: initialProfiles }: Props) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  function handleEdit(p: RestockProfileRow) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      manufacturingDays: p.manufacturingDays,
      usePrepCenter: p.usePrepCenter,
      shippingToPrepDays: p.shippingToPrepDays,
      shippingToFbaDays: p.shippingToFbaDays,
      fbaBufferDays: p.fbaBufferDays,
      targetStockRangeDays: p.targetStockRangeDays,
    });
    setShowForm(true);
  }

  function handleDelete(id: string) {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }

  function handleSave() {
    if (editingId) {
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === editingId ? { ...p, ...form } : p
        )
      );
    } else {
      setProfiles((prev) => [
        ...prev,
        { id: `prof-${Date.now()}`, ...form },
      ]);
    }
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  return (
    <div className="space-y-4">
      {/* Profile list */}
      <div className="space-y-2">
        {profiles.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-border bg-card p-4 hover:bg-elevated/20 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground">{p.name}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                  <span className="text-2xs text-muted-foreground">
                    Manufacturing:{" "}
                    <span className="text-foreground tabular-nums">{p.manufacturingDays}d</span>
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    Prep Center:{" "}
                    <span className="text-foreground">{p.usePrepCenter ? "Yes" : "No"}</span>
                  </span>
                  {p.usePrepCenter && (
                    <span className="text-2xs text-muted-foreground">
                      Ship to Prep:{" "}
                      <span className="text-foreground tabular-nums">{p.shippingToPrepDays}d</span>
                    </span>
                  )}
                  <span className="text-2xs text-muted-foreground">
                    Ship to FBA:{" "}
                    <span className="text-foreground tabular-nums">{p.shippingToFbaDays}d</span>
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    Buffer:{" "}
                    <span className="text-foreground tabular-nums">{p.fbaBufferDays}d</span>
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    Target Range:{" "}
                    <span className="text-foreground tabular-nums">{p.targetStockRangeDays}d</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleEdit(p)}
                  className="rounded-md px-2 py-1 text-2xs text-muted-foreground hover:text-foreground hover:bg-elevated transition"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="rounded-md px-2 py-1 text-2xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit form */}
      {showForm ? (
        <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">
            {editingId ? "Edit Profile" : "New Profile"}
          </p>
          <div>
            <label className={labelCls}>Profile name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
              placeholder="e.g. Standard Sea Freight"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Manufacturing (days)</label>
              <input
                type="number"
                value={form.manufacturingDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, manufacturingDays: Number(e.target.value) }))
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Ship to FBA (days)</label>
              <input
                type="number"
                value={form.shippingToFbaDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shippingToFbaDays: Number(e.target.value) }))
                }
                className={inputCls}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={form.usePrepCenter}
              onChange={(e) =>
                setForm((f) => ({ ...f, usePrepCenter: e.target.checked }))
              }
              className="rounded border-border"
            />
            Uses Prep Center
          </label>

          {form.usePrepCenter && (
            <div>
              <label className={labelCls}>Ship to Prep Center (days)</label>
              <input
                type="number"
                value={form.shippingToPrepDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shippingToPrepDays: Number(e.target.value) }))
                }
                className={inputCls}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>FBA Buffer (days)</label>
              <input
                type="number"
                value={form.fbaBufferDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fbaBufferDays: Number(e.target.value) }))
                }
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Target stock range (days)</label>
              <input
                type="number"
                value={form.targetStockRangeDays}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    targetStockRangeDays: Number(e.target.value),
                  }))
                }
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!form.name.trim()}>
              {editingId ? "Update Profile" : "Create Profile"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          onClick={() => {
            setEditingId(null);
            setForm(emptyForm);
            setShowForm(true);
          }}
        >
          + Add Profile
        </Button>
      )}
    </div>
  );
}
