/**
 * 外观开关：在首次绘制前把 data-theme 落到 <html> 上。
 *
 * 这个文件是同步加载的（没有 defer / async），因为晚一步就意味着深色用户先看到
 * 一帧白屏。它必须在 <head> 里、样式表之前或之后都行，但一定不能等 DOM。
 *
 * 为什么要手动开关而不是只跟系统：系统是深色不代表此刻想用深色看资料，
 * 反之亦然。所以默认按系统走，一旦点过就记住，之后系统怎么变都不再管。
 */
;(function () {
  var KEY = 'polymer-atlas-theme'
  var root = document.documentElement
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

  // localStorage 在隐私模式、被禁用的存储、file:// 下都会抛异常。
  // 读不到就当没设置过，页面照样能切，只是不记住。
  function stored() {
    try {
      var value = localStorage.getItem(KEY)
      return value === 'light' || value === 'dark' ? value : ''
    } catch (e) {
      return ''
    }
  }

  function apply(mode) {
    var dark = mode ? mode === 'dark' : !!(mq && mq.matches)
    root.setAttribute('data-theme', dark ? 'dark' : 'light')
    root.setAttribute('data-theme-mode', mode || 'auto')

    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', dark ? '#111310' : '#46684f')

    var btn = document.querySelector('.theme-toggle')
    if (btn) {
      var label = dark ? '切换到浅色外观' : '切换到深色外观'
      btn.setAttribute('aria-label', label)
      btn.setAttribute('title', label)
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false')
    }
  }

  apply(stored())

  // 没手动选过时继续跟随系统；选过之后 data-theme-mode 就不是 auto 了。
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () {
      if (root.getAttribute('data-theme-mode') === 'auto') apply('')
    })
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('.theme-toggle')
    if (!btn) return
    apply(stored()) // 补一次：head 里执行时按钮还没解析出来
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(KEY, next)
      } catch (e) {}
      apply(next)
    })
  })
})()
