// 清理空文件夹功能 - 浏览器测试脚本
// 在浏览器扩展的 options.html 或 sidepanel.html 的 Console 中运行

console.log('=== 清理空文件夹功能测试 ===\n');

// 测试1: 创建测试数据
async function createTestData() {
  console.log('📝 创建测试数据...');

  // 创建5个空文件夹
  for (let i = 1; i <= 5; i++) {
    await folderService.create({ name: `测试空文件夹${i}` });
  }

  // 创建1个智能文件夹
  await db.folders.add({
    id: 'test-smart-' + Date.now(),
    name: '测试智能文件夹',
    order: 0,
    isSmartFolder: true,
    smartFilters: { tags: ['test'] },
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  });

  // 创建1个系统文件夹
  await db.folders.add({
    id: 'test-system-' + Date.now(),
    name: '收藏',
    order: 1,
    isSmartFolder: false,
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now(),
  });

  console.log('✅ 测试数据创建完成');
}

// 测试2: 查找空文件夹
async function testFindEmptyFolders() {
  console.log('\n🔍 测试 findEmptyFolders()...');

  const emptyFolders = await folderService.findEmptyFolders({
    recursive: true,
    excludeRoot: true,
    minAge: 0,
  });

  console.log(`找到 ${emptyFolders.length} 个空文件夹`);
  console.table(emptyFolders.map(f => ({
    名称: f.folder.name,
    书签数: f.bookmarksCount,
    子文件夹数: f.childrenCount,
    后代数: f.allDescendantsCount,
    为空: f.isEmpty,
    存在时间: Math.round(f.age / (24 * 60 * 60 * 1000)) + '天',
  })));

  return emptyFolders;
}

// 测试3: 预览清理
async function testPreviewEmptyFolders() {
  console.log('\n👁️ 测试 previewEmptyFolders()...');

  const preview = await folderService.previewEmptyFolders({
    recursive: true,
    excludeRoot: true,
    minAge: 0,
  });

  console.log(`📊 预览结果:`);
  console.log(`  - 将删除: ${preview.toDelete.length} 个`);
  console.log(`  - 将保留: ${preview.toKeep.length} 个`);
  console.log(`  - 警告: ${preview.warnings.length} 个`);

  if (preview.toDelete.length > 0) {
    console.log('\n将被删除的文件夹:');
    console.table(preview.toDelete.map(f => ({
      名称: f.folder.name,
      ID: f.folder.id.substring(0, 8),
    })));
  }

  if (preview.toKeep.length > 0) {
    console.log('\n将被保留的文件夹:');
    preview.toKeep.forEach(f => {
      const warning = preview.warnings.find(w => w.includes(f.folder.name));
      console.log(`  - ${f.folder.name}: ${warning}`);
    });
  }

  return preview;
}

// 测试4: Dry Run 清理
async function testDryRun() {
  console.log('\n🎭 测试 deleteEmptyFolders({ dryRun: true })...');

  const result = await folderService.deleteEmptyFolders({
    dryRun: true,
    recursive: true,
    excludeRoot: true,
    minAge: 0,
  });

  console.log(`📊 Dry Run 结果:`);
  console.log(`  - 删除数: ${result.deleted}`);
  console.log(`  - 保留数: ${result.kept}`);
  console.log(`  - 警告数: ${result.warnings.length}`);
  console.log(`  - 耗时: ${result.duration}ms`);

  return result;
}

// 测试5: 实际清理（谨慎使用）
async function testActualCleanup() {
  console.log('\n⚠️  测试实际删除...');
  const confirmed = confirm('⚠️  确认要删除所有空文件夹吗？此操作不可撤销！');

  if (!confirmed) {
    console.log('❌ 操作已取消');
    return;
  }

  const result = await folderService.deleteEmptyFolders({
    dryRun: false,
    recursive: true,
    excludeRoot: true,
    minAge: 0,
  });

  console.log(`✅ 清理完成:`);
  console.log(`  - 已删除: ${result.deleted} 个文件夹`);
  console.log(`  - 已保留: ${result.kept} 个文件夹`);
  console.log(`  - 耗时: ${result.duration}ms`);

  if (result.warnings.length > 0) {
    console.log('\n⚠️  警告:');
    result.warnings.forEach(w => console.log(`  - ${w}`));
  }

  return result;
}

