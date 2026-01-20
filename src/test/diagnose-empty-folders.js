// 空文件夹清理诊断工具
// 在浏览器扩展的 options.html Console 中运行

console.log('=== 空文件夹清理诊断工具 ===\n');

// 诊断1：检查所有文件夹状态
async function diagnoseAllFolders() {
  console.log('\n📊 诊断1: 所有文件夹状态\n');

  const allFolders = await db.folders.toArray();
  const allBookmarks = await db.bookmarks.toArray();

  console.log(`总文件夹数: ${allFolders.length}`);
  console.log(`总书签数: ${allBookmarks.length}\n`);

  // 统计每个文件夹的书签数
  const folderBookmarksCount = new Map();
  allBookmarks.forEach(bookmark => {
    if (bookmark.folderId) {
      folderBookmarksCount.set(
        bookmark.folderId,
        (folderBookmarksCount.get(bookmark.folderId) || 0) + 1
      );
    }
  });

  // 构建文件夹树
  const folderChildren = new Map();
  allFolders.forEach(folder => {
    if (folder.parentId) {
      const children = folderChildren.get(folder.parentId) || new Set();
      children.add(folder.id);
      folderChildren.set(folder.parentId, children);
    }
  });

  // 递归计算后代数
  const calculateDescendants = (folderId) => {
    const children = folderChildren.get(folderId) || new Set();
    let count = children.size;
    children.forEach(childId => {
      count += calculateDescendants(childId);
    });
    return count;
  };

  // 分析每个文件夹
  const analysis = allFolders.map(folder => {
    const bookmarksCount = folderBookmarksCount.get(folder.id) || 0;
    const children = folderChildren.get(folder.id) || new Set();
    const allDescendants = calculateDescendants(folder.id);
    const age = Date.now() - folder.createdAt;
    const ageDays = Math.round(age / (24 * 60 * 60 * 1000));

    return {
      id: folder.id.substring(0, 8),
      name: folder.name,
      parentId: folder.parentId ? folder.parentId.substring(0, 8) : null,
      isSmart: folder.isSmartFolder,
      bookmarksCount,
      directChildren: children.size,
      allDescendants,
      isEmpty: bookmarksCount === 0,
      ageDays,
      ageHours: Math.round(age / (60 * 60 * 1000)),
    };
  });

  // 显示分析结果
  console.table(analysis);

  // 空文件夹统计
  const emptyFolders = analysis.filter(f => f.isEmpty);
  console.log(`\n空文件夹数: ${emptyFolders.length} / ${allFolders.length}`);

  if (emptyFolders.length > 0) {
    console.log('\n空文件夹列表:');
    emptyFolders.forEach(f => {
      console.log(`  - ${f.name} (${f.id})`);
      console.log(`    书签: ${f.bookmarksCount}, 子文件夹: ${f.directChildren}, 后代: ${f.allDescendants}, 年龄: ${f.ageDays}天`);
    });
  }

  return analysis;
}

// 诊断2：运行 findEmptyFolders 并查看结果
async function diagnoseFindEmptyFolders() {
  console.log('\n🔍 诊断2: findEmptyFolders 测试\n');

  const result = await folderService.findEmptyFolders({
    recursive: true,
    excludeRoot: true,
    minAge: 24 * 60 * 60 * 1000,
  });

  console.log(`找到 ${result.length} 个空文件夹:`);
  console.table(result.map(f => ({
    名称: f.folder.name,
    ID: f.folder.id.substring(0, 8),
    书签数: f.bookmarksCount,
    子文件夹: f.childrenCount,
    后代数: f.allDescendantsCount,
    为空: f.isEmpty,
    天数: Math.round(f.age / (24 * 60 * 60 * 1000)),
  })));

  return result;
}

// 诊断3：运行 previewEmptyFolders 并查看分类结果
async function diagnosePreviewEmptyFolders() {
  console.log('\n👁️  诊断3: previewEmptyFolders 测试\n');

  const result = await folderService.previewEmptyFolders({
    recursive: true,
    excludeRoot: true,
    minAge: 24 * 60 * 60 * 1000,
  });

  console.log(`预览结果:`);
  console.log(`  可删除: ${result.toDelete.length} 个`);
  console.log(`  需保留: ${result.toKeep.length} 个`);
  console.log(`  警告数: ${result.warnings.length} 个`);

  if (result.toDelete.length > 0) {
    console.log('\n可删除的文件夹:');
    result.toDelete.forEach(f => {
      console.log(`  ✓ ${f.folder.name} (${f.folder.id.substring(0, 8)})`);
    });
  }

  if (result.toKeep.length > 0) {
    console.log('\n需保留的文件夹:');
    result.toKeep.forEach(f => {
      const warning = result.warnings.find(w => w.includes(f.folder.name));
      console.log(`  ✗ ${f.folder.name} (${f.folder.id.substring(0, 8)})`);
      console.log(`    原因: ${warning}`);
    });
  }

  return result;
}

