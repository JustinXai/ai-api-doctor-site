/**
 * AI API Doctor — Manual Report Generator
 * website/assets/report.js
 *
 * Uses html-to-image (CDN) for image export.
 * Implements: getFormData, calculateReport, renderReport,
 *   copyProviderText, saveReportImage, shareReport, resetForm,
 *   saveFormToLocalStorage, restoreFormFromLocalStorage.
 */

'use strict';

/* ── Constants ─────────────────────────────────────────── */
const STORAGE_KEY = 'aiapidoctor_report_form';

/* ── Result metadata ─────────────────────────────────── */
const RESULT_META = {
  failed_request_not_charged: {
    status: 'ok', label: '正常', icon: '✓',
    title: '失败请求未扣费',
    detail: '请求失败，但 10 秒后原始额度未减少。'
  },
  precharge_refunded: {
    status: 'ok', label: '正常', icon: '✓',
    title: '预扣已返还',
    detail: '请求后曾预扣额度，但 10 秒内已返还。'
  },
  raw_quota_unavailable: {
    status: 'warning', label: '风险', icon: '!',
    title: '无法读取原始余额',
    detail: '无法读取 raw quota，本次只能作为风险参考。'
  },
  failed_request_charged: {
    status: 'danger', label: '异常', icon: '✕',
    title: '失败请求扣费异常',
    detail: '请求失败且无有效输出，但 10 秒后 raw quota 减少。'
  },
  empty_response_charged: {
    status: 'danger', label: '异常', icon: '✕',
    title: '空回复扣费异常',
    detail: '请求无有效输出，但 10 秒后 raw quota 减少。'
  }
};

/* ── Form data extraction ─────────────────────────────── */
function getFormData() {
  const get = id => document.getElementById(id);
  return {
    resultType:   get('resultType').value,
    baseUrl:      get('baseUrl').value.trim(),
    modelName:    get('modelName').value.trim(),
    interfaceType:get('interfaceType').value,
    httpStatus:   get('httpStatus').value,
    beforeRaw:    get('beforeRaw').value,
    after3Raw:    get('after3Raw').value,
    after10Raw:   get('after10Raw').value,
    quotaPerUnit: parseInt(get('quotaPerUnit').value) || 500000,
    completionTokens: get('completionTokens').value,
    totalTokens:  get('totalTokens').value,
    requestId:    get('requestId').value.trim(),
    note:         get('note').value.trim()
  };
}

/* ── Calculate report data ─────────────────────────────── */
function calculateReport(data) {
  const beforeRaw = parseInt(data.beforeRaw) || 0;
  const after10Raw = parseInt(data.after10Raw) || 0;
  const after3Raw = parseInt(data.after3Raw) || 0;
  const httpStatus = parseInt(data.httpStatus) || 0;

  const delta10 = beforeRaw - after10Raw; // positive = charged
  const usd = delta10 > 0 ? (delta10 / data.quotaPerUnit).toFixed(6) : '0.000000';

  let evidenceCompleteness = 20; // %
  if (beforeRaw && after10Raw) {
    evidenceCompleteness = httpStatus ? 100 : 85;
  } else if (beforeRaw || after10Raw) {
    evidenceCompleteness = 50;
  }

  return {
    delta10,
    usd,
    evidenceCompleteness,
    beforeRaw,
    after10Raw,
    after3Raw,
    httpStatus,
    meta: RESULT_META[data.resultType] || RESULT_META.failed_request_not_charged,
    timestamp: new Date().toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
  };
}

