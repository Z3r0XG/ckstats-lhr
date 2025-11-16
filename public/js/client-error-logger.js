;(function () {
  if (typeof window === 'undefined') return
  if (window.__CLIENT_LOG_DISABLED) return

  var token = (window.__CLIENT_LOG_TOKEN && String(window.__CLIENT_LOG_TOKEN)) || null

  // small dedupe map to avoid spamming identical errors in a short window
  var recent = window.__CLIENT_LOG_RECENT || (window.__CLIENT_LOG_RECENT = new Map())
  var DEDUPE_WINDOW_MS = 5 * 1000
  var DEDUPE_MAX_ENTRIES = 200

  function send(payload) {
    try {
      // compute a dedupe key from the meaningful bits (avoid timestamp)
      var dedupeKey = (payload.source || '') + '|' + (payload.message || '') + '|' + (payload.stack || '')
      var now = Date.now()
      if (recent.has(dedupeKey)) {
        var last = recent.get(dedupeKey)
        if (now - last < DEDUPE_WINDOW_MS) return
      }
      recent.set(dedupeKey, now)
      // trim the map when it grows too large
      if (recent.size > DEDUPE_MAX_ENTRIES) {
        var iter = recent.keys()
        while (recent.size > DEDUPE_MAX_ENTRIES) {
          var k = iter.next()
          if (k.done) break
          recent.delete(k.value)
        }
      }

      var body = JSON.stringify(payload)
      if (navigator.sendBeacon) {
        // use a Blob so the content type is explicit for the receiver
        try {
          var blob = new Blob([body], { type: 'application/json' })
          navigator.sendBeacon('/api/client-logs', blob)
          return
        } catch (e) {
          // fallthrough to fetch if Blob not supported
        }
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
