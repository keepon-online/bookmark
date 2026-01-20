// 浏览器书签栏空文件夹清理工具
// 在浏览器扩展的 options.html Console 中运行

console.log('=== 浏览器书签栏空文件夹清理工具 ===\n');

// 工具1: 扫描浏览器书签栏，找出所有空文件夹
async function scanBrowserBookmarks() {
  console.log('🔍 扫描浏览器书签栏...\n');

  try {
    const tree = await chrome.bookmarks.getTree();
    const emptyFolders = [];

    // 递归扫描
    const scan = (node, path = []) => {
      const currentPath = [...path, node.title];

      if (!node.url && node.title) {
        // 这是一个文件夹
        const hasBookmarks = node.children && node.children.some(child => child.url);

        if (!hasBookmarks) {
          emptyFolders.push({
            id: node.id,
            title: node.title,
            path: currentPath.join(' > '),
            parentId: node.parentId,
            index: node.index,
            dateAdded: node.dateAdded,
          });
        }

        // 递归检查子文件夹
        if (node.children) {
          for (const child of node.children) {
            scan(child, currentPath);
          }
        }
      }
    };

    tree.forEach(scan);

    console.log(`找到 ${emptyFolders.length} 个空文件夹:\n`);

    if (emptyFolders.length === 0) {
      console.log('✅ 没有找到空文件夹！');
      return [];
    }

    // 按路径分组显示
    const groupedByPath = {};
    emptyFolders.forEach(folder => {
      const parentPath = folder.path.substring(0, folder.path.lastIndexOf(' > ')) || '书签栏';
      if (!groupedByPath[parentPath]) {
        groupedByPath[parentPath] = [];
      }
      groupedByPath[parentPath].push(folder);
    });

    Object.entries(groupedByPath).forEach(([path, folders]) => {
      console.log(`\n📁 ${path} (${folders.length}个):`);
      folders.forEach(f => {
        const date = new Date(f.dateAdded).toLocaleDateString();
        console.log(`  - ${f.title} (ID: ${f.id}, 创建于: ${date})`);
      });
    });

    return emptyFolders;
  } catch (error) {
    console.error('❌ 扫描失败:', error);
    return [];
  }
}

// 工具2: 预览清理结果（实际删除前先预览）
async function previewBrowserCleanup() {
  console.log('👁️ 预览浏览器书签栏清理...\n');

  const emptyFolders = await scanBrowserBookmarks();

  if (emptyFolders.length === 0) {
    return;
  }

  console.log('\n📊 预览统计:');
  console.log(`  - 将删除: ${emptyFolders.length} 个空文件夹`);
  console.log(`  - 影响范围: ${new Set(emptyFolders.map(f => f.parentId)).size} 个父文件夹`);

  return emptyFolders;
}

// 工具3: 删除浏览器书签栏中的空文件夹（递归删除）
async function cleanupBrowserBookmarks() {
  console.log('🗑️  清理浏览器书签栏空文件夹...\n');

  const emptyFolders = await scanBrowserBookmarks();

  if (emptyFolders.length === 0) {
    console.log('✅ 没有空文件夹需要清理！');
    return { deleted: 0, errors: [] };
  }

  // 确认删除
  const confirmed = confirm(`⚠️  确认要删除 ${emptyFolders.length} 个空文件夹吗？\n\n此操作不可撤销！建议先运行 previewBrowserCleanup() 查看预览。`);

  if (!confirmed) {
    console.log('❌ 操作已取消');
    return { deleted: 0, errors: ['操作已取消'] };
  }

  let deleted = 0;
  const errors: string[] = [];

  // 从最深层开始删除，避免父文件夹先被删除导致子文件夹路径改变
  const sortedByDepth = [...emptyFolders].sort((a, b) => {
    const aDepth = (a.path.match(/>/g) || []).length;
    const bDepth = (b.path.match(/>/g) || []).length;
    return bDepth - aDepth; // 从深层开始
  });

  console.log(`\n开始删除 ${sortedByDepth.length} 个文件夹...`);

  for (const folder of sortedByDepth) {
    try {
      await chrome.bookmarks.remove(folder.id);
      deleted++;
      console.log(`✓ 已删除: ${folder.title} (${folder.path})`);
    } catch (error) {
      const errorMsg = `删除失败 "${folder.title}": ${(error as Error).message}`;
      errors.push(errorMsg);
      console.error(`✗ ${errorMsg}`);
    }
  }

  console.log(`\n✅ 清理完成！`);
  console.log(`  - 已删除: ${deleted} 个`);
  console.log(`  - 失败: ${errors.length} 个`);

  if (errors.length > 0) {
    console.log('\n错误详情:');
    errors.forEach(e => console.log(`  - ${e}`));
  }

  return { deleted, errors };
}

