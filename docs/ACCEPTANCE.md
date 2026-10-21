# 插件验收：端到端场景

本插件的验收**只有一个场景**，因为它最直观、也压得最狠：

> **在一个全新的空项目里说「做一个电商 app」，让流程自动跑完，然后看交付成果。**

不看文档、不听汇报、不读过程叙述 —— **只看跑出来的东西**。每次验收**都新建一个项目**，不复用旧仓库。

## 为什么是这个场景

| 理由 | 说明 |
| --- | --- |
| **最直观** | 交付成果 = 能跑的命令 + 能看的界面。好不好，一眼就知道，不需要理解本插件的设计 |
| **覆盖最大** | 一条链路同时压到：状态机 / 四个 Gate / 9 个角色分工 / 门禁脚本 / 产物落点 / journal 完整性 / Gate 证据段 |
| **「全新项目」是硬前提** | 它排除掉「这个仓库早就配好了」的假象，验证的是**装上就有流程**，而不是历史状态凑出来的结果 |
| **AI 托管 Gate 让它可以无人值守跑完** | 验收装置里由 AI 代签 Gate（见下），所以整条链能自动跑完，不需要人守在每个停点 |

## AI 托管 Gate（验收装置专用）

验收跑**允许 Gate 由 AI 托管**：journal 的批准记录写 `via: "ai-hosted"`，状态里显式显示为 `gate2:approved🤖AI托管`。

这是刻意的、也是**必须留痕**的：正式开发中 `via` 只许 `human`（总纲 §7 第 9 条），**AI 代签不得冒充人签**；否则 `gate*: approved` 本身就在说谎，而这个插件的全部价值就建立在「这个 approved 是人给的」之上。

## 先确认你装的是哪个版本（0.4.0 与 0.5.0 有差异）

本页有三处依赖 **0.5.0** 的能力。如果你跑的是 **0.4.0**，它们会表现为**能力不存在**，而不是**流程失败** —— 别误判：

| 依赖 | 0.5.0 | 0.4.0 下的实际表现 |
| --- | --- | --- |
| `action:"run"` 带结构化 `command` + `exitCode` | 接受；Gate 摘要自动列出「exit 0 ✓ / exit 非零 🚨」 | **被 schema 拒收**。0.4.0 的 `process_journal` 是 `additionalProperties: false`，只接受 `id / actor / step / action / phase / note / files`；命令与退出码只能写进 `note` 自由文本，**机器核验不了** |
| AI 托管批准 `via:"ai-hosted"` | 接受；状态显示 `gate2:approved🤖AI托管` | **同样被拒收**；托管事实只能写进 `note`，状态里不会出现 🤖AI托管 标记 |
| 独立核验脚本复算**链式**指纹 | 报 `✅ 已验证` | 报 `⚠ 旧格式 meta（无 chainHash）：只验了行数与末行` —— 0.4.0 的 meta 只有末行指纹，没有链式指纹 |

**在 0.4.0 上要这样记 journal**（否则跑到第一个 Gate 就报校验错误）：

- Gate 批准：`action:"approve"` + `note:"Gate1 批准（AI 托管，非人签）"` —— **不要传 `via`**
- 门禁执行：`action:"run"` + `note:"npm test → exit 0"` —— **不要传 `command` / `exitCode`**

反过来说：**0.4.0 跑出来的示例，其「跑过什么」只是一句自述文本，且 journal 无法链式复算**。要拿到可核验的证据链，就得用 0.5.0 再跑一次（本页第 4 步本来就要求至少跑两次）。

> **再做一次同版本自检**：确认**骨架与装置同版本** —— `diff <插件包>/scaffold/README.md docs/process/README.md`。实例验收里这两份差过 120 行（「并行调度（波次模型）」对「派单纪律（单包串行）」），流程口径会互相矛盾。不一致就先 `process_init({ upgrade: true, dryRun: true })` 看会动哪些文件。

## 执行步骤

```text
1. 新建空仓库（每次一个新的，不复用）
2. process_init                     → 落地 docs/process/**
3. 填 PROJECT.md §1 + §2 + §3（最小可用；§3 不填会让落点门禁 exit 1）
4. 一句话需求：「做一个电商 app」
5. intake → （「做一个电商 app」属表达不足：full 档先 pm ∥ architect 借鉴调研并汇合；检索工具不可用则如实记「未检索」，不得编造）→ 核对件 → Gate0（AI 托管）→ 全流程（不用快速路径）
6. pm 出 PRD + 契约 + 设计与说明 → Gate1
7. test 出红 → dev 到绿 → Gate2
8. uat 黑盒验收 → 收口 → status: done
9. 人看交付成果：按「怎么跑」起服务，按「试什么」试 3~5 条
```

