// ==UserScript==
// @name         BFDanmaku - A站旧高级弹幕复活
// @namespace    https://github.com/mg13666/BFDanmaku
// @version      1.1.0
// @description  在A站视频页面生成"启用高级弹幕"按钮，点击后加载旧弹幕数据并用BFDanmaku渲染
// @author       mg13666 / boomfun
// @match        https://www.acfun.cn/v/*
// @require      https://raw.githubusercontent.com/mg13666/BFDanmaku/master/dist/BFDanmaku.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // ==================== 配置 ====================
  const DEV_MODE = true;

  // ==================== 精简Color类 ====================
  const BFColor = (function () {
    function Color(r, g, b, a) {
      this.r = r !== undefined ? r : 255;
      this.g = g !== undefined ? g : 255;
      this.b = b !== undefined ? b : 255;
      this.a = a !== undefined ? a : 255;
    }
    Color.fromHEX = function (hexstr) {
      hexstr = hexstr.replace("#", "");
      var d = hexstr.length;
      for (var i = 0; i < 6 - d; i++) hexstr = "0" + hexstr;
      if (hexstr.length === 7) hexstr = "0" + hexstr;
      return new Color(
        parseInt("0x" + hexstr[0] + hexstr[1]),
        parseInt("0x" + hexstr[2] + hexstr[3]),
        parseInt("0x" + hexstr[4] + hexstr[5]),
        hexstr[6] !== undefined ? parseInt("0x" + hexstr[6] + hexstr[7]) : 255
      );
    };
    Color.fromDEC = function (d) {
      return Color.fromHEX(d.toString(16));
    };
    return Color;
  })();

  // ==================== AcfunParser ====================
  const AcfunParser = (function () {
    var parentList = {};
    var waitForParent = {};
    var waitForMask = {};

    var AnchorType = {
      leftTop: 0, middleTop: 1, rightTop: 2,
      leftMiddle: 3, middle: 4, rightMiddle: 5,
      leftBottom: 6, middleBottom: 7, rightBottom: 8,
    };

    function parseBlendMode(bm) {
      if ((bm >= 6 && bm <= 8) || bm >= 11) return 0;
      else if (bm > 6 && bm < 11) return bm - 3;
      else { if (bm === 1) return 2; return bm; }
    }

    function getContent(o) {
      if (o.w && o.w.g && o.w.g.d)
        return { type: 1, content: o.w.g.d };
      else
        return { type: 0, content: o.n.replace(/\r/g, "\n") };
    }

    function getConfig(o) {
      return {
        anchor: o.c !== undefined ? Number(o.c) : 0,
        zindex: o.dep ? Number(o.dep) : 0,
        filter: o.w !== undefined && o.w.l !== undefined ? parseFilter(o.w.l) : undefined,
        bm: o.bm !== undefined ? Number(o.bm) : 0,
        word: {
          bold: o.w !== undefined && o.w.b !== undefined ? o.w.b : false,
          stroke: o.b !== undefined ? o.b : false,
          font: o.w !== undefined && o.w.f !== undefined
            ? (o.w.f === "微软雅黑" || o.w.f === "Microsoft YaHei" ? "微软雅黑" : o.w.f)
            : undefined,
        },
      };
    }

    function parseFilter(arr) {
      var res = [];
      for (var i = 0; i < arr.length; i++) {
        var s = arr[i], filter = undefined;
        switch (s[0]) {
          case 0:
            filter = { type: 1, blur: s[1] };
            break;
          case 1:
            filter = { type: 0, color: BFColor.fromDEC(s[1]), offsetX: 0, offsetY: 0, blur: s[3], knockout: s[8] === true, onlyShadow: false };
            break;
          case 2:
            filter = { type: 0, color: BFColor.fromDEC(s[3]), offsetX: Math.cos((s[2] * Math.PI) / 180) * s[1], offsetY: Math.sin((s[2] * Math.PI) / 180) * s[1], blur: s[5], knockout: s[10] === true, onlyShadow: s[11] === true };
            break;
        }
        if (filter) res.push(filter);
      }
      return res.length === 0 ? undefined : res;
    }

    function getAdvanced(o, color) {
      var re = [{
        opacity: o.a !== undefined ? Number(o.a) : 1,
        time: o.l !== undefined ? Number(o.l) * 1000 : 0,
        color: color,
        rotate: { x: o.rx !== undefined ? -o.rx : 0, y: o.k !== undefined ? -o.k : 0, z: o.r !== undefined ? Number(o.r) : 0 },
        point: { x: o.p !== undefined && o.p.x !== undefined ? Number(o.p.x) : 0, y: o.p !== undefined && o.p.y !== undefined ? Number(o.p.y) : 0, z: o.pz !== undefined ? -o.pz : 0 },
        scale: { x: o.e !== undefined ? Number(o.e) : 1, y: o.f !== undefined ? Number(o.f) : 1, z: o.sz !== undefined ? Number(o.sz) : 1 },
        transition: 0,
      }];
      if (o.z) {
        var last = re[0];
        for (var i = 0; i < o.z.length; i++) {
          var _z = o.z[i];
          var f = {
            opacity: _z.t !== undefined ? Number(_z.t) : last.opacity,
            time: _z.l * 1000,
            color: _z.c !== undefined ? BFColor.fromDEC(Number(_z.c)) : last.color,
            rotate: { z: _z.d !== undefined ? _z.d : last.rotate.z, y: _z.e !== undefined ? -_z.e : last.rotate.y, x: _z.rx !== undefined ? -_z.rx : last.rotate.x },
            scale: { y: _z.g !== undefined ? Number(_z.g) : last.scale.y, x: _z.f !== undefined ? Number(_z.f) : last.scale.x, z: _z.sz !== undefined ? Number(_z.sz) : last.scale.z },
            point: { x: _z.x !== undefined ? Number(_z.x) : last.point.x, y: _z.y !== undefined ? Number(_z.y) : last.point.y, z: _z.z !== undefined ? -_z.z : last.point.z },
            transition: _z.v !== undefined ? Number(_z.v) : 1,
          };
          re.push(f);
          last = f;
        }
      }
      return re;
    }

    function parse(data) {
      parentList = {};
      waitForParent = {};
      waitForMask = {};
      var res = [];
      for (var i = 0; i < data.length; i++) {
        var item = data[i];
        var c = item.c.split(",");
        // 只处理 type=7 (c-m 高级弹幕)
        if (Number(c[2]) !== 7) continue;

        var id = "bf-o_" + Math.ceil(Math.random() * 10000000) + "_" + Math.ceil(Math.random() * 10000000);
        var color = BFColor.fromDEC(parseInt(c[1]));
        var advance = JSON.parse(item.m);
        var content = getContent(advance);
        var conf = getConfig(advance);
        var adv = getAdvanced(advance, color);

        var o = {
          id: id,
          content: content.content,
          startTime: (Number(c[0]) || 0) * 1000,
          anchor: conf.anchor !== undefined
            ? (AnchorType.hasOwnProperty(conf.anchor) ? AnchorType[conf.anchor] : conf.anchor)
            : AnchorType.leftTop,
          word: { bold: conf.word.bold, stroke: conf.word.stroke, size: Number(c[3]) || 25, font: conf.word.font || "微软雅黑" },
          contentType: content.type,
          zindex: conf.zindex,
          filter: conf.filter,
          frames: adv,
          parent: undefined,
          bm: conf.bm !== undefined ? parseBlendMode(conf.bm) : 0,
          mask: undefined,
        };

        if (advance.p) {
          o.parent = advance.p;
          if (parentList[advance.p]) { o.parent = parentList[advance.p]; }
          else { waitForParent[advance.p] = waitForParent[advance.p] || []; waitForParent[advance.p].push(o); }
        }
        parentList[advance.k || advance.id] = id;

        if (advance.mask) {
          if (parentList[advance.mask]) { o.mask = parentList[advance.mask]; }
          else { waitForMask[advance.mask] = waitForMask[advance.mask] || []; waitForMask[advance.mask].push(o); }
        }

        res.push(o);
      }

      for (var key in waitForParent) {
        if (parentList[key]) {
          var children = waitForParent[key];
          for (var j = 0; j < children.length; j++) children[j].parent = parentList[key];
        }
      }
      for (var key2 in waitForMask) {
        if (parentList[key2]) {
          var masks = waitForMask[key2];
          for (var k = 0; k < masks.length; k++) masks[k].mask = parentList[key2];
        }
      }

      return res;
    }

    return parse;
  })();

  // ==================== 弹幕数据获取 ====================
  function extractResourceId() {
    var m = location.pathname.match(/ac(\d+)/);
    return m ? m[1] : null;
  }

  // 新版API（大概率无type=7）
  async function fetchDanmakuListNew(resourceId, resourceType) {
    var res = await fetch("/rest/pc-direct/new-danmaku/list", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "resourceId=" + resourceId + "&resourceType=" + resourceType,
    });
    return res.json();
  }

  // 旧版弹幕API（可能还有 type=7 数据）
  async function fetchDanmakuListLegacy(resourceId, resourceType) {
    // 尝试旧弹幕池API
    var res = await fetch("/rest/pc-direct/danmaku/poll", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "videoId=" + resourceId + "&type=" + resourceType + "&position=0",
    });
    return res.json();
  }

  // 尝试直接从弹幕列表页获取
  async function fetchDanmakuPage(resourceId) {
    var res = await fetch(
      "/rest/pc-direct/danmaku/list?resourceId=" + resourceId + "&resourceType=douga&pageNo=1&pageSize=10000",
      { credentials: "include" }
    );
    return res.json();
  }

  // ==================== UI: 按钮 ====================
  function createButton(onClick) {
    var btn = document.createElement("button");
    btn.id = "bfdanmaku-btn";
    btn.textContent = "启用高级弹幕";
    btn.style.cssText = [
      "background: linear-gradient(135deg, #fd4e6d, #fda34b)",
      "color: #fff",
      "border: none",
      "border-radius: 4px",
      "padding: 6px 16px",
      "font-size: 14px",
      "font-weight: bold",
      "cursor: pointer",
      "margin-left: 12px",
      "transition: opacity 0.2s",
    ].join(";");

    btn.addEventListener("mouseenter", function () {
      btn.style.opacity = "0.85";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.opacity = "1";
    });
    btn.addEventListener("click", onClick);

    return btn;
  }

  function createStatusEl() {
    var el = document.createElement("span");
    el.id = "bfdanmaku-status";
    el.style.cssText = "font-size:12px;color:#999;margin-left:8px;";
    return el;
  }

  // 插入按钮到视频标题区域
  function insertButton(btn, statusEl) {
    // 尝试找到视频信息栏（标题旁的区域）
    var targets = [
      document.querySelector(".parts-info .parts-info__btns"),
      document.querySelector(".action-wrap"),
      document.querySelector(".video-info .tool-bar"),
      document.querySelector(".video-title"),
      document.querySelector("h1"),
    ];

    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t) {
        var wrap = document.createElement("span");
        wrap.style.cssText = "display:inline-flex;align-items:center;";
        wrap.appendChild(btn);
        wrap.appendChild(statusEl);
        t.parentElement && t.parentElement.insertBefore(wrap, t.nextSibling);
        return true;
      }
    }

    // fallback: 放在 .frame 上方
    var frame = document.querySelector(".frame");
    if (frame) {
      var wrap = document.createElement("div");
      wrap.style.cssText = "text-align:right;margin-bottom:4px;";
      wrap.appendChild(btn);
      wrap.appendChild(statusEl);
      frame.parentElement.insertBefore(wrap, frame);
      return true;
    }

    return false;
  }

  // ==================== 渲染核心 ====================
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

  function pushDanmakusToPool(danmakuData, pool) {
    if (!danmakuData || !danmakuData.danmakus) {
      // 兼容旧格式: 数组直接传入
      if (Array.isArray(danmakuData)) {
        var items = danmakuData;
      } else {
        return 0;
      }
    } else {
      var items = danmakuData.danmakus;
    }

    var count = 0;
    var advancedItems = [];
    var normalItems = [];

    for (var i = 0; i < items.length; i++) {
      var dm = items[i];
      if (dm.danmakuType === 7) advancedItems.push(dm);
      else normalItems.push(dm);
    }

    // 高级弹幕 -> AcfunParser
    if (advancedItems.length > 0) {
      try {
        var parsed = AcfunParser(advancedItems);
        for (var a = 0; a < parsed.length; a++) {
          pool.push(parsed[a]);
          count++;
        }
        if (DEV_MODE)
          console.log(
            "[BFDanmaku] 🎬 高级弹幕解析: " + parsed.length + " 条",
            parsed
          );
      } catch (e) {
        console.error("[BFDanmaku] 高级弹幕解析失败:", e);
      }
    }

    // 普通弹幕 -> DanmakuConfig
    for (var n = 0; n < normalItems.length; n++) {
      var dm2 = normalItems[n];
      var color = BFColor.fromDEC(dm2.color || 0xffffff);
      pool.push({
        id: "dm-" + dm2.danmakuId,
        content: dm2.body,
        startTime: dm2.position || 0,
        anchor: 0,
        word: { bold: false, stroke: false, size: dm2.size || 25, font: "微软雅黑" },
        contentType: 0,
        zindex: 0,
        filter: undefined,
        frames: [
          {
            opacity: 1,
            time: 10000,
            color: color,
            rotate: { x: 0, y: 0, z: 0 },
            point: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            transition: 0,
          },
        ],
        parent: undefined,
        bm: 0,
        mask: undefined,
      });
      count++;
    }

    return count;
  }

  // ==================== 工具 ====================
  function waitFor(selector, timeout) {
    timeout = timeout || 30000;
    return new Promise(function (resolve, reject) {
      var el = document.querySelector(selector);
      if (el) return resolve(el);
      var ob = new MutationObserver(function () {
        var e2 = document.querySelector(selector);
        if (e2) { ob.disconnect(); resolve(e2); }
      });
      ob.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () {
        ob.disconnect();
        reject(new Error("超时: " + selector));
      }, timeout);
    });
  }

  // ==================== 主逻辑 ====================
  async function main() {
    console.log("[BFDanmaku] 初始化...");

    // 1. 等引擎 (Tampermonkey 的 @require 会在脚本执行前加载完成)
    if (!window.DanmakuPool || !window.DanmakuStage) {
      console.error(
        "[BFDanmaku] 引擎未加载！请确认 @require 指向的 dist/BFDanmaku.js 可访问"
      );
      return;
    }
    console.log("[BFDanmaku] 引擎就绪");

    // 2. 等播放器
    var video;
    try {
      video = await waitFor("video");
    } catch (e) {
      console.error("[BFDanmaku] 未找到 video 元素:", e);
      return;
    }

    var container =
      document.querySelector(".frame") ||
      document.querySelector(".container-video") ||
      document.querySelector(".player-container") ||
      video.parentElement;

    console.log(
      "[BFDanmaku] 播放器就绪: " + video.videoWidth + "x" + video.videoHeight
    );

    // 3. 获取 resourceId
    var resourceId = extractResourceId();
    if (!resourceId) {
      console.error("[BFDanmaku] 无法从URL获取resourceId");
      return;
    }
    console.log("[BFDanmaku] resourceId:", resourceId);

    // 4. 创建舞台（放到点击回调里）
    var pool, stage, stageDiv;
    var engineReady = false;
    var statusEl = createStatusEl();
    statusEl.textContent = "就绪";

    function initEngine() {
      if (engineReady) return;
      stageDiv = createStageOverlay(container);
      var vw = video.videoWidth || 1280;
      var vh = video.videoHeight || 720;
      pool = new window.DanmakuPool();
      stage = new window.DanmakuStage(stageDiv, pool, vw, vh, {
        dev: DEV_MODE,
        baseWidth: 1280,
        performanceMode: true,
      });
      engineReady = true;

      // 视频事件绑定
      video.addEventListener("play", function () {
        stage.fix(video.currentTime * 1000);
        stage.start();
      });
      video.addEventListener("pause", function () {
        stage.stop();
      });
      video.addEventListener("ended", function () {
        stage.stop();
      });
      video.addEventListener("seeked", function () {
        stage.seek(video.currentTime * 1000);
      });
    }

    // 5. 按钮点击回调
    async function onEnableClick() {
      var btn = document.getElementById("bfdanmaku-btn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "加载中...";
      }
      statusEl.textContent = "正在获取弹幕...";

      try {
        // 先尝试新版API
        var listData = await fetchDanmakuListNew(resourceId, "douga");

        if (listData.result === 0 && listData.danmakus && listData.danmakus.length > 0) {
          // 统计类型
          var typeStats = {};
          for (var i = 0; i < listData.danmakus.length; i++) {
            var t = listData.danmakus[i].danmakuType;
            typeStats[t] = (typeStats[t] || 0) + 1;
          }
          console.log(
            "[BFDanmaku] 类型分布:",
            JSON.stringify(typeStats),
            typeStats["7"] ? "🎉有高级弹幕!" : "⚠️无type=7"
          );

          initEngine();
          var loaded = pushDanmakusToPool(listData, pool);
          statusEl.textContent = "已加载 " + loaded + " 条弹幕";
          if (btn) btn.textContent = "✓ 高级弹幕已启用";

          // 如果有 video 但还没播放，自动 seek 到开头
          if (video.paused) {
            stage.fix(0);
            stage.start();
          }

          console.log(
            "[BFDanmaku] ✅ 完成: " +
              loaded +
              " 条 | 类型: " +
              JSON.stringify(typeStats)
          );
        } else {
          // 新版API无数据，尝试旧版
          statusEl.textContent = "新版API无数据，尝试旧版...";
          console.log("[BFDanmaku] 新版API无弹幕，尝试旧API...");

          var legacyData = await fetchDanmakuPage(resourceId);
          if (
            legacyData.result === 0 &&
            legacyData.danmakus &&
            legacyData.danmakus.length > 0
          ) {
            initEngine();
            var loaded2 = pushDanmakusToPool(legacyData, pool);
            statusEl.textContent = "已加载 " + loaded2 + " 条(旧API)";
            if (btn) btn.textContent = "✓ 已启用";
            console.log("[BFDanmaku] ✅ 旧API加载: " + loaded2 + " 条");
          } else {
            statusEl.textContent = "无弹幕数据";
            if (btn) {
              btn.textContent = "无弹幕";
              btn.disabled = false;
            }
            console.warn("[BFDanmaku] 两个API都无数据");
          }
        }
      } catch (e) {
        console.error("[BFDanmaku] 加载失败:", e);
        statusEl.textContent = "错误: " + e.message;
        if (btn) {
          btn.textContent = "重试";
          btn.disabled = false;
        }
      }
    }

    // 5. 插入按钮
    var btn = createButton(onEnableClick);
    insertButton(btn, statusEl);

    console.log("[BFDanmaku] 🚀 等待点击 '启用高级弹幕'...");
  }

  // ==================== 启动 ====================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
