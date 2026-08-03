/* Vortex Digital - Silent Admin Activity Logger
   Central shared file used by contact.html, vx-s847-ops.html,
   vd-9247-ops.html and vd-9a57-ops.html.
   Sends a silent background email (via Web3Forms) whenever an
   admin-related action happens. Nothing is ever shown to the
   visitor/admin - no popup, no confirmation, no delay they notice.
*/
(function (global) {

  const VX_LOG_ACCESS_KEY = "31476732-9a60-4939-b340-dfab48089213";
  const VX_LOG_ENDPOINT = "https://api.web3forms.com/submit";

  // ---------- Readable date & time (12-hour, Pakistan Time) ----------
  function formatReadableDateTime(date) {
    try {
      const dateStr = date.toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        timeZone: "Asia/Karachi"
      });
      const timeStr = date.toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", second: "2-digit",
        hour12: true, timeZone: "Asia/Karachi"
      });
      return dateStr + " at " + timeStr + " (Pakistan Time)";
    } catch (e) {
      return date.toString();
    }
  }

  function formatReadableTimeOnly(date) {
    try {
      return date.toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", second: "2-digit",
        hour12: true, timeZone: "Asia/Karachi"
      });
    } catch (e) {
      return date.toString();
    }
  }

  function formatDuration(totalSeconds) {
    if (totalSeconds < 60) return totalSeconds + " second" + (totalSeconds === 1 ? "" : "s");
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 60) {
      return minutes + " minute" + (minutes === 1 ? "" : "s") +
        (seconds ? " " + seconds + " second" + (seconds === 1 ? "" : "s") : "");
    }
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return hours + " hour" + (hours === 1 ? "" : "s") +
      (remMinutes ? " " + remMinutes + " minute" + (remMinutes === 1 ? "" : "s") : "");
  }

  // ---------- Readable device info (real model where possible) ----------
  function parseUserAgentFallback(ua) {
    let browser = "Unknown Browser";
    if (ua.indexOf("Edg/") > -1) browser = "Microsoft Edge";
    else if (ua.indexOf("Chrome/") > -1) browser = "Chrome";
    else if (ua.indexOf("Firefox/") > -1) browser = "Firefox";
    else if (ua.indexOf("Safari/") > -1) browser = "Safari";

    let os = "Unknown OS";
    if (/Windows/i.test(ua)) os = "Windows";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone|iPad|iOS/i.test(ua)) os = "iOS";
    else if (/Mac OS X/i.test(ua)) os = "macOS";
    else if (/Linux/i.test(ua)) os = "Linux";

    const deviceType = /Mobile|Android|iPhone/i.test(ua) ? "Mobile" : "Desktop / Laptop";
    return { browser: browser, os: os, deviceType: deviceType };
  }

  let cachedDeviceInfo = null;
  let deviceInfoPromise = null;

  function buildDeviceInfo() {
    const ua = navigator.userAgent;
    const fallback = parseUserAgentFallback(ua);

    // Modern Chromium browsers hide the real model in the normal user-agent
    // string (shows just "K" for privacy). The real model can still be read
    // via the newer User-Agent Client Hints API, if the browser supports it.
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      return navigator.userAgentData.getHighEntropyValues(
        ["model", "platformVersion", "fullVersionList"]
      ).then(function (hi) {
        let browserLabel = fallback.browser;
        if (hi.fullVersionList && hi.fullVersionList.length) {
          const match = hi.fullVersionList.find(function (b) {
            return !/Not.?A.?Brand/i.test(b.brand);
          });
          if (match) browserLabel = match.brand + " " + match.version;
        }
        const deviceLabel = (hi.model && hi.model.trim())
          ? hi.model.trim()
          : (fallback.deviceType === "Mobile" ? "Mobile device (exact model not shared by browser)" : "Desktop / Laptop");

        return {
          Device_Model: deviceLabel,
          Device_Type: fallback.deviceType,
          Operating_System: fallback.os + (hi.platformVersion ? " (version " + hi.platformVersion + ")" : ""),
          Browser: browserLabel,
          Screen_Size: screen.width + " x " + screen.height + " px",
          Language: navigator.language || "Unknown"
        };
      }).catch(function () {
        return fallbackDeviceInfo(fallback);
      });
    }

    return Promise.resolve(fallbackDeviceInfo(fallback));
  }

  function fallbackDeviceInfo(fallback) {
    return {
      Device_Model: fallback.deviceType === "Mobile" ? "Mobile device (exact model not available)" : "Desktop / Laptop",
      Device_Type: fallback.deviceType,
      Operating_System: fallback.os,
      Browser: fallback.browser,
      Screen_Size: screen.width + " x " + screen.height + " px",
      Language: navigator.language || "Unknown"
    };
  }

  function getDeviceInfo() {
    if (!deviceInfoPromise) {
      deviceInfoPromise = buildDeviceInfo().then(function (info) {
        cachedDeviceInfo = info;
        return info;
      });
    }
    return deviceInfoPromise;
  }
  // Start detecting device info immediately so it's ready before the first log
  getDeviceInfo();

  // ---------- Session ID ----------
  function getSessionId() {
    let sid = sessionStorage.getItem("vx_session_id");
    if (!sid) {
      sid = (global.crypto && global.crypto.randomUUID)
        ? global.crypto.randomUUID()
        : (Date.now().toString(36) + Math.random().toString(36).slice(2));
      sessionStorage.setItem("vx_session_id", sid);
    }
    return sid;
  }

  // ---------- Sending ----------
  function buildMessageBody(fields) {
    const lines = [];
    for (const key in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        lines.push(key.replace(/_/g, " ") + ": " + fields[key]);
      }
    }
    return lines.join("\n");
  }

  function sendPayload(subject, fields, useBeacon) {
    const payload = {
      access_key: VX_LOG_ACCESS_KEY,
      subject: subject,
      from_name: "Vortex Digital Admin Logger",
      message: buildMessageBody(fields)
    };
    const body = JSON.stringify(payload);

    if (useBeacon && navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(VX_LOG_ENDPOINT, blob);
      } catch (e) { /* fail silently */ }
      return Promise.resolve();
    }

    return fetch(VX_LOG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true
    }).catch(function () { /* fail silently */ });
  }

  /**
   * vxLogEvent(eventName, subjectLabel, extraFields, useBeacon)
   * extraFields: plain object of readable label -> value pairs
   * useBeacon: true when this log happens right before the page unloads/redirects
   * Returns a Promise that resolves once the log has been sent (or attempted).
   */
  function vxLogEvent(eventName, subjectLabel, extraFields, useBeacon) {
    const now = new Date();
    const sessionId = getSessionId();
    const page = global.location.pathname.split("/").pop() || "index.html";

    function finish(deviceInfo) {
      const fields = Object.assign(
        {
          Event: eventName,
          When: formatReadableDateTime(now),
          Page: page,
          Session_ID: sessionId
        },
        extraFields || {},
        deviceInfo
      );
      return sendPayload("VD Admin Log: " + subjectLabel, fields, useBeacon);
    }

    if (cachedDeviceInfo) return finish(cachedDeviceInfo);
    return getDeviceInfo().then(finish);
  }

  global.vxLogEvent = vxLogEvent;
  global.vxFormatDateTime = formatReadableDateTime;
  global.vxFormatTimeOnly = formatReadableTimeOnly;
  global.vxFormatDuration = formatDuration;

})(window);