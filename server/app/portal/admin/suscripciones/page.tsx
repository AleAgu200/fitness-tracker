"use client";

import { useEffect, useState } from "react";

import {
  AdminHeader,
  EmptyState,
  ErrorBanner,
  formatDate,
  inputClass,
  Pager,
  Pill,
  relativeTime,
  SegmentedFilter,
  SUBSCRIPTION_LABEL,
  subscriptionTone,
  useAdminData,
  useDebounced,
} from "../ui";

interface Subscription {
  userId: string;
  name: string;
  email: string;
  status: string;
  productId: string | null;
  store: string | null;
  isSandbox: boolean;
  currentPeriodEndsAt: number | null;
  willRenew: boolean;
  updatedAt: number;
}

type Filter = "all" | "entitled" | "billing_issue" | "cancelled" | "expired";

const STORE_LABEL: Record<string, string> = { APP_STORE: "App Store", PLAY_STORE: "Google Play", STRIPE: "Stripe", PROMOTIONAL: "Promocional" };

export default function AdminSubscriptionsPage() {
  const [filter, setFilter] = useState<Filter>("entitled");
  const [q, setQ] = useState("");
  const [sandbox, setSandbox] = useState(false);
  const [page, setPage] = useState(1);
  const query = useDebounced(q);
  useEffect(() => { setPage(1); }, [filter, query, sandbox]);

  const params = new URLSearchParams({ status: filter, q: query, page: String(page), ...(sandbox ? { sandbox: "1" } : {}) });
  const { data, error, reload } = useAdminData<{ subscriptions: Subscription[]; total: number; page: number; pageCount: number }>(`/api/admin/subscriptions?${params}`);
  const now = Date.now();

  return (
    <div>
      <AdminHeader
        eyebrow="SUSCRIPCIONES"
        title="PULSO Plus"
        description="Estado según los avisos de RevenueCat. Reembolsos y cambios de plan se gestionan en la tienda o en RevenueCat; aquí se ve el resultado."
      />
      <div className="space-y-4 px-5 py-6 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <input type="search" value={q} onChange={event => setQ(event.target.value)} placeholder="Nombre o correo…" aria-label="Buscar suscripciones" className={`${inputClass} max-w-sm`} />
          <SegmentedFilter label="Estado" value={filter} onChange={setFilter} options={[
            { value: "entitled", label: "CON ACCESO" },
            { value: "billing_issue", label: "PROBLEMA DE COBRO" },
            { value: "cancelled", label: "NO RENOVARÁN" },
            { value: "expired", label: "VENCIDAS" },
            { value: "all", label: "TODAS" },
          ]} />
          <label className="flex cursor-pointer items-center gap-2 font-mono-app text-[10px] tracking-[1px] text-fg-sec">
            <input type="checkbox" checked={sandbox} onChange={event => setSandbox(event.target.checked)} className="accent-[#3ddcff]" />
            INCLUIR SANDBOX
          </label>
        </div>

        {error && <ErrorBanner message={error} onRetry={reload} />}
        {data && <div className="font-mono-app text-[10px] text-fg-ter">{data.total} {data.total === 1 ? "SUSCRIPCIÓN" : "SUSCRIPCIONES"}</div>}
        {data && data.subscriptions.length === 0 ? (
          <EmptyState title="Nada en este filtro" />
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line font-mono-app text-[9.5px] tracking-[1.2px] text-fg-ter">
                <tr>
                  <th className="px-4 py-2.5 font-normal">CUENTA</th>
                  <th className="px-4 py-2.5 font-normal">ESTADO</th>
                  <th className="px-4 py-2.5 font-normal">PRODUCTO</th>
                  <th className="px-4 py-2.5 font-normal">PERÍODO</th>
                  <th className="px-4 py-2.5 font-normal">ÚLTIMO AVISO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data?.subscriptions.map(sub => {
                  const endsSoon = sub.currentPeriodEndsAt != null && sub.currentPeriodEndsAt - now < 3 * 86_400_000 && sub.currentPeriodEndsAt > now;
                  return (
                    <tr key={sub.userId}>
                      <td className="px-4 py-2.5">
                        <span className="block text-fg">{sub.name}</span>
                        <span className="block font-mono-app text-[10.5px] text-fg-sec">{sub.email}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex flex-wrap gap-1">
                          <Pill tone={subscriptionTone(sub.status)}>{(SUBSCRIPTION_LABEL[sub.status] ?? sub.status).toUpperCase()}</Pill>
                          {sub.isSandbox && <Pill>SANDBOX</Pill>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-fg-mid">
                        {sub.productId ?? "—"}
                        <span className="block text-xs text-fg-sec">{sub.store ? STORE_LABEL[sub.store] ?? sub.store : ""}</span>
                      </td>
                      <td className={`px-4 py-2.5 ${endsSoon ? "text-warn" : "text-fg-sec"}`}>
                        {sub.currentPeriodEndsAt ? `${sub.willRenew ? "Renueva" : "Termina"} ${formatDate(sub.currentPeriodEndsAt)}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-fg-sec">{relativeTime(sub.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pageCount={data.pageCount} onPage={setPage} />}
      </div>
    </div>
  );
}
