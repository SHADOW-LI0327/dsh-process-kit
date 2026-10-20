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

> **同一个 ID 可能有多个文件**：主件 `prd/<ID>.md`，以及从件 `<ID>-design.md` / `<ID>-ui-spec.md` / **`<ID>-arch.md`** / 清单件等 —— **从件的 frontmatter 也带 `id`**。**契约：状态位一律以 `prd/<ID>.md` 为准**，从件不参与取值；只有主件缺失时才退回从件，且 `process_status` 会告警「找不到主件」。**`<ID>-arch.md` 例外：它不是状态载体**，只作为主件包的 `artifacts.arch` 出现；没有同 ID 主件时**不单独成包**，只告警「找不到主件」。**`-arch` 后缀保留给架构设计与取舍**：需求包 ID 不要以 `-arch` 结尾（否则主件会被当成从件，`check-rules` 的包 ID 归一也会把它并到上一级）。
>
> 机器消费方请按同一规则取主件，**不要按目录序取第一个**：`readdir` 的返回顺序未定义，而 `<ID>-` 在字典序上排在 `<ID>.` 之前 —— 取错就会把 `status=done` / `gate2=approved` 的包读成从件的 `confirmed` / `pending`。

## 契约 2：journal（JSONL，每行一个 JSON 对象）

`docs/process/prd/<ID>.journal.jsonl`，append-only，**禁止手工读-改-写**。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `at` | ✅ | ISO8601 **机器时间**（工具自动填，不是模型自述时间） |
| `actor` | ✅ | 谁做的，如 `orchestrator` / `subagent:test-agent` |
| `id` | ✅ | 包 ID |
| `step` | | 环节：`pm` / `architect` / `test` / `dev` / `uat` / `review` / `archives` … |
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
- `action: "approve"` ⇒ **必须**带 `gate`（`gate0` / `gate1` / `gate2` / `gate4`）与 `via`（**工具层强制**：缺任一项直接报错）。**正式开发 `via` 只许 `human`**；`ai-hosted` 只许出现在验收 / 回归装置（例：全新项目端到端跑通一个电商 app），且不得冒充人签。

- **未声明的字段 ⇒ 直接拒绝**（拼错的大小写也算，工具会给出「是不是想写 `exitCode`？」这类建议）。旧版本是**静默丢弃**，实测因此丢了 4 条记录的命令与退出码 —— 「我记了」变成了「其实没记」。

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
| `check-artifact-paths.mjs` | 产物落点：**新增**文件是否落在合法根。**三种模式**：默认判未跟踪（`git add` 之后就看不见了）· `--staged` 判暂存区新增 · `--committed[=<rev>]` 判某次已入库提交新增；**只判新增**（改 `README.md` 这类正常操作不判）。见下方 ⚠ |
| `check-rules.mjs` | 台账 ↔ 测试 ↔ PRD 三层证据链自洽、import 白名单、`prdVersion` 一致；**越界事后判定**（角色边界，fail-open） |
| `check-uat-readiness.mjs` | UAT 前置：环境 + 账号 + 目标端点就绪 |
| `check-ui-geometry.mjs` | UI 客观几何（溢出 / 重叠 / 过挤 / 居中 / 边距 / 对比度）；**文字层为 0 时只报 ⚠，不打绿** |
| `journal-append.mjs` | 安全追加（锁 + 指纹 + 原子替换 + 自校验），写 meta |
| `sync-prd-version.mjs` | 同步 `prdVersion` 的四个声明位；`--check` 下**产物存在却缺该字段行 ⇒ 判不一致、退出 1**（只有整个文件不存在才跳过，fail-open） |

**fail-open 是刻意的**：未初始化 `docs/process`、快速路径、项目未配属主表时一律跳过并 `exit 0`，不误伤未接入流程的仓库。

