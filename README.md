# AI API Doctor

[![AI API Doctor CI](https://github.com/JustinXai/ai-api-doctor-site/actions/workflows/ci.yml/badge.svg)](https://github.com/JustinXai/ai-api-doctor-site/actions/workflows/ci.yml)

AI API Doctor is an open-source OpenAI-compatible API preflight checker for testing Base URL, API Key, Model ID, usage fields, cache signals, model identity signals, latency stability, and client config export before using an API gateway or relay in developer tools.

---

**中文说明：** AI API Doctor 是一个开源的 OpenAI-compatible API 小额验货工具。它用于在接入 API 中转站、AI API 网关、Cursor、Cline、Continue、Claude Code 等工具前，先用轻量真实请求检查当前 Base URL / API Key / Model ID 配置是否可用、透明、稳定、兼容。

---

## Online Demo

- **Website:** https://aiapidoctor.com
- **GitHub:** https://github.com/JustinXai/ai-api-doctor-site

## Why this exists

Many users are unsure whether a Base URL, API Key, or Model ID configuration will work when they first try an API relay or gateway. Some problems are not about model quality — they are about configuration, authentication, response format, usage fields, stability, or client compatibility.

AI API Doctor sends lightweight real requests and outputs a shareable report, helping users verify their setup with small amounts before committing to a provider.

It is **not** a model authenticity judge, nor a long-term monitoring system.

## What it checks

- Base URL reachability
- API Key authentication
- Model ID availability
- OpenAI-compatible response shape
- usage / token fields
- cache signal fields
- model self-claim, target consistency, and capability smoke tests
- stability and latency sampling
- Cline / Continue client config export

**中文补充：**

- Base URL 是否可访问
- API Key 是否能调用
- Model ID 是否可用
- 返回格式是否基本兼容 OpenAI-compatible
- usage / token 字段是否返回
- 缓存命中信号字段是否返回
- 模型自报身份、目标一致性及能力冒烟测试
- 轻量请求下的稳定性与延迟
- 是否能导出 Cline / Continue 配置

### Short-term Operational Risk Signals (v1.10)

Since v1.10, short-term operational risk signals are fetched through the Cloudflare Pages Function `/api/public-signals`, which queries public domain registration, certificate transparency, and Wayback data with caching. The browser no longer directly calls RDAP or crt.sh, reducing CORS and slow-response failures.

- Domain registration age (via RDAP, proxied through Worker)
- HTTPS certificate first-seen date (via crt.sh, proxied through Worker)
- Wayback Machine historical snapshot links

**中文：**

短期运营风险信号：根据 Base URL 自动尝试查询域名注册时间和 HTTPS 证书首次发现时间，并给出独立的预充值风险提示。该模块不证明平台一定会跑路或一定不会跑路，也不影响 API 技术评分。

v1.10 起，短期运营风险信号通过 Cloudflare Pages Function `/api/public-signals` 查询公开域名注册、证书透明日志和 Wayback 信息，并缓存结果。浏览器端不再直接请求 RDAP / crt.sh，以减少 CORS 和慢响应问题。

## What it does not prove

- It does not prove that a model is exactly the same as the official model.
- It does not guarantee long-term billing accuracy.
- It does not guarantee high-concurrency stability.
- It does not fully test long-context, multimodal, tool calling, or file features.
- It is not a replacement for long-term monitoring.

**中文：**

- 不证明模型一定等同官方同名模型
- 不保证长期余额扣费一定完全准确
- 不代表高并发、长上下文、多模态、tool_calls、文件能力全部稳定
- 不替代长期监控
- 当前版本仅展示目标接口的真实请求证据和配置风险

## Cache and billing note

AI API Doctor reads usage/cache fields returned by the target API. These fields are evidence from the response, not proof of official Prompt Cache billing or final dashboard billing. Actual balance changes may depend on provider pricing, cache read/write rates, model multipliers, and gateway-specific rules.

**中文：**

AI API Doctor 读取的是目标 API 响应中的 usage/cache 字段。这些字段是响应证据，不等于证明官方 Prompt Cache 计费，也不等于供应商后台最终扣费。实际余额变化还可能受到模型倍率、缓存读写价格、分组倍率和平台规则影响。

## Privacy

- API Key is used only in the current browser session for the test request.
- API Key is not uploaded to an AI API Doctor backend.
- Reports and copied summaries mask sensitive information.
- Use a temporary test key when possible.
- Rotate or revoke the key after testing if needed.
- Do not paste API keys into GitHub issues.

**中文：**

- API Key 仅在当前浏览器中用于本次检测
- 不上传到 AI API Doctor 服务器
- 报告和复制摘要会脱敏
- 建议使用临时测试 Key
- 检测后可在供应商后台轮换或删除 Key
- 不要在 GitHub Issue 里粘贴完整 API Key

## Scoring model

v1.8 score breakdown:

| Component | Weight |
|-----------|--------|
| Core compatibility | 25 |
| Usage transparency | 25 |
| Stability and latency | 25 |
| Model signal | 15 |
| Cache signal | 5 |
| Client config | 5 |

The score is based mainly on real request data. Model signal is treated as a risk signal, not as a definitive authenticity proof.

**中文：** 评分以真实请求数据为主，模型信号只作为风险信号，不作为真假证明。

### Model Signal (15 pts)

Model Signal includes 3 sub-parts:
- **Self-claim (6 pts):** Evaluates how the model self-reports its identity
- **Target consistency (4 pts):** Checks if the self-reported identity matches the target model
- **Capability smoke tests (5 pts):** Quick tests for JSON output, basic reasoning, and code identification

**Note:** Capability smoke tests are lightweight signal checks, NOT official benchmarks.

**中文：** 模型信号包括3个子项：
- **自报身份 (6分)：** 评估模型如何自报身份
- **目标一致性 (4分)：** 检查自报身份与目标模型是否一致
- **能力冒烟测试 (5分)：** JSON输出、基本推理、代码识别的快速测试

**注意：** 能力冒烟测试是轻量信号检查，不是官方基准测试。

## Local verification

Run deterministic local checks without real API keys:

```bash
node assets/verify-scoring-v17.js
node assets/test-mock-verify.js
node assets/verify-evidence.js
node assets/verify-identity.js
node assets/verify-model-signal-v18.js
node assets/verify-operational-risk-v19.js
node assets/verify-public-signals-v110.js
```

These scripts are deterministic local checks and do not require real API keys.

## Real API smoke test

```bash
node assets/run-tests.js
```

**Note:** This may call real API endpoints and should not be run in GitHub Actions CI.

**中文：** 该脚本可能请求真实 API，不应放入 GitHub Actions CI。

## Reporting issues

https://github.com/JustinXai/ai-api-doctor-site/issues

**Reminder:** Please mask API keys and Base URLs before posting screenshots.

## Security

See [SECURITY.md](SECURITY.md) for the security policy and recommended practices.

## License

MIT License — see [LICENSE](LICENSE) file for details.