/* ── Render report card ─────────────────────────────────── */
function renderReport() {
  const data = getFormData();
  const report = calculateReport(data);
  const card = document.getElementById('report-card');
  if (!card) return;

  const { meta, delta10, usd, evidenceCompleteness, beforeRaw, after10Raw, after3Raw, httpStatus, timestamp } = report;
  const deltaClass = delta10 > 0 ? 'var(--danger)' : 'var(--success)';
  const deltaText = delta10 > 0 ? `最终减少：${formatNum(delta10)} quota` : '最终变化：+0 quota';
  const usdText = delta10 > 0 ? `约合金额：$${usd}` : '约合金额：$0.000000';

  const progressClass = evidenceCompleteness >= 85 ? 'green' : evidenceCompleteness >= 50 ? 'orange' : 'gray';
  const scoreColor = evidenceCompleteness >= 85 ? 'var(--success)' : evidenceCompleteness >= 50 ? 'var(--warning)' : 'var(--muted)';

  const hasRaw = beforeRaw || after10Raw;
  const httpColor = httpStatus >= 400 ? 'var(--danger)' : 'var(--text)';
  const evidenceSection = hasRaw ? `
    <div class="evidence-chain">
      <div class="evidence-node">
        <div class="evidence-node__label">检测前</div>
        <div class="evidence-node__value">${beforeRaw ? formatNum(beforeRaw) : '—'}</div>
      </div>
      <div class="evidence-arrow">→</div>
      <div class="evidence-node">
        <div class="evidence-node__label">HTTP</div>
        <div class="evidence-node__value" style="color:${httpColor}">${httpStatus || '—'}</div>
      </div>
      ${after3Raw ? `<div class="evidence-arrow">→</div><div class="evidence-node"><div class="evidence-node__label">3 秒后</div><div class="evidence-node__value">${formatNum(after3Raw)}</div></div>` : ''}
      <div class="evidence-arrow">→</div>
      <div class="evidence-node">
        <div class="evidence-node__label">10 秒后</div>
        <div class="evidence-node__value">${after10Raw ? formatNum(after10Raw) : '—'}</div>
      </div>
    </div>` : `
    <div class="evidence-chain">
      <div class="evidence-node" style="border-color:#cbd5e1">
        <div class="evidence-node__label" style="color:var(--muted)">原始额度证据链未建立</div>
      </div>
    </div>`;

  const verdictStatusClass = `verdict--${meta.status}`;

  card.innerHTML = `
    <div class="report-header">
      <div>
        <div class="report-header__brand">AI API Doctor</div>
        <div class="report-header__sub">扣费异常检测报告</div>
      </div>
      <div class="report-header__meta">
        <div>API Key 未包含</div>
        <div>手动报告</div>
      </div>
    </div>

    <div class="verdict-hero verdict--${meta.status}">
      <div class="verdict-hero__status">${meta.icon} ${meta.label}</div>
      <div class="verdict-hero__title">${meta.title}</div>
      <div class="verdict-hero__detail">${meta.detail}</div>
    </div>

    <div class="delta-section">
      <div class="delta-section__label">${delta10 > 0 ? '最终减少' : '最终变化'}</div>
      <div class="delta-section__value" style="color:${deltaClass}">
        ${delta10 > 0 ? '−' : '+'}${delta10 > 0 ? formatNum(delta10) : '0'}
        <span class="delta-section__unit">quota</span>
      </div>
      <div class="delta-section__usd">${usdText}</div>
    </div>

    <div class="score-section">
      <div class="score-section__label">证据完整度</div>
      <div class="progress-bar">
        <div class="progress-bar__fill progress-bar__fill--${progressClass}" style="width:${evidenceCompleteness}%"></div>
      </div>
      <div class="score-section__pct" style="color:${scoreColor}">${evidenceCompleteness}%</div>
    </div>

    ${evidenceSection}

    <div class="tech-grid">
      <div class="tech-item">
        <span class="tech-item__label">Base URL</span>
        <span class="tech-item__value" style="font-size:12px">${escHtml(data.baseUrl) || '—'}</span>
      </div>
      <div class="tech-item">
        <span class="tech-item__label">模型</span>
        <span class="tech-item__value">${escHtml(data.modelName) || '—'}</span>
      </div>
      <div class="tech-item">
        <span class="tech-item__label">接口</span>
        <span class="tech-item__value">${data.interfaceType}</span>
      </div>
      <div class="tech-item">
        <span class="tech-item__label">HTTP 状态</span>
        <span class="tech-item__value" style="color:${httpColor}">${httpStatus || '—'}</span>
      </div>
      ${data.requestId ? `<div class="tech-item"><span class="tech-item__label">request_id</span><span class="tech-item__value">${escHtml(data.requestId)}</span></div>` : ''}
      ${data.completionTokens !== '' ? `<div class="tech-item"><span class="tech-item__label">completion_tokens</span><span class="tech-item__value">${data.completionTokens}</span></div>` : ''}
      ${data.totalTokens !== '' ? `<div class="tech-item"><span class="tech-item__label">total_tokens</span><span class="tech-item__value">${data.totalTokens}</span></div>` : ''}
      <div class="tech-item">
        <span class="tech-item__label">时间</span>
        <span class="tech-item__value">${timestamp}</span>
      </div>
    </div>

    ${data.note ? `<div style="background:var(--soft);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--muted);line-height:1.6"><strong>备注：</strong>${escHtml(data.note)}</div>` : ''}

    <div class="safety-note">本报告不包含 API Key，只展示本次测试中的可复现信号，不证明服务商故意多扣费。</div>

    <div class="report-footer">
      <span>由 AI API Doctor 生成</span>
      <span>aiapidoctor.com</span>
    </div>
  `;

  // Enable save button
  const btn = document.getElementById('btn-save');
  if (btn) btn.disabled = false;

  // Auto-save form to localStorage
  saveFormToLocalStorage(data);
}