// 诊断4：手动测试删除单个文件夹
async function diagnoseSingleFolderDelete(folderName) {
  console.log(`\n🗑️  诊断4: 测试删除单个文件夹 "${folderName}"\n`);

  // 查找文件夹
  const allFolders = await db.folders.toArray();
  const folder = allFolders.find(f => f.name === folderName);

  if (!folder) {
    console.error(`❌ 找不到文件夹: ${folderName}`);
    return;
  }

  console.log(`找到文件夹:`, {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    isSmart: folder.isSmartFolder,
  });

  // 检查是否有书签
  const bookmarks = await db.bookmarks.where('folderId').equals(folder.id).toArray();
  console.log(`文件夹中的书签数: ${bookmarks.length}`);

  if (bookmarks.length > 0) {
    console.log('⚠️  文件夹不空，无法删除');
    console.log('书签列表:');
    bookmarks.forEach(b => console.log(`  - ${b.title}`));
    return;
  }

  // 检查是否有子文件夹
  const children = await db.folders.where('parentId').equals(folder.id).toArray();
  console.log(`子文件夹数: ${children.length}`);

  if (children.length > 0) {
    console.log('子文件夹列表:');
    children.forEach(c => console.log(`  - ${c.name} (${c.id.substring(0, 8)})`));
  }

  // 尝试删除
  try {
    console.log(`\n尝试删除文件夹...`);
    await folderService.delete(folder.id);
    console.log(`✅ 成功删除文件夹: ${folderName}`);
  } catch (error) {
    console.error(`❌ 删除失败:`, error);
  }
}

// 诊断5：检查特定文件夹是否真的是空的
async function diagnoseFolderDetails(folderName) {
  console.log(`\n🔬 诊断5: 检查文件夹详情 "${folderName}"\n`);

  const allFolders = await db.folders.toArray();
  const folder = allFolders.find(f => f.name === folderName);

  if (!folder) {
    console.error(`❌ 找不到文件夹: ${folderName}`);
    return null;
  }

  // 检查书签
  const bookmarks = await db.bookmarks.where('folderId').equals(folder.id).toArray();
  console.log(`直接书签数: ${bookmarks.length}`);
  bookmarks.forEach(b => {
    console.log(`  - ${b.title} (${b.url})`);
  });

  // 检查子文件夹
  const children = await db.folders.where('parentId').equals(folder.id).toArray();
  console.log(`直接子文件夹数: ${children.length}`);

  // 递归统计所有后代中的书签
  const countBookmarksInTree = async (folderId) => {
    let count = (await db.bookmarks.where('folderId').equals(folderId).toArray()).length;

    const children = await db.folders.where('parentId').equals(folderId).toArray();
    for (const child of children) {
      count += await countBookmarksInTree(child.id);
    }

    return count;
  };

  const totalBookmarks = await countBookmarksInTree(folder.id);
  console.log(`子树中的总书签数: ${totalBookmarks}`);

  return {
    folder,
    directBookmarks: bookmarks.length,
    totalBookmarks,
    childrenCount: children.length,
  };
}

// 主诊断流程
async function runDiagnostics() {
  console.log('🚀 开始完整诊断...\n');

  try {
    await diagnoseAllFolders();
    await diagnoseFindEmptyFolders();
    await diagnosePreviewEmptyFolders();

    console.log('\n✅ 诊断完成！');
    console.log('\n💡 提示:');
    console.log('  - 如果发现文件夹不应该是空的，可能是数据库中有隐藏的书签');
    console.log('  - 使用 diagnoseFolderDetails("文件夹名") 查看详细信息');
    console.log('  - 使用 diagnoseSingleFolderDelete("文件夹名") 测试删除');
  } catch (error) {
    console.error('\n❌ 诊断失败:', error);
  }
}

// 快速诊断
async function quickDiagnose() {
  console.log('🔍 快速诊断...\n');

  try {
    const emptyFolders = await folderService.findEmptyFolders({
      recursive: true,
      excludeRoot: true,
      minAge: 0, // 不过滤时间
    });

    const preview = await folderService.previewEmptyFolders({
      recursive: true,
      excludeRoot: true,
      minAge: 0,
    });

    console.log(`扫描结果:`);
    console.log(`  - 找到 ${emptyFolders.length} 个空文件夹`);
    console.log(`  - 可删除 ${preview.toDelete.length} 个`);
    console.log(`  - 需保留 ${preview.toKeep.length} 个`);

    if (preview.toKeep.length > 0) {
      console.log('\n保留原因:');
      preview.toKeep.slice(0, 5).forEach(f => {
        const warning = preview.warnings.find(w => w.includes(f.folder.name));
        console.log(`  - ${f.folder.name}: ${warning}`);
      });
    }

  } catch (error) {
    console.error('诊断失败:', error);
  }
}

// 导出诊断函数
window.diagnose = {
  runDiagnostics,
  quickDiagnose,
  diagnoseAllFolders,
  diagnoseFindEmptyFolders,
  diagnosePreviewEmptyFolders,
  diagnoseSingleFolderDelete,
  diagnoseFolderDetails,
};

console.log('✅ 诊断工具已加载');
console.log('\n📖 使用方法:');
console.log('  - runDiagnostics()        完整诊断');
console.log('  - quickDiagnose()           快速诊断');
console.log('  - diagnoseFolderDetails("文件夹名")  查看文件夹详情');
console.log('  - diagnoseSingleFolderDelete("文件夹名")  测试删除');
console.log('\n⚡ 快速开始: quickDiagnose()');
