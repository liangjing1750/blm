/**
 * 导出合并片段测试工具。
 *
 * 使用:
 *   在浏览器 DevTools 中打开预览页后运行:
 *     (await import('src/app/core/export/fragments/merge-test')).testMerge();
 *
 * 会依次:
 *   1. 打印所有 exporter 的 getContent() 结构
 *   2. 尝试捕获截图（DOM 不存在时降级为占位图）
 *   3. 合并为一份 DOCX 并自动下载
 */
export async function testMerge(): Promise<void> {
  const { PanoramaExporter } = await import('../exporters/panorama-exporter');
  const { RoleExporter } = await import('../exporters/role-exporter');
  const { buildMarkdown } = await import('./md-fragment');
  const { buildDocxFragment } = await import('./docx-fragment');
  const { FragmentAssembler } = await import('./fragment-assembler');
  const { downloadBlob } = await import('../export-builders');

  // 从 runtime 或 __ngDocument 获取文档；DevTools 中运行时需确保 window.__ngDocument 已设置
  const doc = (window as any).__ngDocument || (window as any).__blmDocument || { stages: [], roles: [], panorama: { columns: [], lanes: [] } };
  const pano = new PanoramaExporter(doc);
  const role = new RoleExporter(doc);
  const exporters = [pano, role];
  const assembler = new FragmentAssembler();

  // ── 1. getContent() 结构 ──
  console.log('[导出测试] ========== 1. getContent 结构 ==========');
  const contents = exporters.map(ex => {
    const c = ex.getContent();
    console.log(`[${ex.label}] ${c.sections.length} sections:`);
    c.sections.forEach((s, i) => {
      const preview = s.type === 'image' ? '📷 截图' : (s.text || '').slice(0, 60) || '(空)';
      console.log(`  [${i}] ${s.type}: ${preview}`);
    });
    return c;
  });

  // ── 2. MD 文本预览 ──
  console.log('[导出测试] ========== 2. Markdown 输出预览 ==========');
  for (let i = 0; i < contents.length; i++) {
    const md = buildMarkdown(contents[i]);
    console.log(`[${exporters[i].label}] MD ${md.length} chars`);
    console.log(md.slice(0, 400));
    console.log('...');
  }

  // ── 3. 捕获截图（失败时创建空占位图） ──
  console.log('[导出测试] ========== 3. 捕获截图 ==========');
  const allScreenshots: Uint8Array[][] = [];
  for (const ex of exporters) {
    try {
      const png = await ex.capture();
      console.log(`[${ex.label}] 截图成功: ${png.length} bytes`);
      allScreenshots.push([png]);
    } catch (err) {
      console.warn(`[${ex.label}] 截图失败，使用占位图:`, err);
      // 1x1 PNG 占位
      const placeholder = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG header
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0x60, 0x00,
        0x00, 0x00, 0x04, 0x00, 0x01, 0x27, 0x34, 0x27,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND
        0xAE, 0x42, 0x60, 0x82,
      ]);
      allScreenshots.push([placeholder]);
    }
  }

  // ── 4. 合并为 DOCX ──
  console.log('[导出测试] ========== 4. 合并为 DOCX ==========');
  const docxBlob = await assembler.assembleAllDocx(contents, allScreenshots);
  console.log(`[导出测试] 生成文件: ${docxBlob.size} bytes`);

  // ── 5. 下载 ──
  downloadBlob(docxBlob, '合并测试-全景+角色.docx');
  console.log('[导出测试] ✅ 完成！已下载合并文档');
}

// 暴露到 window 方便 DevTools 调用
(window as any).__testMerge = testMerge;