> ⚠ **落点门禁的读数只在「提交前」有效**（实例验收实测）：`check-artifact-paths.mjs` 判的是**未被忽略的未跟踪文件**。同一条命令在交付提交**前**跑读作 `受检未跟踪文件 69 个（放行 69）`，提交**后**跑读作 `0 个（放行 0）` —— **两次都 `exit 0`**，但第二次**什么都没检查**。
>
> 三种模式（0.5.0 起，报告里**必须写明用了哪一种**）：
>
> | 模式 | 判谁 | 用在哪 |
> | --- | --- | --- |
> | 默认 | 未跟踪未忽略的**新增**文件 | 提交前；**`git add` 之后就看不见了** |
> | `--staged` | 暂存区里的**新增**文件 | 提交前最后一道（补上 `git add` 的盲区） |
> | `--committed[=<rev>]` | 某次已入库提交的**新增**文件（默认 `HEAD`） | **CI / 事后审计** —— CI 里产物早已入库，只有这个模式有对象可判 |
>
> **受检 0 个时只报 `⚠ 空转`、绝不打绿**：一条都没判过就不算判过（「无法校验不是绿」）。三种模式都**只判新增**（`--diff-filter=A`），改 `README.md` / `package.json` 这类非产物文件不在本门禁职责内。已入库产物的越界复查也可以按 `git ls-files` 全集做独立审计（实例验收的报告里就有这样一个 `audit-ownership.mjs`，且做过反向对照 —— 造一个越界文件必须判红）。

## 契约 5：插件工具的结构化返回（agent 侧）

`process_status` / `gate_summary` / `process_journal` / `process_init` 的返回值是**结构化对象**（`render` 只负责显示）。其中可依赖的字段：

- `process_status` → `{ found, root, processDir, generatedAt, packages[], openBugCount, orphanBugs[], warnings[], releasePending, releaseReports[] }`；每个包含 `id` / `status` / `gates` / **`gateHost`**（`human` / `ai-hosted` / `unrecorded`）/ `prdVersion` / `artifacts` / `openBugs` / `next`，以及 `journal: { lines, lastAt, lastActor, lastStep, integrity, runs[], approvals[] }`。
- `journal.integrity` → `{ state: 'verified' | 'legacy' | 'tampered' | 'unverified', reason?, lines? }`。
- `journal.runs[]` → `{ at, gate, actor, step, command, exitCode, artifact }`（契约 2 的 `action:"run"`）。
- `journal.approvals[]` → `{ at, gate, actor, via }`（契约 2 的 `action:"approve"`）。

---

## 消费示例

> 三段片段都遵守**契约 1 的取值优先级**与**契约 2 的字段语义**：状态位只读 `prd/<ID>.md`（跳过 `_` 前缀模板，也不读 `<ID>-design.md` / `<ID>-ui-spec.md` 这类从件 —— **判据是文件名词干等于 frontmatter 的 `id`**），并且**一律 `JSON.parse` 后按字段取值，不依赖键序**。
>
> **别用字面量 grep 去匹配键序**：`grep -o '"gate":"gate2","actor":"[^"]*","via":"[^"]*"'` 这种写法，只要 journal 的键序一变就**永远匹配不到** —— 实例验收里 `gate2` 的批准记录**明明存在**，片段却输出「无批准留痕」。这是**假阴性**：比假阳性更危险，它会让人误判「这个 Gate 没人签」。

### CI：把「流程状态」当门禁（不装插件）

```bash
# ① 台账 / 规则门禁：非零即红
node scripts/process/check-rules.mjs

# ② 落点门禁：提交前用 --staged（默认模式在 `git add` 之后就看不见了）；CI 里用 --committed
node scripts/process/check-artifact-paths.mjs --staged

# ③ journal 完整性：链式指纹重算（纯 node，无依赖）
node -e '
const fs=require("fs"),c=require("crypto");
const h=s=>c.createHash("sha256").update(s).digest("hex").slice(0,16);
const dir="docs/process/prd"; let bad=0,legacy=0,ok=0,unchecked=0;
if(fs.existsSync(dir)) for(const f of fs.readdirSync(dir).sort().filter(n=>n.endsWith(".journal.jsonl"))){
  const p=`${dir}/${f}`, lines=fs.readFileSync(p,"utf8").split("\n").filter(l=>l.trim());
  let chain=""; for(const l of lines) chain=h(chain+l);
  const mp=`${p}.meta.json`;
  if(!fs.existsSync(mp)){ unchecked++; console.error(`⚠ ${f}: 无 meta —— 未校验（不是绿）`); continue; }
  let m; try{ m=JSON.parse(fs.readFileSync(mp,"utf8")); }catch{ unchecked++; console.error(`⚠ ${f}: meta 解析失败 —— 未校验（不是绿）`); continue; }
  if(m.lines!==lines.length || m.lastHash!==h(lines[lines.length-1]??"")){ bad++; console.error(`🚨 ${f}: 行数/末行不符 —— 篡改嫌疑`); continue; }
  if(typeof m.chainHash!=="string"){ legacy++; console.error(`⚠ ${f}: 旧格式 meta（无 chainHash）—— 只验了行数与末行，改中间行/删行/换行查不出来`); continue; }
  if(m.chainHash!==chain){ bad++; console.error(`🚨 ${f}: 链式指纹不符（中间行被改 / 删行 / 换行）`); continue; }
  ok++;
}
console.error(`journal：已验证 ${ok} 份 · 篡改嫌疑 ${bad} 份 · 旧格式 ${legacy} 份 · 未校验 ${unchecked} 份`);
process.exit(bad?1:0);'
```

