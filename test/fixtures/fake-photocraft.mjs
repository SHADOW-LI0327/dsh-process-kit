#!/usr/bin/env node
// 假 PhotoCraft —— 让 ⑧ 对比度 / ⑩ 项目令牌这两条**依赖真实采样**的检查，
// 在没有那套 600MB 工具链的环境里也能回归测试。
//
// 真适配器的接口面很窄：`run <artifact> --cmd document.pixel --params '{"x":N,"y":N}'` 重复，
// 每行回一个 `{"result":[r,g,b,a]}`。颜色表由 STUB_PIXELS 指的 JSON 说了算：
//
//   {
//     "points": { "40,40": [49,107,225,255] },                                   // 精确坐标，最高优先级
//     "rects":  [ {"x0":40,"y0":40,"x1":360,"y1":120,"rgba":[49,107,225,255]} ], // 先匹配先赢
//     "default": [247,251,255,255]                                                // 其余（含抗锯齿边缘）
//   }
//
// ⚠️ 必须支持矩形：只给单个点的话，那块区域**占比过不了 ⑩ 的「主色」门槛**，
// 测试就会在「其实什么都没测到」的情况下变绿 —— 夹具太弱 = 假绿。
import { readFileSync } from 'node:fs';

// `info <psd> --compact` ⇒ 原样吐出 STUB_INFO 指的 JSON。
// ⚠️ 必须放在读像素表**之前**：否则 STUB_PIXELS 未设置时会先炸在这一行。
// 有了这条，`--from-photocraft` 那条路径（含它是否把 intent 带进来）也能常规回归测试。
if (process.argv[2] === 'info') {
	process.stdout.write(readFileSync(process.env.STUB_INFO, 'utf8'));
	process.exit(0);
}

const spec = JSON.parse(readFileSync(process.env.STUB_PIXELS, 'utf8'));
const points = spec.points ?? {};
const rects = spec.rects ?? [];
const dflt = spec.default ?? [0, 0, 0, 255];

function pick(x, y) {
	const p = points[`${x},${y}`];
	if (p) return p;
	for (const r of rects) {
		if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return r.rgba;
	}
	return dflt;
}

const argv = process.argv.slice(2);

// 故障注入：STUB_FAIL_ABOVE=N ⇒ 一次调用要的点数超过 N 就**整个失败**（非零退出）。
// 用来验证「采样失败不得被当成『真的只有一种颜色』」——门槛卡在
// ⑧ 主采样（每层 9 点）与逐像素复核（整块面积）之间，就能只让复核那一步失败。
const failAbove = Number(process.env.STUB_FAIL_ABOVE);
if (Number.isFinite(failAbove) && failAbove > 0) {
	const n = argv.filter((a) => a === '--params').length;
	if (n > failAbove) {
		process.stderr.write(`fake-photocraft: 故意失败（本次 ${n} 点 > ${failAbove}）\n`);
		process.exit(3);
	}
}

const lines = [];
for (let i = 0; i < argv.length; i += 1) {
	if (argv[i] !== '--params') continue;
	const p = JSON.parse(argv[i + 1]);
	// 真适配器回的是 0..1 归一化浮点
	lines.push(JSON.stringify({ result: pick(p.x, p.y).slice(0, 4).map((v) => v / 255) }));
}
process.stdout.write(`${lines.join('\n')}\n`);
