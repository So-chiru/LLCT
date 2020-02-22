const registerWorker = () => {
  let useOffline = LLCTSettings.get('useOffline')

  if (!'serviceWorker' in navigator) {
    return false
  }

  navigator.serviceWorker.register('/worker.js').then(reg => {
    
  }, (err) => {
    window.showToast(
      '서비스 워커 등록 실패',
      'warning',
      true,
      2000
    )
  });

  navigator.serviceWorker.addEventListener('message', ev => {
    if (!ev.data) return ev

    if (ev.data.cmd == 0x01) {
      window.showToast(
        '페이지 업데이트가 있습니다. 페이지를 새로 고쳐주세요.',
        'cloud_done',
        false,
        10000
      )
    }
  })
}