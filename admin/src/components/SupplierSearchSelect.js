import { useEffect, useRef, useState } from "react";
import API from "../api"; // AJUSTA ESTA RUTA si tu componente está en otra carpeta

export default function SupplierSearchSelect({
  valueId,
  valueLabel,
  onSelect,
  disabled = false,
  placeholder = "Buscar proveedor en GIAV...",
}) {
  const [q, setQ] = useState(valueLabel || "");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const timer = useRef(null);

  // Mantener el input sincronizado si viene precargado
  useEffect(() => {
    if (valueLabel && valueLabel !== q) setQ(valueLabel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueLabel]);

  const fetchSuppliers = async (term) => {
    const t = (term || "").trim();
    if (t.length < 2) {
      setItems([]);
      setErr("");
      setOpen(false);
      return;
    }

    setLoading(true);
    setErr("");

    try {
      // Usamos tu wrapper (nonce, middlewares, etc.)
      const res = await API.searchGiavProviders({
        q: t,
        pageSize: 20,
        pageIndex: 0,
        includeDisabled: false,
      });

      // Acepta array directo o {items:[]}
      const list = Array.isArray(res)
        ? res
        : Array.isArray(res?.items)
          ? res.items
          : [];

      const normalized = list
        .map((x) => ({
          id: String(x.id ?? x.Id ?? x.ID ?? x.proveedorId ?? ""),
          label: String(x.label ?? x.NombreAlias ?? x.Nombre ?? x.title ?? ""),
        }))
        .filter((x) => x.id && x.label);

      setItems(normalized);
      setOpen(normalized.length > 0);
    } catch (e) {
      setErr(e?.message || "Error buscando proveedores en GIAV");
      setItems([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const onChange = (v) => {
    setQ(v);
    setOpen(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fetchSuppliers(v), 250);
  };

  const pick = (it) => {
    setQ(it.label);
    setOpen(false);
    setItems([]);
    setErr("");
    onSelect?.(it); // {id,label}
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          // si ya hay items, abre
          if (items.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        style={{ width: "100%" }}
      />

      <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
        {valueId ? (
          <>
            ID seleccionado: <strong>{valueId}</strong>
          </>
        ) : null}
        {loading ? <span style={{ marginLeft: 10 }}>Buscando…</span> : null}
        {err ? (
          <span style={{ marginLeft: 10, color: "crimson" }}>{err}</span>
        ) : null}
      </div>

      {open && items.length > 0 && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: "100%",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #ddd",
            borderTop: "none",
            maxHeight: 260,
            overflow: "auto",
          }}
        >
          {items.map((it) => (
            <div
              key={it.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(it);
              }}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              <div style={{ fontWeight: 600 }}>{it.label}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>ID: {it.id}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

