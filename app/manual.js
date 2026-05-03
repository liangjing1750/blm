'use strict';

const MANUAL_RUNTIME_ERROR = '当前服务版本过旧，请重启 BLM 服务后再打开使用手册。';
const MANUAL_DOC_ID = 'user-manual';

function buildDocsAssetUrl(relativePath) {
  return `/api/docs/assets/${String(relativePath || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

function slugifyManualAnchor(value, fallback = 'section') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function rewriteManualRelativeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:|mailto:|#|\/)/i.test(raw)) return raw;
  return buildDocsAssetUrl(raw);
}

function renderManualInlineMarkdown(value) {
  const tokens = [];
  const pushToken = (html) => {
    const token = `@@MANUAL_INLINE_${tokens.length}@@`;
    tokens.push({ token, html });
    return token;
  };

  let text = String(value || '');
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => (
    pushToken(`<img src="${esc(String(src || '').trim())}" alt="${esc(alt || '')}">`)
  ));
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => (
    pushToken(`<a href="${esc(String(href || '').trim())}">${esc(label || '')}</a>`)
  ));
  text = text.replace(/`([^`]+)`/g, (_, code) => (
    pushToken(`<code>${esc(code || '')}</code>`)
  ));

  let html = esc(text);
  tokens.forEach(({ token, html: tokenHtml }) => {
    html = html.split(token).join(tokenHtml);
  });
  return html;
}

function renderBasicManualMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listItems = [];
  let listTag = 'ul';
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderManualInlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    html.push(`<${listTag}>${listItems.map((item) => (
      `<li>${renderManualInlineMarkdown(item)}</li>`
    )).join('')}</${listTag}>`);
    listItems = [];
  };

  const flushCodeBlock = () => {
    const className = codeLang ? ` class="language-${esc(codeLang)}"` : '';
    html.push(`<pre><code${className}>${esc(codeLines.join('\n'))}</code></pre>`);
    inCodeBlock = false;
    codeLang = '';
    codeLines = [];
  };

  const pushListItem = (tagName, content) => {
    if (listItems.length && listTag !== tagName) {
      flushList();
    }
    listTag = tagName;
    listItems.push(content);
  };

  lines.forEach((line) => {
    const fence = line.match(/^```\s*([A-Za-z0-9_-]*)\s*$/);
    if (fence) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushParagraph();
        flushList();
        inCodeBlock = true;
        codeLang = fence[1] || '';
        codeLines = [];
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderManualInlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      pushListItem('ul', bullet[1]);
      return;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      pushListItem('ol', ordered[1]);
      return;
    }

    paragraph.push(line.trim());
  });

  if (inCodeBlock) flushCodeBlock();
  flushParagraph();
  flushList();

  return html.join('\n');
}

function buildManualRenderedState(docId, markdown) {
  const rawHtml = window.markedLib
    ? window.markedLib.parse(markdown || '')
    : renderBasicManualMarkdown(markdown || '');
  const host = document.createElement('div');
  host.innerHTML = rawHtml;

  const outline = [];
  const images = [];

  host.querySelectorAll('h1, h2, h3, h4').forEach((heading, index) => {
    const label = String(heading.textContent || '').trim();
    const id = `manual-${slugifyManualAnchor(`${docId}-${label}-${index}`, 'section')}`;
    heading.id = id;
    outline.push({
      id,
      label: label || `章节 ${index + 1}`,
      depth: Math.max(Number(heading.tagName.slice(1)) - 1, 0),
    });
  });

  host.querySelectorAll('pre > code.language-mermaid').forEach((codeBlock, index) => {
    const pre = codeBlock.parentElement;
    if (!pre) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'manual-mermaid';
    wrapper.setAttribute(
      'data-manual-mermaid',
      encodeURIComponent(String(codeBlock.textContent || '').trim()),
    );
    wrapper.id = `manual-mermaid-${docId}-${index + 1}`;
    pre.replaceWith(wrapper);
  });

  host.querySelectorAll('img').forEach((image, index) => {
    const figureId = `manual-image-${docId}-${index + 1}`;
    const alt = String(image.getAttribute('alt') || '').trim() || `图示 ${index + 1}`;
    const resolvedSrc = rewriteManualRelativeUrl(image.getAttribute('src'));
    image.setAttribute('src', resolvedSrc);
    image.setAttribute('alt', alt);
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');

    let figure = image.closest('figure');
    if (!figure) {
      figure = document.createElement('figure');
      image.replaceWith(figure);
      figure.appendChild(image);
    }
    figure.classList.add('manual-figure');
    figure.id = figureId;

    let caption = figure.querySelector('figcaption');
    if (!caption && alt) {
      caption = document.createElement('figcaption');
      caption.textContent = alt;
      figure.appendChild(caption);
    }

    images.push({
      id: figureId,
      label: alt,
      src: resolvedSrc,
    });
  });

  host.querySelectorAll('a[href]').forEach((link) => {
    const href = String(link.getAttribute('href') || '').trim();
    if (!href) return;
    link.setAttribute('href', rewriteManualRelativeUrl(href));
    if (/^https?:/i.test(href)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return {
    html: host.innerHTML,
    outline,
    images,
  };
}

function renderManualMermaid() {
  const blocks = document.querySelectorAll('.manual-mermaid[data-manual-mermaid]');
  blocks.forEach(async (block) => {
    const encoded = block.getAttribute('data-manual-mermaid') || '';
    const code = decodeURIComponent(encoded);
    if (!code) return;
    if (!window.mermaidLib) {
      block.innerHTML = `<pre class="md-code">${esc(code)}</pre>`;
      return;
    }
    try {
      const { svg } = await window.mermaidLib.render(
        `manual-mermaid-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        code,
      );
      block.innerHTML = svg;
    } catch (_) {
      block.innerHTML = `<pre class="md-code">${esc(code)}</pre>`;
    }
  });
}