> **判读：只有「已验证」是绿。** `旧格式` 与 `未校验` 都是「验不动」，**不是通过** —— 要绿就先在仓库里跑一次 `process_init({ upgrade: true })`，把旁挂 meta 补成链式。四种计数刻意分开显示：把「验不动」并进「通过」，就是拿无色当绿色。

### 查「哪些包在等 Gate2、批准是谁签的」

```bash
node -e '
const fs=require("fs"),dir="docs/process/prd";
for(const f of fs.readdirSync(dir).sort()){
  if(!f.endsWith(".md")||f.startsWith("_")) continue;                    // 模板跳过（与插件加载器一致）
  const fm=fs.readFileSync(`${dir}/${f}`,"utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if(!fm) continue;
  const m=fm[1].match(/^id:\s*(\S+)\s*$/m); if(!m) continue;
  const id=m[1];
  if(f.slice(0,-3)!==id) continue;                                       // 从件不参与：契约 1 以 <ID>.md 为准
  if(!/^gate2:\s*pending\s*$/m.test(fm[1])) continue;
  const jp=`${dir}/${id}.journal.jsonl`; let via="无批准留痕";
  if(fs.existsSync(jp)) for(const l of fs.readFileSync(jp,"utf8").split("\n")){
    if(!l.trim()) continue; let e; try{ e=JSON.parse(l); }catch{ continue; }
    if(e.action==="approve"&&e.gate==="gate2") via=e.via==="human"?"human":"🤖"+(e.via??"未记 via");
  }
  console.log(`${id}\t${via}`);
}'
```

> 这里顺带示范了加载器的两条规则：**`_` 前缀跳过**、**主件为准**。少任何一条，`_TEMPLATE.md` 或 `FEAT-001-design.md` 就会被当成一个「在等 Gate2 的包」（实例验收里两条都踩到了）。

### 取「Gate 证据」做发布检查

```bash
# 非零退出码 = 红即缺口；缺 exitCode = 未记录（两条都要清掉或显式豁免）
node -e '
const fs=require("fs"),dir="docs/process/prd"; let bad=0,noCode=0;
for(const f of fs.readdirSync(dir).sort().filter(n=>n.endsWith(".journal.jsonl"))){
  for(const l of fs.readFileSync(`${dir}/${f}`,"utf8").split("\n")){
    if(!l.trim()) continue; let e; try{ e=JSON.parse(l); }catch{ continue; }
    if(e.action!=="run") continue;
    if(e.exitCode===undefined||e.exitCode===null){ noCode++; console.error(`⚠ ${f}: run 缺 exitCode（${e.command??"无命令"}）—— 未记录，不算跑过`); continue; }
    if(e.exitCode!==0){ bad++; console.error(`🚨 ${e.gate??"?"} exit ${e.exitCode}：${e.command??"?"}`); }
  }
}
console.error(`非零退出码 ${bad} 条 · 缺退出码 ${noCode} 条`); process.exit(bad?1:0);'
```

> 「跑过了」这句话本身不是证据：**只有带真实 `exitCode` 的 `action:"run"` 才算**。写不进去就先看是不是用了只接受 7 个字段的老版本工具（契约 2）。

---

## 变更纪律

- 加字段：向后兼容，消费侧应忽略未知字段；插件的工具返回是**增量**的。
- 改字段语义 / 删字段：算破坏性变更，在 CHANGELOG 标注，并按 [DESIGN](./DESIGN.md)「三处必须同步」把 `lib/index.js`、总纲 §7、本文件一起改。
