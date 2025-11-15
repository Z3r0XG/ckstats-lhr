;(function () {
  if (typeof window === 'undefined') return
  if (window.__CLIENT_LOG_DISABLED) return

  var token = (window.__CLIENT_LOG_TOKEN && String(window.__CLIENT_LOG_TOKEN)) || null

  function send(payload) {
    try {
      var body = JSON.stringify(payload)
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/client-logs', body)
        return
      }
      fetch('/api/client-logs', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'x-client-log-token': token } : {}),
        body: body,
        keepalive: true,
      }).catch(function () {})
    } catch (e) {}
  }

  window.addEventListener('error', function (ev) {
    try {
      send({
        source: 'window-error',
        message: ev.message,
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
        stack: ev.error && ev.error.stack,
        url: location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      })
    } catch (e) {}
  })

  window.addEventListener('unhandledrejection', function (ev) {
    try {
      var reason = ev.reason
      send({
        source: 'unhandledrejection',
        message: (reason && reason.message) || String(reason),
        stack: reason && reason.stack,
        url: location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      })
    } catch (e) {}
  })

  // helper for manual logs
  window.__logClientError = function (payload) {
    try {
      send(Object.assign({ source: 'manual', timestamp: new Date().toISOString() }, payload))
    } catch (e) {}
  }
})()