/* ── Copy provider text ─────────────────────────────────── */
function copyProviderText() {
  const data = getFormData();
  const report = calculateReport(data);
  const { meta, delta10, usd, evidenceCompleteness, beforeRaw, after10Raw, after3Raw, httpStatus, timestamp } = report;

  const deltaText = delta10 > 0 ? `最终减少：${formatNum(delta10)} quota` : '最终变化：+0 quota';
  const usdText = delta10 > 0 ? `约合金额：$${usd}` : '约合金额：$0.000000';

  const text = [
    'AI API Doctor 扣费检测报告',
    '',
    `结论：${meta.title}`,
    `说明：${meta.detail}`,
    '',
    `Base URL：${data.baseUrl || '—'}`,
    `模型：${data.modelName || '—'}`,
    `接口：${data.interfaceType}`,
    `HTTP 状态：${httpStatus || '—'}`,
    data.requestId ? `request_id：${data.requestId}` : '',
    '',
    '原始额度：',
    `  - 检测前 raw quota：${beforeRaw ? formatNum(beforeRaw) : '—'}`,
    `  - 3 秒后 raw quota：${after3Raw ? formatNum(after3Raw) : '—'}`,
    `  - 10 秒后 raw quota：${after10Raw ? formatNum(after10Raw) : '—'}`,
    `  - ${deltaText}`,
    `  - ${usdText}`,
    '',
    `证据完整度：${evidenceCompleteness}%`,
    '',
    '安全说明：',
    '本报告不包含 API Key，只展示本次测试中的可复现信号，不证明服务商故意多扣费。',
    '',
    'Generated by AI API Doctor',
    'https://aiapidoctor.com'
  ].filter(Boolean).join('\n');

  copyToClipboard(text, '已复制报告文本');
}

/* ── Save image ──────────────────────────────────────────── */
async function saveReportImage() {
  const btn = document.getElementById('btn-save');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = '正在生成图片...';

  try {
    await new Promise(requestAnimationFrame);
    await document.fonts.ready.catch(() => undefined);

    const card = document.getElementById('report-card');
    if (!card) {
      showToast('报告节点不存在，请刷新页面重试。', 'error');
      return;
    }

    const dataUrl = await exportReportImage(card, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#F8FAFC'
    });

    downloadDataUrl(dataUrl, `aiapidoctor-report-${Date.now()}.png`);
    showToast('报告图片已保存');
  } catch (err) {
    // Fallback: pixelRatio 1
    try {
      const card = document.getElementById('report-card');
      const dataUrl = await exportReportImage(card, {
        pixelRatio: 1,
        cacheBust: true,
        backgroundColor: '#F8FAFC'
      });
      downloadDataUrl(dataUrl, `aiapidoctor-report-${Date.now()}.png`);
      showToast('报告图片已保存');
    } catch (err2) {
      // Fallback: toBlob
      try {
        const card = document.getElementById('report-card');
        const blob = await exportReportBlob(card, {
          pixelRatio: 1,
          cacheBust: true,
          backgroundColor: '#F8FAFC'
        });
        const url = URL.createObjectURL(blob);
        downloadBlob(url, `aiapidoctor-report-${Date.now()}.png`, blob);
        URL.revokeObjectURL(url);
        showToast('报告图片已保存');
      } catch (err3) {
        console.error(err3.message);
        showToast('图片生成失败，请使用浏览器截图或复制报告文本。');
      }
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

/* ── Share report ────────────────────────────────────────── */
async function shareReport() {
  const data = getFormData();
  const report = calculateReport(data);
  const { meta, delta10, usd } = report;
  const deltaText = delta10 > 0 ? `最终减少：${formatNum(delta10)} quota` : '最终变化：+0 quota';
  const usdText = delta10 > 0 ? `约合金额：$${usd}` : '约合金额：$0.000000';
  const shareText = `AI API Doctor 扣费检测报告\n结论：${meta.title}\n${deltaText}\n${usdText}\nhttps://aiapidoctor.com/report/`;

  // Try to generate image blob
  let imageBlob = null;
  try {
    const card = document.getElementById('report-card');
    await new Promise(requestAnimationFrame);
    await document.fonts.ready.catch(() => undefined);
    imageBlob = await exportReportBlob(card, { pixelRatio: 1, cacheBust: true, backgroundColor: '#F8FAFC' });
  } catch (_) { /* no image */ }

  if (imageBlob && navigator.canShare && navigator.canShare({ files: [new File([imageBlob], 'report.png', { type: 'image/png' })] })) {
    const file = new File([imageBlob], 'aiapidoctor-report.png', { type: 'image/png' });
    try {
      await navigator.share({ title: 'AI API Doctor 扣费检测报告', text: shareText, files: [file] });
      return;
    } catch (err) { if (err.name !== 'AbortError') console.error(err.message); }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: 'AI API Doctor 扣费检测报告', text: shareText, url: 'https://aiapidoctor.com/report/' });
      return;
    } catch (err) { if (err.name !== 'AbortError') console.error(err.message); }
  }

  copyProviderText();
}

