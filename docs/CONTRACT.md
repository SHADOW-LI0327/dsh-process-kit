# 机器可消费契约

给要在**插件之外**消费流程状态的人 / 脚本 / CI / 别的 agent。

## 为什么可以「不装插件」

这个插件的状态**全部落在目标仓库的纯文本里**（`docs/process/**`），插件只做「读 + 渲染 + 安全追加 + 只增不改地初始化」（[DESIGN](./DESIGN.md) 红线 1）。所以：

- **CI、pre-commit、code review、外部工具不需要安装本插件，也不需要 DSH**，直接读文件即可；
- 插件卸载后状态依然完整、可读、可校验 —— 这是「状态入仓」相对「状态存在插件侧（SQLite / 家目录 / 任务 JSON）」的结构性差异；
- 反过来，这份文档写死的就是**你可以依赖哪些字段**。

本文件描述的是**稳定契约**。字段语义变更按 semver 走，会在 [CHANGELOG](../CHANGELOG.md) 里标注。

---

## 契约 1：包 frontmatter

`docs/process/prd/<ID>.md`、`docs/process/input/<ID>.md`（核对件）的 YAML frontmatter：

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `id` | `^[A-Z]+-\d+$` | 需求包 ID，全流程主键 |
| `status` | `intake` / `clarifying` / `red` / `implementing` / `verifying` / `uat` / `archives` / `done` / `terminated` … | 流程走到哪（状态机见总纲） |
| `flow` | `full` / `fast` | 档位。`fast` 只有 Gate0 |
| `gate0` `gate1` `gate2` `gate4` | `pending` / `approved` … | **状态位**：某个 Gate 过了没。**它不记谁批准的**（见契约 2） |
| `prdVersion` | 整数 | PRD 版本，与规则台账、测试头三方一致 |
| `uiDesign` | `required` / 缺省 | 是否触及 UI（决定是否派 ui-designer） |

> ⚠ **`gate*: approved` 不等于「人签过」**。它只说明状态位写成了 approved，**批准来源在 journal 里**。要区分人签与 AI 代签（验收装置），必须读契约 2 的 `via`。

> **同一个 ID 可能有多个文件**：主件 `prd/<ID>.md`，以及从件 `<ID>-design.md` / `<ID>-ui-spec.md` / 清单件等 —— **从件的 frontmatter 也带 `id`**。**契约：状态位一律以 `prd/<ID>.md` 为准**，从件不参与取值；只有主件缺失时才退回从件，且 `process_status` 会告警「找不到主件」。
>
> 机器消费方请按同一规则取主件，**不要按目录序取第一个**：`readdir` 的返回顺序未定义，而 `<ID>-` 在字典序上排在 `<ID>.` 之前 —— 取错就会把 `status=done` / `gate2=approved` 的包读成从件的 `confirmed` / `pending`。

## 契约 2：journal（JSONL，每行一个 JSON 对象）

`docs/process/prd/<ID>.journal.jsonl`，append-only，**禁止手工读-改-写**。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `at` | ✅ | ISO8601 **机器时间**（工具自动填，不是模型自述时间） |
| `actor` | ✅ | 谁做的，如 `orchestrator` / `subagent:test-agent` |
| `id` | ✅ | 包 ID |
| `step` | | 环节：`pm` / `test` / `dev` / `uat` / `review` / `archives` … |
| `action` | | `write` / `run` / `approve` / … |
| `phase` | | 阶段（用于复算阶段耗时 / 返工次数） |
| `files` | | 涉及文件数组 |
| `note` | | 一句话事实 |
| `gate` | | `gate0` / `gate1` / `gate2` / `gate4` |
| `command` | 见下 | 实际跑的门禁命令（原样） |
| `exitCode` | 见下 | 该命令的**真实退出码** |
| `artifact` | | 证据指针（产物 / 报告路径） |
| `via` | 见下 | `human`（人签）/ `ai-hosted`（AI 代签） |

**两条带条件的硬约束**（写入侧强制，消费侧可依赖）：

- `action: "run"` ⇒ **必须**同时有 `command` 与 `exitCode`。没有退出码的「跑过了」正是总纲禁止的掩盖。**这是「本 Gate 跑没跑、红没红」的唯一机器可核验来源。**
- `action: "approve"` ⇒ 带 `gate` 与 `via`。**正式开发 `via` 只许 `human`**；`ai-hosted` 只许出现在验收 / 回归装置（例：全新项目端到端跑通一个电商 app），且不得冒充人签。

> 状态位 `approved` 而 journal 里查不到对应 `approve` 记录 ⇒ 插件显示 `⚠无留痕`（来源无从考证）；`via:"ai-hosted"` ⇒ 显示 `gate2:approved🤖AI托管`。

## 契约 3：旁挂指纹与完整性校验

`docs/process/prd/<ID>.journal.jsonl.meta.json`：

```json
{ "lines": 3, "lastHash": "<sha256 前 16 位 hex>", "chainHash": "<同上>" }
```

校验算法（**逐字复刻**，否则会把正常 journal 判成篡改）：

```
hash16(s)  = sha256(s) 的 hex 前 16 位
lines      = 非空行数
lastHash   = hash16(最后一行原文)
chainHash  = fold(lines, (chain, line) => hash16(chain + line), 初始值 "")
```

**判定**（四种结论，**「无法校验」不是绿**）：