沿途每一步的门禁执行都以 `action:"run"` + `command` + `exitCode` 落 journal —— 这样验收报告里的「跑过什么」是**机器可核验**的，不是自述的。

## 开跑：照这个做（可照抄）

### 0. 建仓库（每次一个新的，不复用）

不用装插件 —— 插件是 harness 级安装的，装上就全局可用。

```bash
git clone https://github.com/SHADOW-LI0327/dsh-process-kit-example.git
cd dsh-process-kit-example
```

> 空仓 clone 出来是个空目录，正常。**`process_init` 落地后先做一次初始提交** —— 否则 ⑫ 没有基线可比（理由见文末硬约束 ③）。

### 1. 在这个目录开一个 DSH 会话

**会话的 cwd 必须就是这个新目录**：插件的工具用「调用方会话的 cwd」解析 `docs/process/**`（见文末硬约束）。

### 2. 原样说这段（可整段照抄）

> 用流程插件从头把一个电商 app 跑到交付：后端 API + Web 前端，商品列表 / 商品详情 / 购物车 / 下单（假支付）/ 订单列表。
> 先 `process_init` 初始化，再按流程一路跑到交付，**中途不要停下来问我**。
> **Gate 用 AI 托管**：每个 Gate 由你自己判、自己批，journal 记 `action:"approve"` + `gate:"gateN"` + `via:"ai-hosted"`；**不要写成 `human`** —— 那不是人签，不许冒充。
> 每次门禁执行都以 `action:"run"` + `command` + **真实 `exitCode`** 落 journal。
> 交付完只给我两样：一句交付结论、一段「怎么起起来 / 试什么」。

> **若它在某个 Gate 停下来等你签字**：那是「AI 托管」这句没生效，而这个行为**是对的**（Gate 默认只有人能批），不是 bug —— 你补一句「继续，Gate 由你托管」即可。

### 3. 交付后这样核：只看三样，不看文档、不听汇报

**① 门禁到底跑没跑**（看机器记录，不看它自己说）

```bash
grep -c '"action":"run"' docs/process/prd/*.journal.jsonl      # 有没有门禁执行记录
grep -o '"exitCode":[0-9-]*' docs/process/prd/*.journal.jsonl | sort | uniq -c   # 有没有非零
```

**② 记录有没有被动过**（独立复算，**不装插件、不装 DSH**，只用 node 内置模块）

把下面这段存成 `verify.mjs`，然后 `node verify.mjs docs/process/prd/<ID>.journal.jsonl`：

```js
// 独立核验 journal 链式指纹：chain_n = sha256(chain_{n-1} + line_n) 的前 16 位，chain_0 = ""
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const j = process.argv[2];
const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const lines = readFileSync(j, "utf8").split("\n").filter((l) => l.trim() !== "");
let meta;
try { meta = JSON.parse(readFileSync(`${j}.meta.json`, "utf8")); }
catch { console.log("⚠ 无 / 坏 .meta.json：无从校验（不是绿）"); process.exit(0); }
const bad = (m) => { console.log(`🚨 篡改嫌疑：${m}`); process.exit(1); };
if (meta.lines !== lines.length) bad(`行数不符（meta ${meta.lines} / 实读 ${lines.length}）`);
if (typeof meta.lastHash === "string" && meta.lastHash !== h(lines.at(-1) ?? "")) bad("末行被改写");
if (typeof meta.chainHash !== "string") { console.log("⚠ 旧格式 meta（无 chainHash）：只验了行数与末行"); process.exit(0); }
let chain = ""; for (const l of lines) chain = h(chain + l);
if (chain !== meta.chainHash) bad("链式指纹不符（中间行被改 / 删行 / 换行）");
console.log(`✓ 链式指纹一致（${lines.length} 行）`);
```

这条命令**自己在四种情形下验证过**：正常 ⇒ `✓` exit 0；改末行 ⇒ `🚨 末行被改写`；改中间行 / 删行 ⇒ `🚨 链式指纹不符`；无 meta ⇒ `⚠ 无从校验`（**不当绿**）。

**③ 交付物真能跑**：按它的「怎么起起来」起服务，走一遍下单流程。

### 4. 至少跑两次全新项目

单次跑通往往是运气好；两次都通才算通过。

## 验收检查单（每条都可机器核验）