/* ── Reset form ──────────────────────────────────────────── */
function resetForm() {
  const fields = ['baseUrl', 'modelName', 'interfaceType', 'httpStatus', 'beforeRaw', 'after3Raw', 'after10Raw', 'quotaPerUnit', 'completionTokens', 'totalTokens', 'requestId', 'note'];
  const defaults = {
    baseUrl: 'https://api.example.com/v1',
    modelName: 'gpt-4o',
    interfaceType: 'OpenAI Chat',
    httpStatus: '503',
    beforeRaw: '99817234',
    after3Raw: '',
    after10Raw: '99817234',
    quotaPerUnit: '500000',
    completionTokens: '0',
    totalTokens: '0',
    requestId: '',
    note: ''
  };
  document.getElementById('resultType').value = 'failed_request_not_charged';
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = defaults[id] || '';
  });
  localStorage.removeItem(STORAGE_KEY);
  renderReport();
  showToast('表单已重置');
}

function clearLocalForm() {
  localStorage.removeItem(STORAGE_KEY);
  showToast('本地表单数据已清除');
}

/* ── LocalStorage ────────────────────────────────────────── */
function saveFormToLocalStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

function restoreFormFromLocalStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const data = JSON.parse(saved);
    if (!data || typeof data !== 'object') return;
    const map = { resultType: 'resultType', baseUrl: 'baseUrl', modelName: 'modelName', interfaceType: 'interfaceType', httpStatus: 'httpStatus', beforeRaw: 'beforeRaw', after3Raw: 'after3Raw', after10Raw: 'after10Raw', quotaPerUnit: 'quotaPerUnit', completionTokens: 'completionTokens', totalTokens: 'totalTokens', requestId: 'requestId', note: 'note' };
    Object.entries(map).forEach(([formId, key]) => {
      const el = document.getElementById(formId);
      if (el && data[key] !== undefined) el.value = data[key];
    });
  } catch (_) {}
}

/* ── Utility ─────────────────────────────────────────────── */
function formatNum(n) {
  return Number(n).toLocaleString('en-US');
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function copyToClipboard(text, successMsg) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast(successMsg || '已复制')).catch(() => showToast('复制失败，请手动复制。'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); showToast(successMsg || '已复制'); } catch (_) { showToast('复制失败，请手动复制。'); }
    document.body.removeChild(ta);
  }
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

function downloadBlob(blobUrl, filename, blob) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = blobUrl;
  link.click();
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

/**
 * html-to-image wrapper: tries toPng, falls back to toBlob.
 * Expects htmlToImage (global) to be loaded via CDN.
 */
async function exportReportImage(node, opts) {
  if (typeof htmlToImage !== 'undefined' && typeof htmlToImage.toPng === 'function') {
    return await htmlToImage.toPng(node, opts);
  }
  throw new Error('html-to-image not available');
}

async function exportReportBlob(node, opts) {
  if (typeof htmlToImage !== 'undefined' && typeof htmlToImage.toBlob === 'function') {
    return await htmlToImage.toBlob(node, opts);
  }
  throw new Error('html-to-image not available');
}
