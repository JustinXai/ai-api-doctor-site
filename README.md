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
- model self-claim and target consistency
- stability and latency sampling
- Cline / Continue client config export

**中文补充：**

- Base URL 是否可访问
- API Key 是否能调用
- Model ID 是否可用
- 返回格式是否基本兼容 OpenAI-compatible
- usage / token 字段是否返回
- 缓存命中信号字段是否返回
- 模型响应自称与目标模型是否一致
- 轻量请求下的稳定性与延迟
- 是否能导出 Cline / Continue 配置

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

v1.7 score breakdown:

| Component | Weight |
|-----------|--------|
| Core compatibility | 25 |
| Usage transparency | 25 |
| Stability and latency | 25 |
| Model identity signal | 15 |
| Cache signal | 5 |
| Client config | 5 |

The score is based mainly on real request data. Model identity is treated as a risk signal, not as a definitive authenticity proof.

**中文：** 评分以真实请求数据为主，模型身份只作为风险信号，不作为真假证明。

## Local verification

Run deterministic local checks without real API keys:

```bash
node assets/verify-scoring-v17.js
node assets/test-mock-verify.js
node assets/verify-evidence.js
node assets/verify-identity.js
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
