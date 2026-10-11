"use client";

import * as React from "react";

import { AlertCircleIcon, CheckCircle2Icon, DownloadIcon, PlugZapIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { SSProject, SSTask } from "@/lib/types";

type SSStatus = {
  exists: boolean;
  configured: boolean;
  enabled: boolean;
  reachable: boolean;
  url?: string;
  tools: string[];
};

type Dimension = "project" | "task";

const ASSET_TYPES: { key: string; label: string }[] = [
  { key: "subdomain", label: "子域名" },
  { key: "service", label: "服务" },
  { key: "app", label: "App" },
];

export default function AssetSyncPage() {
  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="font-semibold text-xl">资产同步</h1>
        <p className="text-muted-foreground text-sm">从外部数据源同步资产入库</p>
      </div>
      <Tabs defaultValue="scopesentry">
        <TabsList>
          <TabsTrigger value="scopesentry">ScopeSentry</TabsTrigger>
          <TabsTrigger value="fofa">FOFA</TabsTrigger>
        </TabsList>
        <TabsContent value="scopesentry" className="mt-4">
          <ScopeSentryPanel />
        </TabsContent>
        <TabsContent value="fofa" className="mt-4">
          <FofaPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── FOFA 面板 ────────────────────────────────────────────────────────────────

type FofaConfig = Awaited<ReturnType<typeof api.fofaConfig>>;
type FofaPresetOption = { id: string; label: string; base_url: string; email: boolean };

function FofaPanel() {
  const [cfg, setCfg] = React.useState<FofaConfig | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .fofaConfig()
      .then(setCfg)
      .catch((e) => toast.error(`读取 FOFA 配置失败：${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <FofaConfigCard cfg={cfg} loading={loading} onChanged={load} />
      {cfg?.valid ? <FofaWorkbench /> : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            配置端点与 Key 后即可按 FOFA 查询语句导入资产（全程被动，不向目标发送流量）。
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FofaConfigCard({ cfg, loading, onChanged }: { cfg: FofaConfig | null; loading: boolean; onChanged: () => void }) {
  const [endpoint, setEndpoint] = React.useState("official");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [quota, setQuota] = React.useState<string | null>(null);

  const presets: FofaPresetOption[] = cfg?.presets ?? [];
  const current = presets.find((p) => p.id === endpoint);
  const needEmail = !!current?.email;

  React.useEffect(() => {
    if (!cfg) return;
    setEndpoint(cfg.endpoint || "official");
    setBaseUrl(cfg.base_url || "");
    setEmail(cfg.email || "");
  }, [cfg]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.fofaSaveConfig({
        endpoint,
        base_url: endpoint === "custom" ? baseUrl.trim() : undefined,
        email: needEmail ? email.trim() : undefined,
        api_key: apiKey.trim() || undefined,
      });
      toast.success(r.valid ? "已保存并生效" : "已保存（配置尚不完整）");
      setApiKey("");
      setQuota(null);
      onChanged();
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const checkQuota = async () => {
    setBusy(true);
    setQuota(null);
    try {
      const r = await api.fofaQuota();
      const row = r.info?.[0] ?? [];
      setQuota(
        row.length > 0
          ? row.map((v, i) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join("  |  ")
          : JSON.stringify(r.info),
      );
    } catch (e) {
      toast.error(`查询余额失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlugZapIcon className="size-4" /> FOFA 数据源
          {loading ? (
            <Badge variant="secondary">检测中…</Badge>
          ) : cfg?.valid ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">
              <CheckCircle2Icon className="mr-1 size-3" /> 已配置
            </Badge>
          ) : (
            <Badge variant="outline">未配置</Badge>
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onChanged} disabled={loading}>
          <RefreshCwIcon className={loading ? "size-4 animate-spin" : "size-4"} /> 刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>接口端点</Label>
            <select
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            >
              {(presets.length ? presets : [{ id: "official", label: "官方 fofa.info", base_url: "", email: true }]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {endpoint === "custom" && (
            <div className="space-y-1.5">
              <Label>Base URL（官方兼容代理地址）</Label>
              <Input placeholder="https://your-proxy.example.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
          )}
          {needEmail && (
            <div className="space-y-1.5">
              <Label>账号 Email（官方接口需要）</Label>
              <Input placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>API Key（留空保留原值{cfg?.key_set ? "，已设置" : ""}）</Label>
            <Input type="password" placeholder="FOFA Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={busy}>
            保存配置
          </Button>
          <Button variant="outline" onClick={checkQuota} disabled={busy || !cfg?.valid}>
            查询余额（免费）
          </Button>
          {quota && <span className="text-muted-foreground font-mono text-xs">{quota}</span>}
        </div>
        <p className="text-muted-foreground text-xs">
          查询走 FOFA 历史索引，全程不向目标发送流量。第三方代理按「1 次查询 + 返回条数」计费，预览（size=1）几乎不耗条数。
        </p>
      </CardContent>
    </Card>
  );
}

function FofaWorkbench() {
  const [query, setQuery] = React.useState(`domain="example.com"`);
  const [size, setSize] = React.useState(1000);
  const [companyName, setCompanyName] = React.useState("");
  const [createCompany, setCreateCompany] = React.useState(true);
  const [preview, setPreview] = React.useState<{ match_size: number; sample: unknown[][] } | null>(null);
  const [busy, setBusy] = React.useState<"none" | "preview" | "import">("none");
  const [result, setResult] = React.useState<Awaited<ReturnType<typeof api.fofaImport>> | null>(null);

  const doPreview = async () => {
    if (!query.trim()) return toast.error("请填写 FOFA 查询语句");
    setBusy("preview");
    setPreview(null);
    try {
      const r = await api.fofaPreview(query.trim());
      setPreview(r);
      const m = query.match(/domain="([^"]+)"/);
      if (m && !companyName) setCompanyName(m[1]);
      toast.success(`命中 ${r.match_size} 条`);
    } catch (e) {
      toast.error(`预览失败：${(e as Error).message}`);
    } finally {
      setBusy("none");
    }
  };

  const doImport = async () => {
    if (!query.trim()) return toast.error("请填写 FOFA 查询语句");
    setBusy("import");
    setResult(null);
    try {
      const r = await api.fofaImport({
        query: query.trim(),
        size,
        company_name: companyName.trim() || undefined,
        create_company: createCompany,
      });
      setResult(r);
      toast.success(`导入完成：${r.synced?.ip ?? 0} 个 IP / ${r.synced?.port ?? 0} 个端口`);
    } catch (e) {
      toast.error(`导入失败：${(e as Error).message}`);
    } finally {
      setBusy("none");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">FOFA 查询导入</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label>FOFA 查询语句</Label>
            <Input
              placeholder={'domain="example.com"'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doPreview()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>条数上限</Label>
            <select
              className="border-input bg-background h-9 w-32 rounded-md border px-3 text-sm"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              {[100, 500, 1000, 5000, 10000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>归属企业（空 = 从 domain 提取）</Label>
            <Input placeholder="如：乐天集团" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 pb-0.5">
            <label htmlFor="fofa-create-company" className="flex items-center gap-1.5 text-sm">
              <Checkbox
                id="fofa-create-company"
                checked={createCompany}
                onCheckedChange={(c) => setCreateCompany(!!c)}
              />
              企业不存在时创建并写入资产范围
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={doPreview} disabled={busy !== "none"}>
            <SearchIcon className={busy === "preview" ? "size-4 animate-pulse" : "size-4"} /> 预览命中（几乎不耗配额）
          </Button>
          <Button onClick={doImport} disabled={busy !== "none"}>
            <DownloadIcon className={busy === "import" ? "size-4 animate-pulse" : "size-4"} /> 导入资产
          </Button>
        </div>
        {preview && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            <p>
              命中总数 <b>{preview.match_size}</b> 条
              {preview.match_size > size && <span className="text-amber-600 dark:text-amber-500">（超过条数上限，导入将截断前 {size} 条）</span>}
            </p>
            {preview.sample?.length > 0 && (
              <pre className="text-muted-foreground overflow-x-auto font-mono text-xs">
                {JSON.stringify(preview.sample[0])}
              </pre>
            )}
          </div>
        )}
        {result && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex flex-wrap gap-3">
              {Object.entries(result.synced ?? {}).map(([k, v]) => (
                <Badge key={k} variant="secondary">
                  {k === "ip" ? "IP" : k === "port" ? "端口" : k}: {v}
                </Badge>
              ))}
            </div>
            {result.companies && result.companies.length > 0 && (
              <p className="text-muted-foreground">新建/更新企业：{result.companies.join("、")}</p>
            )}
            {result.warnings?.map((wm) => (
              <p key={wm} className="text-muted-foreground text-xs">
                {wm}
              </p>
            ))}
            {result.errors && result.errors.length > 0 && (
              <ul className="list-inside list-disc text-destructive">
                {result.errors.slice(0, 10).map((em) => (
                  <li key={em}>{em}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScopeSentryPanel() {
  const [status, setStatus] = React.useState<SSStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = React.useState(true);

  const loadStatus = React.useCallback(() => {
    setLoadingStatus(true);
    api
      .ssStatus()
      .then(setStatus)
      .catch((e) => toast.error(`读取数据源状态失败：${e.message}`))
      .finally(() => setLoadingStatus(false));
  }, []);

  React.useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const ready = !!status && status.exists && status.configured && status.enabled;

  return (
    <div className="space-y-4">
      <DataSourceCard status={status} loading={loadingStatus} onChanged={loadStatus} />
      {ready ? (
        <SyncWorkbench />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            数据源就绪后即可选择项目 / 任务进行同步。
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── 数据源状态卡 ─────────────────────────────────────────────────────────────

function DataSourceCard({
  status,
  loading,
  onChanged,
}: {
  status: SSStatus | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const [url, setUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (status?.url) setUrl(status.url);
  }, [status?.url]);

  const create = async () => {
    setBusy(true);
    try {
      await api.ssDatasource({});
      toast.success("已创建 ScopeSentry 数据源，请填写地址与密钥");
      onChanged();
    } catch (e) {
      toast.error(`创建失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!url.trim()) return toast.error("请填写 MCP 地址");
    setBusy(true);
    try {
      const r = await api.ssDatasource({ url: url.trim(), api_key: apiKey.trim() });
      toast.success(r.enabled ? "已保存并启用数据源" : "已保存（尚未满足启用条件）");
      setApiKey("");
      onChanged();
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlugZapIcon className="size-4" /> 数据源状态
          <StatusBadge status={status} loading={loading} />
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onChanged} disabled={loading}>
          <RefreshCwIcon className={loading ? "size-4 animate-spin" : "size-4"} /> 刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!status?.exists ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              尚未创建 ScopeSentry 数据源。创建后会新增一个占位 MCP（地址/密钥为空、未启用）。
            </p>
            <Button onClick={create} disabled={busy}>
              创建数据源
            </Button>
          </div>
        ) : (
          <>
            {!status.configured && (
              <p className="text-amber-600 text-sm dark:text-amber-500">
                数据源已创建但未配置，请填写 MCP 地址与 API Key 后启用。
              </p>
            )}
            {status.configured && !status.enabled && (
              <p className="text-amber-600 text-sm dark:text-amber-500">数据源已配置但未启用，保存后将自动启用。</p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>MCP 地址</Label>
                <Input placeholder="http://<主机>:8082/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>API Key（X-API-Key，留空保留原值）</Label>
                <Input
                  type="password"
                  placeholder="ssk_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={busy}>
                保存并启用
              </Button>
              {status.enabled && status.tools.length > 0 && (
                <span className="text-muted-foreground text-xs">已发现 {status.tools.length} 个工具</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, loading }: { status: SSStatus | null; loading: boolean }) {
  if (loading || !status) return <Badge variant="secondary">检测中…</Badge>;
  if (!status.exists) return <Badge variant="destructive">未创建</Badge>;
  if (!status.configured) return <Badge variant="outline">未配置</Badge>;
  if (!status.enabled) return <Badge variant="outline">未启用</Badge>;
  if (status.reachable)
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2Icon className="mr-1 size-3" /> 已连接
      </Badge>
    );
  return (
    <Badge variant="destructive">
      <AlertCircleIcon className="mr-1 size-3" /> 不可达
    </Badge>
  );
}

// ── 同步工作区（项目 / 任务维度）────────────────────────────────────────────────

function SyncWorkbench() {
  const [dimension, setDimension] = React.useState<Dimension>("project");
  const [assetTypes, setAssetTypes] = React.useState<Record<string, boolean>>({
    subdomain: true,
    service: true,
    app: true,
  });
  const [createCompany, setCreateCompany] = React.useState(true);

  const [projects, setProjects] = React.useState<SSProject[]>([]);
  const [tasks, setTasks] = React.useState<SSTask[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const [syncing, setSyncing] = React.useState(false);
  const [result, setResult] = React.useState<Awaited<ReturnType<typeof api.ssSync>> | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setSelected(new Set());
    const fn =
      dimension === "project"
        ? api.ssProjects(page, 50, search).then((r) => setProjects(r.projects))
        : api.ssTasks(page, 50, search).then(setTasks);
    fn.catch((e) => toast.error(`加载列表失败：${e.message}`)).finally(() => setLoading(false));
  }, [dimension, page, search]);

  React.useEffect(() => {
    load();
  }, [load]);

  const rows = dimension === "project" ? projects : tasks;
  const idOf = (row: SSProject | SSTask) => (dimension === "project" ? (row as SSProject).id : (row as SSTask).name);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map(idOf))));
  };

  const chosenTypes = ASSET_TYPES.filter((t) => assetTypes[t.key]).map((t) => t.key);

  const runSync = async () => {
    if (selected.size === 0) return toast.error(`请至少选择一个${dimension === "project" ? "项目" : "任务"}`);
    if (chosenTypes.length === 0) return toast.error("请至少选择一种资产类型");
    setSyncing(true);
    setResult(null);
    try {
      const r = await api.ssSync({
        dimension,
        targets: [...selected],
        asset_types: chosenTypes,
        create_company: dimension === "project" ? createCompany : false,
      });
      setResult(r);
      const total = Object.values(r.synced ?? {}).reduce((a, b) => a + b, 0);
      toast.success(`同步完成，共入库 ${total} 条资产`);
    } catch (e) {
      toast.error(`同步失败：${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const renderRows = () => {
    if (loading) {
      return (
        <TableRow>
          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground text-sm">
            加载中…
          </TableCell>
        </TableRow>
      );
    }
    if (rows.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground text-sm">
            无数据
          </TableCell>
        </TableRow>
      );
    }
    if (dimension === "project") {
      return projects.map((p) => (
        <TableRow key={p.id} className="cursor-pointer" onClick={() => toggle(p.id)}>
          <TableCell onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
          </TableCell>
          <TableCell className="font-medium">{p.name}</TableCell>
          <TableCell>{p.tag ? <Badge variant="secondary">{p.tag}</Badge> : "—"}</TableCell>
          <TableCell className="text-right">{p.AssetCount ?? 0}</TableCell>
        </TableRow>
      ));
    }
    return tasks.map((t) => (
      <TableRow key={t.id} className="cursor-pointer" onClick={() => toggle(t.name)}>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected.has(t.name)} onCheckedChange={() => toggle(t.name)} />
        </TableCell>
        <TableCell className="font-medium">{t.name}</TableCell>
        <TableCell>
          <Badge variant={t.progress === 100 ? "secondary" : "outline"}>
            {t.progress != null ? `${t.progress}%` : "—"}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-xs">{t.endTime || t.creatTime || "—"}</TableCell>
      </TableRow>
    ));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">选择数据同步</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 维度切换 */}
        <Tabs
          value={dimension}
          onValueChange={(v) => {
            setDimension(v as Dimension);
            setPage(1);
          }}
        >
          <TabsList>
            <TabsTrigger value="project">项目维度</TabsTrigger>
            <TabsTrigger value="task">任务维度</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 资产类型 + 选项 */}
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium text-sm">同步资产：</span>
          {ASSET_TYPES.map((t) => (
            <label key={t.key} htmlFor={`at-${t.key}`} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                id={`at-${t.key}`}
                checked={!!assetTypes[t.key]}
                onCheckedChange={(c) => setAssetTypes((prev) => ({ ...prev, [t.key]: !!c }))}
              />
              {t.label}
            </label>
          ))}
          {dimension === "project" && (
            <label htmlFor="create-company" className="flex items-center gap-1.5 text-sm">
              <Checkbox id="create-company" checked={createCompany} onCheckedChange={(c) => setCreateCompany(!!c)} />
              按项目建立企业并写入资产范围
            </label>
          )}
        </div>

        {/* 搜索 + 操作 */}
        <div className="flex items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <SearchIcon className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={dimension === "project" ? "搜索项目名" : "搜索任务名"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  load();
                }
              }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCwIcon className={loading ? "size-4 animate-spin" : "size-4"} />
          </Button>
          <div className="flex-1" />
          <span className="text-muted-foreground text-xs">已选 {selected.size}</span>
          <Button onClick={runSync} disabled={syncing || selected.size === 0}>
            <DownloadIcon className={syncing ? "size-4 animate-pulse" : "size-4"} /> 同步选中
          </Button>
        </div>

        {/* 列表 */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={rows.length > 0 && selected.size === rows.length} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>{dimension === "project" ? "项目名" : "任务名"}</TableHead>
                {dimension === "project" ? (
                  <>
                    <TableHead>标签</TableHead>
                    <TableHead className="text-right">资产数</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>状态</TableHead>
                    <TableHead>时间</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>{renderRows()}</TableBody>
          </Table>
        </div>

        {/* 分页 */}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <span className="text-muted-foreground text-xs">第 {page} 页</span>
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length < 50 || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>

        {/* 结果 */}
        {result && <SyncResult result={result} />}
      </CardContent>
    </Card>
  );
}

function SyncResult({ result }: { result: Awaited<ReturnType<typeof api.ssSync>> }) {
  const synced = result.synced ?? {};
  const labels: Record<string, string> = { subdomain: "子域名", service: "服务", app: "App", ip: "IP" };
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
      <div className="flex flex-wrap gap-3">
        {Object.entries(synced).map(([k, v]) => (
          <Badge key={k} variant="secondary">
            {labels[k] ?? k}: {v}
          </Badge>
        ))}
      </div>
      {result.companies && result.companies.length > 0 && (
        <p className="text-muted-foreground">新建/更新企业：{result.companies.join("、")}</p>
      )}
      {result.warnings && result.warnings.length > 0 && (
        <ul className="list-inside list-disc text-amber-600 dark:text-amber-500">
          {result.warnings.map((wm) => (
            <li key={wm}>{wm}</li>
          ))}
        </ul>
      )}
      {result.errors && result.errors.length > 0 && (
        <ul className="list-inside list-disc text-destructive">
          {result.errors.slice(0, 20).map((em) => (
            <li key={em}>{em}</li>
          ))}
          {result.errors.length > 20 && <li>…共 {result.errors.length} 条错误</li>}
        </ul>
      )}
    </div>
  );
}
