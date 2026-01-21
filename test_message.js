// 测试消息发送是否工作
chrome.runtime.sendMessage(
  { type: 'SCAN_BROWSER_BOOKMARKS' },
  (response) => {
    console.log('Test response:', response);
    if (chrome.runtime.lastError) {
      console.error('Error:', chrome.runtime.lastError);
    }
  }
);
