/* Vortex Digital - Silent Admin Activity Logger
   Sends a silent background email (via Web3Forms) every time an
   admin-related action happens on the site. Visitors/admins never
   see this happen - no popup, no confirmation, no redirect change.
*/
(function (global) {
  // Dedicated Web3Forms access key - admin logs only, separate from
  // the regular contact/career form submissions.
  const VX_LOG_ACCESS_KEY = "31476732-9a60-4939-b340-dfab48089213";
  const VX_LOG_ENDPOINT = "https://api.web3forms.com/submit";

  function vxGetDeviceInfo() {
    try {
      return {
        User_Agent: navigator.userAgent,
        Platform: navigator.platform || "Unknown",
        Screen_Resolution: screen.width + "x" + screen.height,
        Viewport_Size: window.innerWidth + "x" + window.innerHeight,
        Pixel_Ratio: window.devicePixelRatio || 1,
        Color_Depth: screen.colorDepth + "-bit",
        Touch_Capable: ("ontouchstart" in window || navigator.maxTouchPoints > 0) ? "Yes (likely phone/tablet)" : "No (likely desktop/laptop)",
        Language: navigator.language || "Unknown",
        Timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown",
        CPU_Cores: navigator.hardwareConcurrency || "Unknown"
      };
    } catch (e) {
      return { User_Agent: navigator.userAgent || "Unknown" };
    }
  }

  function vxLogEvent(subject, fields, useBeacon) {
    try {
      const now = new Date();
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

      const payload = Object.assign(
        {
          access_key: VX_LOG_ACCESS_KEY,
          subject: subject,
          from_name: "Vortex Digital - Admin Activity Log",
          Date_Time: now.toLocaleString(),
          Day: dayNames[now.getDay()],
          Page: window.location.pathname
        },
        vxGetDeviceInfo(),
        fields || {}
      );

      const body = JSON.stringify(payload);

      // useBeacon = true for events immediately followed by page navigation
      // (sendBeacon survives the page unloading, a plain fetch can get cancelled)
      if (useBeacon && navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(VX_LOG_ENDPOINT, blob);
      } else {
        fetch(VX_LOG_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true
        }).catch(function () {});
      }
    } catch (e) {
      // Fail silently - logging must never break the actual page function
    }
  }

  global.vxLogEvent = vxLogEvent;
})(window);