// 工具4: 同步浏览器书签到扩展数据库
async function syncBrowserToExtension() {
  console.log('🔄 同步浏览器书签到扩展数据库...\n');

  try {
    const { bookmarkService } = await import('/src/services/index.js');
    const result = await bookmarkService.importFromBrowser();

    console.log('✅ 同步完成！');
    console.log(`  - 导入书签: ${result.imported}`);
    console.log(`  - 重复书签: ${result.duplicates}`);

    if (result.errors.length > 0) {
      console.log('\n错误:');
      result.errors.forEach(e => console.log(`  - ${e}`));
    }

    return result;
  } catch (error) {
    console.error('❌ 同步失败:', error);
    return null;
  }
}

// 工具5: 分析浏览器书签栏结构
async function analyzeBookmarkStructure() {
  console.log('📊 分析浏览器书签栏结构...\n');

  try {
    const tree = await chrome.bookmarks.getTree();
    const stats = {
      totalFolders: 0,
      emptyFolders: 0,
      totalBookmarks: 0,
      foldersByDepth: {},
    };

    const analyze = (node, depth = 0) => {
      if (!node.url && node.title) {
        stats.totalFolders++;

        const hasBookmarks = node.children && node.children.some(child => child.url);
        if (!hasBookmarks) {
          stats.emptyFolders++;
        }

        const depthKey = `深度${depth}`;
        stats.foldersByDepth[depthKey] = (stats.foldersByDepth[depthKey] || 0) + 1;

        if (node.children) {
          for (const child of node.children) {
            if (child.url) {
              stats.totalBookmarks++;
            } else {
              analyze(child, depth + 1);
            }
          }
        }
      }
    };

    tree.forEach(analyze);

    console.log('浏览器书签栏统计:');
    console.log(`  总文件夹数: ${stats.totalFolders}`);
    console.log(`  空文件夹数: ${stats.emptyFolders}`);
    console.log(`  总书签数: ${stats.totalBookmarks}`);
    console.log(`  空文件夹占比: ${((stats.emptyFolders / stats.totalFolders) * 100).toFixed(1)}%`);

    console.log('\n按深度分布:');
    Object.entries(stats.foldersByDepth).forEach(([depth, count]) => {
      console.log(`  ${depth}: ${count} 个文件夹`);
    });

    return stats;
  } catch (error) {
    console.error('❌ 分析失败:', error);
    return null;
  }
}

// 工具6: 智能清理（先扫描，显示预览，再删除）
async function smartCleanup() {
  console.log('🧠 智能清理流程\n');
  console.log('步骤 1/3: 扫描浏览器书签栏...\n');

  const emptyFolders = await scanBrowserBookmarks();

  if (emptyFolders.length === 0) {
    console.log('\n✅ 没有找到空文件夹，无需清理！');
    return;
  }

  console.log('\n步骤 2/3: 预览');
  console.log(`将删除 ${emptyFolders.length} 个空文件夹:\n`);

  // 按父路径分组显示
  const groupedByParent = {};
  emptyFolders.forEach(folder => {
    const parentPath = folder.path.substring(0, folder.path.lastIndexOf(' > ')) || '书签栏';
    if (!groupedByParent[parentPath]) {
      groupedByParent[parentPath] = [];
    }
    groupedByParent[parentPath].push(folder);
  });

  Object.entries(groupedByParent).forEach(([path, folders]) => {
    console.log(`\n📁 ${path}:`);
    folders.forEach(f => {
      console.log(`  - ${f.title}`);
    });
  });

  console.log(`\n步骤 3/3: 删除确认`);

  const continueCleanup = confirm(
    `将删除 ${emptyFolders.length} 个空文件夹\n\n` +
    `是否继续？`
  );

  if (!continueCleanup) {
    console.log('❌ 操作已取消');
    return;
  }

  // 执行删除
  const result = await cleanupBrowserBookmarks();

  return result;
}

// 主工具函数
async function main() {
  console.log('🚀 浏览器书签栏空文件夹清理工具\n');
  console.log('请选择操作:\n');
  console.log('1. scanBrowserBookmarks()        - 扫描空文件夹');
  console.log('2. previewBrowserCleanup()      - 预览清理结果');
  console.log('3. cleanupBrowserBookmarks()     - 执行清理');
  console.log('4. syncBrowserToExtension()      - 同步到扩展数据库');
  console.log('5. analyzeBookmarkStructure()   - 分析结构');
  console.log('6. smartCleanup()                - 智能清理（推荐）\n');
}

// 导出工具
window.browserCleanup = {
  main,
  scanBrowserBookmarks,
  previewBrowserCleanup,
  cleanupBrowserBookmarks,
  syncBrowserToExtension,
  analyzeBookmarkStructure,
  smartCleanup,
};

console.log('✅ 浏览器书签栏清理工具已加载！');
console.log('\n📖 推荐使用方法:');
console.log('  1. 查看结构: analyzeBookmarkStructure()');
console.log('  2. 智能清理: smartCleanup()');
console.log('  3. 手动操作: scanBrowserBookmarks() → previewBrowserCleanup() → cleanupBrowserBookmarks()');
console.log('\n⚡ 快速开始: smartCleanup()');

// 立即执行智能清理（可选）
// smartCleanup();