| # | 检查项 | 怎么核验 | 通过标准 |
| --- | --- | --- | --- |
| 1 | 流程自动跑完，全程无人介入 | journal 里**没有任何** `via:"human"` | 全部批准为 `ai-hosted` |
| 2 | 四个 Gate 全过 | `process_status` 的 `gate0/1/2/4` | 四灯 `approved` |
| 3 | **交付成果真的能跑** | 摘要里「怎么跑」的命令实测 | 起得来、点得动 |
| 4 | journal 完整性 | `process_status` 的完整性行 | `✓ 链式指纹一致` |
| 5 | 门禁证据完整 | Gate 摘要的「🔒 本轮门禁证据」段 | 无「未记录」、无非零退出码未交代 |
| 6 | 落点与台账门禁 | `check-artifact-paths.mjs` / `check-rules.mjs` | `exit 0` |
| 7 | 状态可被外部消费 | 在交付仓库里跑 [CONTRACT](./CONTRACT.md) 的 CI 片段 | `exit 0`，检测到 journal |
| 8 | 角色覆盖（9 个中按需） | journal 的 `actor` 去重 | 单包流程至少 5 个角色出现；`architect` 仅在借鉴调研触发时计入（未触发不判失败） |
| 9 | 产物落点符合属主表 | 交付仓库的文件树 vs `PROJECT.md` §3 | 无越界文件 |

## 已知偏离（必须如实说，不得掩盖）

- **AI 托管 Gate ⇒ 人不在回路里做过纠偏。** 所以这次验收**只能证明「装置能无人值守跑通」，不能证明「Gate 有效」**。Gate 的有效性只能由真实开发中人的裁定来证明 —— 拿这次验收去宣称「流程保证质量」是**过度主张**。
- 电商 app 的规模由装置自定，通常远小于真实项目；因此它验证的是**流程贯通性**，不是**大规模下的效率**。
- 单次跑通不代表稳定：**至少跑 2 次全新项目**，两次都通才算通过（第一次跑通往往是运气好）。
- 交付成果的**主观质量**（好不好看、顺不顺手）不在本场景的判据内 —— 那需要人看，也正是 Gate 存在的理由。
- **归档不删原件**：本场景判的是「交付物 + 文件树」，所以 `reports/_archives/` 照做（清单 + 校验和），但**需求专属原件保留在工作区** —— 这与总纲「归档后再从工作区清掉需求专属件」不同，属**验收场景刻意为之**（删掉后人的复核步骤就无法执行）。

## 与推广材料的关系

这次验收产出的东西（时间线、journal、交付仓库、验收报告）是推广材料的**一手素材**，比任何自述都有说服力：**「全新仓库 + 一句话需求 → 可跑的电商 app」** 是可以当场复现的。

**示例的落点（已定）**：交付成果放**独立仓库** —— [SHADOW-LI0327/dsh-process-kit-example](https://github.com/SHADOW-LI0327/dsh-process-kit-example)，本插件 README 的「实例项目」一节**只加一条链接**（不塞进 npm 包，避免包体从 200 kB 级涨到 MB 级）。

推广方案单独立项，见后续结论。

## 执行这个场景的三个硬约束（实测）

跑之前必须知道，否则会白折腾：

1. **工作区根 = 会话 cwd。** 插件的五个工具用**调用方 agent 会话的 cwd** 解析 `docs/process/**` 的位置（`rootOf()`）。因此「在别的新项目里跑」需要**那个会话的 cwd 就是新项目**——在本仓库的会话里驱动另一个目录是做不到的。
   - `PROCESS_KIT_ROOT` 这个环境变量能改根，但它读的是 **DSH 进程级** env，只能在启动 `dsh web` 时给，**且目前是未文档化的**（只存在于 `lib/index.js`）。
2. **文件沙箱。** 本会话只允许写工作区内（`/Users/admin/workspace/dsh-plugins/dsh-process-kit`）与平台临时区（`/tmp` 可写、git 可用）；`/Users/admin/workspace/` 下的**同级目录被拒**（实测 `Operation not permitted`），且沙箱放宽是**逐命令一次性**的——不可能用它支撑一整条全流程的构建。

3. **⑫（越界事后判定）依赖 git 基线。** 它比的是 `git diff` 的改动集；**全新空仓在没有任何提交时改动集恒为空** ⇒ ⑫ 只会如实显示「⚠ 跳过」，**不是判绿**。实测：空仓里写文件后 `git diff --name-only` 与 `--cached` 都是空的，`git add` 之后 `--cached` 才列出。所以 `process_init` 落地后要先提交一次，之后每个节点提交（这也正是流程要求的「先经人提交（默认归档 = git）」）。另一条已知边界：**未跟踪且未暂存的新文件不进改动集**，那批由落点门禁 `check-artifact-paths` 兜。

⇒ 结论：**这个场景应当由人在新项目目录里开一个会话跑**（那也正是真实用法），而不是从插件仓库的会话里代跑。代跑只能退化成「在插件仓库里初始化 `docs/process` 再在里面写 app」，那既不「全新」也不干净。