function manualJumpTo(anchorId) {
  const target = document.getElementById(anchorId);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildManualOutlineGroups() {
  const groups = [];
  let currentGroup = null;
  let fallbackGroupIndex = 0;

  for (const item of (S.manual.outline || [])) {
    if (!item || !item.id) continue;
    if (item.depth <= 0) continue;
    if (item.depth === 1) {
      currentGroup = {
        id: item.id,
        label: item.label,
        children: [],
      };
      groups.push(currentGroup);
      continue;
    }
    if (!currentGroup) {
      currentGroup = {
        id: `manual-outline-group-${fallbackGroupIndex += 1}`,
        label: '核心功能',
        children: [],
      };
      groups.push(currentGroup);
    }
    currentGroup.children.push({
      ...item,
      depth: item.depth - 1,
    });
  }

  return groups;
}

function isManualOutlineGroupCollapsed(groupId) {
  return S.manual.collapsedGroups?.[groupId] !== false;
}

function toggleManualOutlineGroup(groupId) {
  if (!groupId) return;
  if (!S.manual.collapsedGroups) S.manual.collapsedGroups = {};
  S.manual.collapsedGroups[groupId] = !isManualOutlineGroupCollapsed(groupId);
  if (S.ui.tab === 'manual') renderManualTab();
}

function getActiveManualDoc() {
  const docs = Array.isArray(S.manual.docs) ? S.manual.docs : [];
  return docs.find((doc) => String(doc?.id || '') === S.manual.activeDocId) || null;
}

function renderManualDocList() {
  if (S.manual.error) {
    return `<div class="manual-empty-hint manual-error-hint">${esc(S.manual.error)}</div>`;
  }
  const docs = Array.isArray(S.manual.docs) ? S.manual.docs : [];
  if (!docs.length) {
    return '<div class="manual-empty-hint">正在加载文档列表...</div>';
  }
  return docs.map((doc) => {
    const docId = String(doc?.id || '').trim();
    if (!docId) return '';
    const active = docId === S.manual.activeDocId;
    return `
      <button
        type="button"
        class="manual-doc-button ${active ? 'active' : ''}"
        data-testid="manual-doc-button"
        data-doc-id="${esc(docId)}"
        onclick="openManualDoc('${esc(docId)}')"
      >
        <span class="manual-doc-button-title">${esc(doc.title || docId)}</span>
      </button>`;
  }).join('');
}

function renderManualOutlineList() {
  if (S.manual.error) {
    return `<div class="manual-empty-hint manual-error-hint">${esc(S.manual.error)}</div>`;
  }
  if (S.manual.loading) {
    return '<div class="manual-empty-hint">正在生成目录...</div>';
  }
  const groups = buildManualOutlineGroups();
  if (!groups.length) {
    return '<div class="manual-empty-hint">当前文档暂无目录项。</div>';
  }
  return groups.map((group) => {
    const collapsed = isManualOutlineGroupCollapsed(group.id);
    const childrenHtml = group.children.map((item) => `
      <button
        type="button"
        class="manual-outline-link depth-${Math.min(item.depth + 1, 3)}"
        onclick="manualJumpTo('${esc(item.id)}')"
      >${esc(item.label)}</button>`).join('');
    return `
      <div class="manual-outline-group">
        <div class="manual-outline-group-head">
          <button
            type="button"
            class="manual-outline-toggle"
            onclick="toggleManualOutlineGroup('${esc(group.id)}')"
            aria-label="${collapsed ? '展开目录' : '折叠目录'}"
          >${collapsed ? '▸' : '▾'}</button>
          <button
            type="button"
            class="manual-outline-link depth-1 group-link"
            onclick="manualJumpTo('${esc(group.id)}')"
          >${esc(group.label)}</button>
        </div>
        <div class="manual-outline-children ${collapsed ? 'collapsed' : ''}">
          ${childrenHtml}
        </div>
      </div>`;
  }).join('');
}

function returnFromManual() {
  if (typeof goBackNavigation === 'function' && goBackNavigation()) return;
  navigate('domain', {}, { recordHistory: false });
}

function renderManualTab() {
  const container = document.getElementById('tab-content');
  if (!container) return;
  const title = S.manual.activeTitle || '用户手册';
  const activeDoc = getActiveManualDoc();
  const introHtml = (!S.manual.loading && !S.manual.error && activeDoc?.summary)
    ? `<p class="manual-doc-intro" data-testid="manual-doc-intro">${esc(activeDoc.summary)}</p>`
    : '';
  const contentHtml = S.manual.loading
    ? '<div class="manual-loading">正在加载文档内容...</div>'
    : (S.manual.error
      ? `<div class="manual-loading manual-error-hint">${esc(S.manual.error)}</div>`
      : (S.manual.html || '<div class="manual-loading">正在准备文档内容...</div>'));

  container.innerHTML = `
    <div class="manual-wrap" data-testid="manual-tab">
      <div class="manual-body">
        <aside class="manual-nav">
          <section class="manual-panel">
            <div class="manual-panel-title">文档</div>
            <div class="manual-doc-list" data-testid="manual-doc-list">${renderManualDocList()}</div>
          </section>
          <section class="manual-panel">
            <div class="manual-panel-title">目录</div>
            <div class="manual-outline-list">${renderManualOutlineList()}</div>
          </section>
        </aside>
        <section class="manual-reader">
          <div class="manual-reader-head">
            <h2 id="manual-current-title" data-testid="manual-title">${esc(title)}</h2>
            <button
              type="button"
              class="btn btn-outline manual-back-button"
              data-testid="manual-back-button"
              onclick="returnFromManual()"
            >← 返回编辑</button>
          </div>
          <article id="manual-content" class="manual-article">${introHtml}${contentHtml}</article>
        </section>
      </div>
    </div>`;

  if (!S.manual.loading && S.manual.html) {
    requestAnimationFrame(() => {
      if (S.ui.tab !== 'manual') return;
      renderManualMermaid();
    });
  }
}

async function ensureManualDocsLoaded() {
  if (S.runtime.checked && !S.runtime.supportsDocs) {
    S.manual.error = MANUAL_RUNTIME_ERROR;
    return false;
  }
  S.manual.loading = true;
  if (S.ui.tab === 'manual') renderManualTab();
  if (!S.runtime.checked) {
    const runtime = await api.runtime();
    S.runtime.checked = true;
    S.runtime.apiVersion = Number(runtime?.api_version || 0);
    S.runtime.supportsDocs = !!runtime?.supports_docs;
    if (!S.runtime.supportsDocs) {
      S.manual.loading = false;
      S.manual.error = MANUAL_RUNTIME_ERROR;
      if (S.ui.tab === 'manual') renderManualTab();
      return false;
    }
  }
  if (!Array.isArray(S.manual.docs) || !S.manual.docs.length) {
    try {
      const docs = await api.docs();
      S.manual.docs = Array.isArray(docs) ? docs : [];
    } catch (error) {
      S.manual.docs = [];
      S.manual.error = error?.message || '文档列表加载失败';
      S.manual.loading = false;
      if (S.ui.tab === 'manual') renderManualTab();
      return false;
    }
  }
  return true;
}

async function openManualDoc(docId) {
  const normalizedId = String(docId || MANUAL_DOC_ID).trim() || MANUAL_DOC_ID;
  S.manual.activeDocId = normalizedId;
  S.manual.loading = true;
  if (S.ui.tab === 'manual') renderManualTab();
  const result = await api.doc(normalizedId);
  if (result.error) {
    S.manual.loading = false;
    S.manual.error = result.error === 'not found' ? MANUAL_RUNTIME_ERROR : result.error;
    if (S.ui.tab === 'manual') renderManualTab();
    return;
  }

  const rendered = buildManualRenderedState(normalizedId, result.content || '');
  S.manual.activeDocId = result.id || normalizedId;
  S.manual.activeTitle = result.title || '用户手册';
  S.manual.activeSummary = result.summary || '';
  S.manual.html = rendered.html;
  S.manual.outline = rendered.outline;
  S.manual.images = rendered.images;
  S.manual.collapsedGroups = {};
  S.manual.loading = false;
  S.manual.error = '';
  if (S.ui.tab === 'manual') renderManualTab();
}

async function bootManualTab() {
  const runtimeReady = await ensureManualDocsLoaded();
  if (!runtimeReady) {
    S.manual.loading = false;
    if (S.ui.tab === 'manual') renderManualTab();
    return;
  }
  const targetDocId = S.manual.activeDocId || MANUAL_DOC_ID;
  if (S.manual.activeDocId === targetDocId && S.manual.html && !S.manual.error) {
    if (S.ui.tab === 'manual') renderManualTab();
    return;
  }
  await openManualDoc(targetDocId);
}

window.renderManualTab = renderManualTab;
window.bootManualTab = bootManualTab;
window.openManualDoc = openManualDoc;
window.manualJumpTo = manualJumpTo;
window.toggleManualOutlineGroup = toggleManualOutlineGroup;
window.returnFromManual = returnFromManual;
