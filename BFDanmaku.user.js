// ==UserScript==
// @name         BFDanmaku - A站旧高级弹幕复活
// @namespace    https://github.com/mg13666/BFDanmaku
// @version      1.4.3
// @description  拦截A站播放器弹幕API + 本地存档优先渲染旧高级弹幕。点击"启用高级弹幕"按钮激活。
// @author       mg13666 / boomfun
// @match        https://www.acfun.cn/v/*
// @require      https://raw.githubusercontent.com/mg13666/BFDanmaku/master/dist/BFDanmaku.js
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  var DEV_MODE = true;

  // ==================== 存档映射：videoId → GitHub raw data URL ====================
  // 格式: "<ac号>": "<GitHub raw URL 或其他直链>"
  // 注意: data1.js 经确认为 JOJO 测试数据，非 ac1758344 弹幕。
  // 真实存档待获取后添加。
  var ARCHIVE_MAP = {
    // 示例（数据不对）: "1758344": "https://raw.githubusercontent.com/boomfun/BFDanmaku/master/src/test/data/data1.js",
  };

  var currentId = (function () {
    var m = location.pathname.match(/ac(\d+)/);
    return m ? m[1] : null;
  })();

  // ==================== 拦截层 ====================
  var capturedDanmakus = [];
  var seenIds = {};

  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._bfUrl = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    var self = this;
    if (self._bfUrl && self._bfUrl.indexOf("new-danmaku") !== -1) {
      self.addEventListener("load", function () {
        try {
          var data = JSON.parse(self.responseText);
          if (data.result === 0 && data.danmakus) {
            var types = {};
            for (var i = 0; i < data.danmakus.length; i++) {
              var dm = data.danmakus[i];
              if (!seenIds[dm.danmakuId]) {
                seenIds[dm.danmakuId] = true;
                capturedDanmakus.push(dm);
              }
              types[dm.danmakuType] = (types[dm.danmakuType] || 0) + 1;
            }
            if (DEV_MODE && data.danmakus.length > 0) {
              console.log(
                "[BFDanmaku] 拦截 " + data.danmakus.length +
                " 条 (累计 " + capturedDanmakus.length +
                ") 类型: " + JSON.stringify(types)
              );
            }
          }
        } catch (e) {}
      });
    }
    return origSend.apply(this, arguments);
  };

  // ==================== BFColor ====================
  var BFColor = (function () {
    function Color(r, g, b, a) {
      this.r = r !== undefined ? r : 255;
      this.g = g !== undefined ? g : 255;
      this.b = b !== undefined ? b : 255;
      this.a = a !== undefined ? a : 255;
    }
    Color.fromHEX = function (h) {
      h = h.replace("#", "");
      while (h.length < 8) h = "0" + h;
      return new Color(
        parseInt("0x" + h[0] + h[1]),
        parseInt("0x" + h[2] + h[3]),
        parseInt("0x" + h[4] + h[5]),
        h.length >= 8 ? parseInt("0x" + h[6] + h[7]) : 255
      );
    };
    Color.fromDEC = function (d) {
      return Color.fromHEX(d.toString(16));
    };
    return Color;
  })();

  // ==================== AcfunParser ====================
  var AcfunParser = (function () {
    var parentList = {}, waitForParent = {}, waitForMask = {};

    function parseBlendMode(bm) {
      if ((bm >= 6 && bm <= 8) || bm >= 11) return 0;
      else if (bm > 6 && bm < 11) return bm - 3;
      else { if (bm === 1) return 2; return bm; }
    }

    function getContent(o) {
      return o.w && o.w.g && o.w.g.d
        ? { type: 1, content: o.w.g.d }
        : { type: 0, content: o.n ? o.n.replace(/\r/g, "\n") : "" };
    }

    function parseFilter(arr) {
      var res = [];
      for (var i = 0; i < arr.length; i++) {
        var s = arr[i], f = undefined;
        if (s[0] === 0) f = { type: 1, blur: s[1] };
        else if (s[0] === 1) f = { type: 0, color: BFColor.fromDEC(s[1]), offsetX: 0, offsetY: 0, blur: s[3], knockout: s[8] === true, onlyShadow: false };
        else if (s[0] === 2) f = { type: 0, color: BFColor.fromDEC(s[3]), offsetX: Math.cos((s[2] * Math.PI) / 180) * s[1], offsetY: Math.sin((s[2] * Math.PI) / 180) * s[1], blur: s[5], knockout: s[10] === true, onlyShadow: s[11] === true };
        if (f) res.push(f);
      }
      return res.length ? res : undefined;
    }

    function getAdvanced(o, color) {
      var re = [{
        opacity: o.a !== undefined ? Number(o.a) : 1,
        time: o.l !== undefined ? Number(o.l) * 1000 : 0,
        color: color,
        rotate: { x: o.rx !== undefined ? -o.rx : 0, y: o.k !== undefined ? -o.k : 0, z: o.r !== undefined ? Number(o.r) : 0 },
        point: { x: o.p && o.p.x !== undefined ? Number(o.p.x) : 0, y: o.p && o.p.y !== undefined ? Number(o.p.y) : 0, z: o.pz !== undefined ? -o.pz : 0 },
        scale: { x: o.e !== undefined ? Number(o.e) : 1, y: o.f !== undefined ? Number(o.f) : 1, z: o.sz !== undefined ? Number(o.sz) : 1 },
        transition: 0,
      }];
      if (o.z) {
        var last = re[0];
        for (var i = 0; i < o.z.length; i++) {
          var iz = o.z[i];
          var nxt = {
            opacity: iz.t !== undefined ? Number(iz.t) : last.opacity,
            time: iz.l * 1000,
            color: iz.c !== undefined ? BFColor.fromDEC(Number(iz.c)) : last.color,
            rotate: { z: iz.d !== undefined ? iz.d : last.rotate.z, y: iz.e !== undefined ? -iz.e : last.rotate.y, x: iz.rx !== undefined ? -iz.rx : last.rotate.x },
            scale: { y: iz.g !== undefined ? Number(iz.g) : last.scale.y, x: iz.f !== undefined ? Number(iz.f) : last.scale.x, z: iz.sz !== undefined ? Number(iz.sz) : last.scale.z },
            point: { x: iz.x !== undefined ? Number(iz.x) : last.point.x, y: iz.y !== undefined ? Number(iz.y) : last.point.y, z: iz.z !== undefined ? -iz.z : last.point.z },
            transition: iz.v !== undefined ? Number(iz.v) : 1,
          };
          re.push(nxt);
          last = nxt;
        }
      }
      return re;
    }

    function parse(data) {
      parentList = {}; waitForParent = {}; waitForMask = {};
      var res = [];
      for (var i = 0; i < data.length; i++) {
        var item = data[i];
        var c = item.c.split(",");
        if (Number(c[2]) !== 7) continue;

        var id = "bf-o_" + Math.ceil(Math.random() * 10000000) + "_" + Math.ceil(Math.random() * 10000000);
        var color = BFColor.fromDEC(parseInt(c[1]));
        var advance = JSON.parse(item.m);
        var content = getContent(advance);
        var confFilter = advance.w && advance.w.l ? parseFilter(advance.w.l) : undefined;
        var adv = getAdvanced(advance, color);

        var o = {
          id: id,
          content: content.content,
          startTime: Math.floor(Number(c[0]) * 1000),
          anchor: advance.c !== undefined ? Number(advance.c) : 0,
          word: {
            bold: advance.w && advance.w.b !== undefined ? advance.w.b : false,
            stroke: advance.b !== undefined ? advance.b : false,
            font: advance.w && advance.w.f
              ? (advance.w.f === "微软雅黑" || advance.w.f === "Microsoft YaHei" ? "微软雅黑" : advance.w.f)
              : undefined,
            size: Number(c[3]),
          },
          contentType: content.type,
          zindex: advance.dep ? Number(advance.dep) : 0,
          filter: confFilter,
          frames: adv,
          bm: advance.bm !== undefined ? parseBlendMode(Number(advance.bm)) : 0,
        };

        // parent
        if (advance.parent) {
          if (parentList[advance.parent]) o.parent = parentList[advance.parent];
          else { waitForParent[advance.parent] = waitForParent[advance.parent] || []; waitForParent[advance.parent].push(o); }
        }

        // register by name
        if (advance.name) {
          parentList[advance.name] = id;
          var wp = waitForParent[advance.name];
          if (wp) { for (var j = 0; j < wp.length; j++) wp[j].parent = id; delete waitForParent[advance.name]; }
          var wm = waitForMask[advance.name];
          if (wm) { for (var k = 0; k < wm.length; k++) wm[k].mask = id; delete waitForMask[advance.name]; }
        }

        // mask
        if (advance.mask) {
          if (parentList[advance.mask]) o.mask = parentList[advance.mask];
          else { waitForMask[advance.mask] = waitForMask[advance.mask] || []; waitForMask[advance.mask].push(o); }
        }

        res.push(o);
      }
      return res;
    }
    return parse;
  })();

  // ==================== 远程存档加载 ====================
  function fetchArchive(url) {
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest !== "undefined") {
        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          onload: function (r) { resolve(r.responseText); },
          onerror: reject,
          ontimeout: reject,
          timeout: 15000,
        });
      } else {
        fetch(url, { cache: "force-cache" })
          .then(function (r) { return r.text(); })
          .then(resolve)
          .catch(reject);
      }
    });
  }

  function loadArchiveData(url) {
    return fetchArchive(url).then(function (text) {
      var data;
      try {
        var arrMatch = text.match(/export\s+default\s+(\[[\s\S]*\])\s*;?\s*$/);
        if (arrMatch) {
          var fn = new Function("return " + arrMatch[1]);
          data = fn();
        }
      } catch (e) {
        console.warn("[BFDanmaku] 存档解析失败", e);
      }
      if (!data || !data[1]) {
        console.warn("[BFDanmaku] 存档格式异常");
        return [];
      }
      return data[1];
    }).catch(function (e) {
      console.warn("[BFDanmaku] 存档加载失败:", url, e);
      return [];
    });
  }

  // ==================== UI ====================
  function createButton(onClick) {
    var btn = document.createElement("button");
    btn.id = "bfdanmaku-btn";
    btn.textContent = "启用高级弹幕";
    btn.style.cssText =
      "background:linear-gradient(135deg,#fd4e6d,#fda34b);color:#fff;border:none;border-radius:4px;padding:8px 20px;font-size:14px;font-weight:bold;cursor:pointer;";
    btn.addEventListener("mouseenter", function () { btn.style.opacity = "0.85"; });
    btn.addEventListener("mouseleave", function () { btn.style.opacity = "1"; });
    btn.addEventListener("click", onClick);
    return btn;
  }

  function createStatusEl() {
    var el = document.createElement("span");
    el.id = "bfdanmaku-status";
    el.style.cssText = "font-size:12px;color:#aaa;margin-left:12px;";
    return el;
  }

  function insertToolbar(btn, statusEl) {
    var toolbar = document.createElement("div");
    toolbar.id = "bfdanmaku-toolbar";
    toolbar.style.cssText =
      "display:flex;align-items:center;justify-content:flex-end;margin-bottom:8px;padding:4px 0;";
    toolbar.appendChild(btn);
    toolbar.appendChild(statusEl);
    var cv = document.querySelector(".container-video");
    if (cv && cv.parentElement) { cv.parentElement.insertBefore(toolbar, cv); return; }
    var frame = document.querySelector(".frame");
    if (frame && frame.parentElement) { frame.parentElement.insertBefore(toolbar, frame); return; }
    document.body.insertBefore(toolbar, document.body.firstChild);
  }

  // ==================== 数据推入（修复：先 stage 后 push） ====================
  function pushDanmakusToPool(list, pool) {
    if (!list || !list.length) return { loaded: 0, advCount: 0 };

    var adv = [], normal = [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      var isAdv = false;
      if (d.c) {
        var parts = d.c.split(",");
        if (Number(parts[2]) === 7) isAdv = true;
      } else if (d.danmakuType === 7 || d.danmakuType === "7") {
        isAdv = true;
      }
      if (isAdv) adv.push(d);
      else normal.push(d);
    }

    var count = 0, advLoaded = 0;

    if (adv.length) {
      try {
        var parsed = AcfunParser(adv);
        for (var a = 0; a < parsed.length; a++) {
          pool.push(parsed[a]);
          count++;
          advLoaded++;
        }
      } catch (e) {
        console.error("[BFDanmaku] 高级弹幕解析失败:", e);
      }
    }

    for (var n = 0; n < normal.length; n++) {
      var dm = normal[n];
      pool.push({
        id: "dm-" + (dm.danmakuId || Math.random()),
        content: dm.body || dm.n || "",
        startTime: dm.position || (dm.c ? Number(dm.c.split(",")[0]) * 1000 : 0),
        anchor: 0,
        word: { bold: false, stroke: false, size: dm.size || 25, font: "微软雅黑" },
        contentType: 0,
        zindex: 0,
        frames: [{
          opacity: 1, time: 10000,
          color: BFColor.fromDEC(dm.color || 0xffffff),
          rotate: { x: 0, y: 0, z: 0 },
          point: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          transition: 0
        }],
      });
      count++;
    }

    if (adv.length > 0) console.log("[BFDanmaku] 🎬 解析高级弹幕: " + advLoaded + " 条");
    return { loaded: count, advCount: advLoaded };
  }

  // ==================== 渲染 ====================
  function createStageOverlay(container) {
    var div = document.createElement("div");
    div.id = "bfdanmaku-stage";
    div.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;";
    if (getComputedStyle(container).position === "static")
      container.style.position = "relative";
    container.appendChild(div);
    return div;
  }

  function waitForVideo(timeout) {
    timeout = timeout || 30000;
    return new Promise(function (resolve) {
      var el = document.querySelector("video");
      if (el && el.videoWidth > 0) return resolve(el);
      var intvl = setInterval(function () {
        var v = document.querySelector("video");
        if (v && v.videoWidth > 0) { clearInterval(intvl); resolve(v); }
      }, 500);
      setTimeout(function () {
        clearInterval(intvl);
        var v = document.querySelector("video");
        if (v) resolve(v);
      }, timeout);
    });
  }

  // ==================== 主逻辑 ====================
  function main() {
    console.log("[BFDanmaku] v1.4.3 | video=" + currentId + (Object.keys(ARCHIVE_MAP).length ? " | 存档视频=" + Object.keys(ARCHIVE_MAP).length + "个" : " | 纯拦截模式"));

    if (!window.DanmakuPool || !window.DanmakuStage) {
      setTimeout(main, 1000);
      return;
    }

    var archiveUrl = ARCHIVE_MAP[currentId];
    var hasArchive = !!archiveUrl;
    var archiveData = [];

    var archivePromise = Promise.resolve([]);
    if (archiveUrl) {
      archivePromise = loadArchiveData(archiveUrl).then(function (d) {
        archiveData = d;
        if (d.length) console.log("[BFDanmaku] 📦 存档就绪: " + d.length + " 条 type=7");
        return d;
      });
    }

    var pool, stage, stageDiv;

    function initEngine(video) {
      var container =
        document.querySelector(".container-video") ||
        document.querySelector(".frame") ||
        video.parentElement;

      // 必须先创建 stageDiv 和 stage，再 push 到 pool
      stageDiv = createStageOverlay(container);
      pool = new window.DanmakuPool();
      stage = new window.DanmakuStage(stageDiv, pool, video.videoWidth, video.videoHeight, {
        dev: DEV_MODE,
        baseWidth: 1280,
        performanceMode: true,
      });

      video.addEventListener("play", function () { stage.fix(video.currentTime * 1000); stage.start(); });
      video.addEventListener("pause", function () { stage.stop(); });
      video.addEventListener("ended", function () { stage.stop(); });
      video.addEventListener("seeked", function () { stage.seek(video.currentTime * 1000); });

      console.log("[BFDanmaku] 引擎初始化完成");
    }

    var statusEl = createStatusEl();

    function onEnableClick() {
      var btn = document.getElementById("bfdanmaku-btn");

      waitForVideo(15000).then(function (video) {
        initEngine(video);

        // 等待存档加载（如果还没完成）
        archivePromise.then(function () {
          var totalLoaded = 0, advCount = 0;

          // 优先喂存档（高级弹幕）
          if (archiveData.length) {
            var r = pushDanmakusToPool(archiveData, pool);
            totalLoaded += r.loaded;
            advCount += r.advCount;
          }

          // 再喂拦截到的普通弹幕
          if (capturedDanmakus.length) {
            var r2 = pushDanmakusToPool(capturedDanmakus, pool);
            totalLoaded += r2.loaded;
          }

          var msg;
          if (advCount > 0) msg = "🎬 " + advCount + "条高级弹幕 + " + (totalLoaded - advCount) + "条普通";
          else if (hasArchive) msg = "存档 " + totalLoaded + " 条弹幕";
          else msg = totalLoaded + " 条弹幕 (无type=7)";

          statusEl.textContent = msg;
          if (btn) { btn.textContent = "✓ 已启用"; btn.disabled = false; }
          console.log("[BFDanmaku] ✅ 总计: " + totalLoaded + " 条 (高级=" + advCount + ")");
        });

        // 无存档时的拦截兜底
        if (!hasArchive && capturedDanmakus.length === 0) {
          statusEl.textContent = "等待弹幕数据...播放以触发";
          try { video.play(); setTimeout(function () { video.pause(); }, 2000); } catch (e) {}
          setTimeout(function () {
            if (capturedDanmakus.length) {
              var r = pushDanmakusToPool(capturedDanmakus, pool);
              statusEl.textContent = r.loaded + " 条 (无type=7)";
            } else {
              statusEl.textContent = "无弹幕数据";
            }
            if (btn) { btn.textContent = "✓ 已启用"; btn.disabled = false; }
          }, 3000);
        }
      }).catch(function () {
        statusEl.textContent = "未找到播放器";
      });
    }

    statusEl.textContent = hasArchive ? "📦 存档加载中..." : "就绪（拦截中...）";
    var btn = createButton(onEnableClick);
    insertToolbar(btn, statusEl);
    console.log("[BFDanmaku] 🚀 按钮已插入");

    archivePromise.then(function (d) {
      if (d.length > 0) statusEl.textContent = "📦 存档就绪(" + d.length + "条type=7)";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();