| 结论 | 条件 |
| --- | --- |
| ✅ 一致 | `meta.lines === 行数` 且 `meta.chainHash === chainHash` |
| 🚨 篡改嫌疑 | 行数不符（截断 / 未登记追加）、`lastHash` 不符（末行被改）、`chainHash` 不符（**中间任意一行被改 / 删行 / 换行**） |
| ⚠ 旧格式 | meta 无 `chainHash`：只能验行数与末行，**中间行不可验** |
| ⚠ 未校验 | 无 `.meta.json` 或 meta 损坏 |

> `lastHash` 单独是不够的：改中间行、删一行再补一行都能骗过它，这正是加 `chainHash` 的原因。

## 契约 4：门禁脚本（CI 侧）

`scripts/process/*.mjs` 是**零依赖** Node ESM 脚本，可直接在 CI 跑，**判据即退出码**：`0` = 过 / 不适用，非零 = 红（红即缺口，不得掩盖）。

| 脚本 | 判什么 |
| --- | --- |
| `check-artifact-paths.mjs` | 产物落点：会进下一次提交的未跟踪文件是否落在合法根 |
| `check-rules.mjs` | 台账 ↔ 测试 ↔ PRD 三层证据链自洽、import 白名单、`prdVersion` 一致；**越界事后判定**（角色边界，fail-open） |
| `check-uat-readiness.mjs` | UAT 前置：环境 + 账号 + 目标端点就绪 |
| `check-ui-geometry.mjs` | UI 客观几何（溢出 / 重叠 / 过挤 / 居中 / 边距 / 对比度）；**文字层为 0 时只报 ⚠，不打绿** |
| `journal-append.mjs` | 安全追加（锁 + 指纹 + 原子替换 + 自校验），写 meta |
| `sync-prd-version.mjs` | 同步 `prdVersion` 的四个声明位 |

**fail-open 是刻意的**：未初始化 `docs/process`、快速路径、项目未配属主表时一律跳过并 `exit 0`，不误伤未接入流程的仓库。

## 契约 5：插件工具的结构化返回（agent 侧）

`process_status` / `gate_summary` / `process_journal` / `process_init` 的返回值是**结构化对象**（`render` 只负责显示）。其中可依赖的字段：

- `process_status` → `{ found, root, processDir, generatedAt, packages[], openBugCount, orphanBugs[], warnings[], releasePending, releaseReports[] }`；每个包含 `id` / `status` / `gates` / **`gateHost`**（`human` / `ai-hosted` / `unrecorded`）/ `prdVersion` / `artifacts` / `openBugs` / `next`，以及 `journal: { lines, lastAt, lastActor, lastStep, integrity, runs[], approvals[] }`。
- `journal.integrity` → `{ state: 'verified' | 'legacy' | 'tampered' | 'unverified', reason?, lines? }`。
- `journal.runs[]` → `{ at, gate, actor, step, command, exitCode, artifact }`（契约 2 的 `action:"run"`）。
- `journal.approvals[]` → `{ at, gate, actor, via }`（契约 2 的 `action:"approve"`）。

---

## 消费示例

### CI：把「流程状态」当门禁（不装插件）

```bash
# ① 门禁脚本：非零即红
node scripts/process/check-artifact-paths.mjs
node scripts/process/check-rules.mjs

# ② journal 完整性：链式指纹重算（纯 node，无依赖）
node -e '
const fs=require("fs"),c=require("crypto");
const h=s=>c.createHash("sha256").update(s).digest("hex").slice(0,16);
const dir="docs/process/prd"; let bad=0, checked=0;
if(fs.existsSync(dir)) for(const f of fs.readdirSync(dir).filter(n=>n.endsWith(".journal.jsonl"))){
  const p=`${dir}/${f}`;
  const lines=fs.readFileSync(p,"utf8").split("\n").filter(l=>l.trim());
  let chain=""; for(const l of lines) chain=h(chain+l);
  const mp=`${p}.meta.json`;
  if(!fs.existsSync(mp)){ console.error(`⚠ ${f}: 无 meta，未校验`); continue; }
  const m=JSON.parse(fs.readFileSync(mp,"utf8")); checked++;
  if(m.lines!==lines.length||(m.chainHash&&m.chainHash!==chain)){ bad++; console.error(`🚨 ${f}: 完整性不符`); }
}
console.error(`journal 已校验 ${checked} 份，可疑 ${bad} 份`); process.exit(bad?1:0);'
```

### 用 jq 查「哪些包在等 Gate2，且批准是人签的」

```bash
grep -l '^gate2: pending' docs/process/prd/*.md | while read -r prd; do
  id=$(basename "$prd" .md)
  host=$(grep -o '"gate":"gate2","actor":"[^"]*","via":"[^"]*"' "docs/process/prd/$id.journal.jsonl" 2>/dev/null | tail -1)
  printf '%s\t%s\n' "$id" "${host:-无批准留痕}"
done
```

### 取「本 Gate 的门禁证据」做发布检查

```bash
# 所有非零退出码的门禁执行（红即缺口，发布前必须清掉或显式豁免）
grep -h '"action":"run"' docs/process/prd/*.journal.jsonl \
  | grep -v '"exitCode":0' \
  | sed -E 's/.*"command":"([^"]*)".*"exitCode":([0-9-]+).*/\1 → exit \2/'
```

---

## 变更纪律

- 加字段：向后兼容，消费侧应忽略未知字段；插件的工具返回是**增量**的。
- 改字段语义 / 删字段：算破坏性变更，在 CHANGELOG 标注，并按 [DESIGN](./DESIGN.md)「三处必须同步」把 `lib/index.js`、总纲 §7、本文件一起改。