// 测试6: 性能测试
async function testPerformance() {
  console.log('\n⚡ 性能测试...');

  // 创建100个文件夹
  console.log('创建100个测试文件夹...');
  for (let i = 0; i < 100; i++) {
    await folderService.create({ name: `性能测试${i}` });
  }

  // 测试查找性能
  const start = performance.now();
  const result = await folderService.findEmptyFolders();
  const duration = performance.now() - start;

  console.log(`✅ 性能测试结果:`);
  console.log(`  - 文件夹总数: ${result.length}`);
  console.log(`  - 查询耗时: ${duration.toFixed(2)}ms`);
  console.log(`  - 平均耗时: ${(duration / result.length).toFixed(2)}ms/个`);

  if (duration < 1000) {
    console.log('  ⚡ 性能优秀 (< 1秒)');
  } else if (duration < 5000) {
    console.log('  ✅ 性能良好 (< 5秒)');
  } else {
    console.log('  ⚠️  需要优化 (> 5秒)');
  }

  return { result, duration };
}

// 测试7: 智能建议集成测试
async function testSmartSuggestionIntegration() {
  console.log('\n💡 测试 OrganizerService 智能建议集成...');

  const suggestions = await organizerService.generateSmartSuggestions();

  const emptyFolderSuggestion = suggestions.find(s =>
    s.title.includes('空文件夹')
  );

  if (emptyFolderSuggestion) {
    console.log('✅ 智能建议已正确集成');
    console.log(`  - 标题: ${emptyFolderSuggestion.title}`);
    console.log(`  - 优先级: ${emptyFolderSuggestion.priority}`);
    console.log(`  - 描述: ${emptyFolderSuggestion.description}`);
    if (emptyFolderSuggestion.estimatedImpact) {
      console.log(`  - 预计影响: ${emptyFolderSuggestion.estimatedImpact.foldersAffected} 个文件夹`);
    }
  } else {
    console.log('ℹ️  当前没有空文件夹，未触发智能建议');
  }

  return emptyFolderSuggestion;
}

// 主测试流程
async function runAllTests() {
  console.log('🚀 开始运行所有测试...\n');

  try {
    await createTestData();
    await testFindEmptyFolders();
    await testPreviewEmptyFolders();
    await testDryRun();
    await testPerformance();
    await testSmartSuggestionIntegration();

    console.log('\n✅ 所有测试完成！');
    console.log('\n💡 提示: 如果要实际删除空文件夹，请运行 testActualCleanup()');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
  }
}

// 快速测试（只运行基本测试）
async function runQuickTest() {
  console.log('🚀 快速测试...\n');

  try {
    const empty = await testFindEmptyFolders();
    const preview = await testPreviewEmptyFolders();
    const dryRun = await testDryRun();

    console.log('\n✅ 快速测试完成！');
    console.log(`  - 找到 ${empty.length} 个空文件夹`);
    console.log(`  - 可删除 ${preview.toDelete.length} 个`);
    console.log(`  - 需保留 ${preview.toKeep.length} 个`);
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
  }
}

// 导出测试函数到全局
window.cleanupTests = {
  runAllTests,
  runQuickTest,
  testFindEmptyFolders,
  testPreviewEmptyFolders,
  testDryRun,
  testActualCleanup,
  testPerformance,
  testSmartSuggestionIntegration,
  createTestData,
};

console.log('✅ 测试脚本已加载');
console.log('📖 使用方法:');
console.log('  - runAllTests()      运行所有测试');
console.log('  - runQuickTest()     快速测试');
console.log('  - testFindEmptyFolders()  单独测试查找');
console.log('  - testPreviewEmptyFolders()  单独测试预览');
console.log('  - testDryRun()       单独测试 Dry Run');
console.log('  - testActualCleanup()  实际清理（需确认）');
console.log('\n⚡ 快速开始: runQuickTest()');
